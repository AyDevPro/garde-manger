import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { HttpError, notFound, parse, wrap } from '../lib/http.js';
import { BATCH_SELECT, logMovement, mapBatch } from '../lib/stock.js';
import { rememberBarcode } from '../lib/off.js';

export const stockRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ');
const dateType = z.enum(['DLC', 'DDM', 'EXP', 'NONE']);

const batchInput = z.object({
  id: z.string().uuid().optional(),
  locationId: z.string().uuid().nullable().optional(),
  qty: z.number().min(0).max(9999).optional(),
  unit: z.string().trim().max(40).optional(),
  dateType: dateType.optional(),
  bestBefore: isoDate.nullable().optional(),
  lotCode: z.string().trim().max(60).nullable().optional(),
  openedAt: isoDate.nullable().optional(),
  frozenAt: isoDate.nullable().optional(),
});

const productInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'le nom est requis').max(200),
  brand: z.string().trim().max(120).nullable().optional(),
  barcode: z.string().trim().regex(/^[0-9]{6,14}$/, 'code-barres invalide').nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  imageUrl: z.string().trim().max(600).nullable().optional(),
  packageText: z.string().trim().max(60).nullable().optional(),
  defaultUnit: z.string().trim().max(40).optional(),
  isMedicine: z.boolean().optional(),
  dosage: z.string().trim().max(60).nullable().optional(),
  medForm: z.string().trim().max(60).nullable().optional(),
  daysAfterOpening: z.number().int().min(0).max(3650).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isFavorite: z.boolean().optional(),
});

// ── Liste ───────────────────────────────────────────────────────
const SORTS: Record<string, string> = {
  // Les lots sans date passent en dernier, jamais au milieu.
  date: 'b.effective_date NULLS LAST, p.name',
  name: 'p.name, b.effective_date NULLS LAST',
  location: 'l.position NULLS LAST, b.effective_date NULLS LAST, p.name',
  recent: 'b.created_at DESC',
};

stockRouter.get('/stock', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const where: string[] = ["b.status = 'active'", 'b.household_id = $1', 'p.archived_at IS NULL'];
  const vals: unknown[] = [hid];
  const add = (clause: string, v: unknown) => { vals.push(v); where.push(clause.replace('?', `$${vals.length}`)); };

  const q = String(req.query.q ?? '').trim();
  if (q) add("(p.name || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.barcode,'')) ILIKE '%' || ? || '%'", q);
  if (req.query.location) add('b.location_id = ?', req.query.location);
  if (req.query.category) add('p.category_id = ?', req.query.category);
  if (req.query.opened === '1') where.push('b.opened_at IS NOT NULL');
  if (req.query.frozen === '1') where.push('b.frozen_at IS NOT NULL');
  if (req.query.favorite === '1') where.push('p.is_favorite');

  const bucket = String(req.query.bucket ?? '');
  const bucketSql: Record<string, string> = {
    expired: 'b.effective_date < CURRENT_DATE',
    today: 'b.effective_date = CURRENT_DATE',
    next3: 'b.effective_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 3',
    week: 'b.effective_date BETWEEN CURRENT_DATE + 4 AND CURRENT_DATE + 7',
    later: 'b.effective_date > CURRENT_DATE + 7',
    nodate: 'b.effective_date IS NULL',
    // « Urgent » du filtre rapide : tout ce qui est déjà dépassé ou l'est bientôt.
    urgent: 'b.effective_date IS NOT NULL AND b.effective_date <= CURRENT_DATE + 3',
  };
  if (bucketSql[bucket]) where.push(bucketSql[bucket]);

  const order = SORTS[String(req.query.sort ?? 'date')] ?? SORTS.date;
  const { rows } = await query(`${BATCH_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`, vals);
  res.json(rows.map(mapBatch));
}));

// ── Détail d'un lot (+ les autres lots du même produit) ──────────
stockRouter.get('/stock/:id', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const row = await one(`${BATCH_SELECT} WHERE b.id = $1 AND b.household_id = $2`, [req.params.id, hid]);
  if (!row) throw notFound('Ce lot n’existe plus');
  const item = mapBatch(row);
  const { rows: siblings } = await query(
    `${BATCH_SELECT} WHERE b.product_id = $1 AND b.status = 'active' AND b.id <> $2
      ORDER BY b.effective_date NULLS LAST`,
    [item.productId, item.id],
  );
  const { rows: history } = await query(
    `SELECT id, kind, qty_delta, label, created_at FROM movement
      WHERE product_id = $1 ORDER BY created_at DESC LIMIT 40`,
    [item.productId],
  );
  res.json({
    item,
    otherBatches: siblings.map(mapBatch),
    history: history.map((h) => ({
      id: h.id, kind: h.kind, qtyDelta: h.qty_delta === null ? null : Number(h.qty_delta),
      label: h.label, at: h.created_at,
    })),
  });
}));

// ── Création : produit (+ son premier lot) ──────────────────────
stockRouter.post('/products', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(productInput.extend({ batch: batchInput.optional() }), req.body);

  const result = await tx(async (c) => {
    // Un code-barres déjà connu du foyer réutilise sa fiche : le second achat
    // du même yaourt n'en crée pas un doublon, juste un nouveau lot.
    let product = body.barcode
      ? (await c.query(
          'SELECT * FROM product WHERE household_id = $1 AND barcode = $2 AND archived_at IS NULL',
          [hid, body.barcode],
        )).rows[0]
      : null;

    if (!product) {
      product = (await c.query(
        `INSERT INTO product (id, household_id, name, brand, barcode, category_id, image_url, package_text,
                              default_unit, is_medicine, dosage, med_form, days_after_opening, notes, is_favorite)
         VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [body.id ?? null, hid, body.name, body.brand ?? null, body.barcode ?? null, body.categoryId ?? null,
         body.imageUrl ?? null, body.packageText ?? null, body.defaultUnit ?? 'unités',
         body.isMedicine ?? false, body.dosage ?? null, body.medForm ?? null,
         body.daysAfterOpening ?? null, body.notes ?? null, body.isFavorite ?? false],
      )).rows[0];
    }

    const b = body.batch ?? {};
    const batch = (await c.query(
      `INSERT INTO batch (id, household_id, product_id, location_id, qty, unit, date_type, best_before,
                          lot_code, opened_at, frozen_at)
       VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [b.id ?? null, hid, product.id, b.locationId ?? null, b.qty ?? 1, b.unit ?? product.default_unit,
       b.dateType ?? (b.bestBefore ? 'DLC' : 'NONE'), b.bestBefore ?? null,
       b.lotCode ?? null, b.openedAt ?? null, b.frozenAt ?? null],
    )).rows[0];
    return { productId: product.id as string, batchId: batch.id as string, qty: b.qty ?? 1, locationId: b.locationId ?? null };
  });

  await logMovement({
    householdId: hid, productId: result.productId, batchId: result.batchId,
    kind: 'added', qtyDelta: result.qty, toLocationId: result.locationId,
    label: `${body.name} ajouté`,
  });
  // Le prochain scan du même code reconnaîtra le produit sans appel réseau.
  if (body.barcode) await rememberBarcode(body.barcode, body.name, body.brand ?? null, body.imageUrl ?? null);

  const row = await one(`${BATCH_SELECT} WHERE b.id = $1`, [result.batchId]);
  res.status(201).json(mapBatch(row!));
}));

stockRouter.patch('/products/:id', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(productInput.partial(), req.body);
  const cols: Record<string, unknown> = {
    name: body.name, brand: body.brand, barcode: body.barcode, category_id: body.categoryId,
    image_url: body.imageUrl, package_text: body.packageText, default_unit: body.defaultUnit,
    is_medicine: body.isMedicine, dosage: body.dosage, med_form: body.medForm,
    days_after_opening: body.daysAfterOpening, notes: body.notes, is_favorite: body.isFavorite,
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [col, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'Rien à modifier');
  vals.push(req.params.id, hid);
  const row = await one(
    `UPDATE product SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${vals.length - 1} AND household_id = $${vals.length} AND archived_at IS NULL
      RETURNING id, name`,
    vals,
  );
  if (!row) throw notFound('Produit introuvable');
  await logMovement({ householdId: hid, productId: row.id, kind: 'edited', label: `${row.name} modifié` });
  res.json({ ok: true });
}));

/** Archive la fiche et clôt ses lots : le produit sort du stock, l'historique reste. */
stockRouter.delete('/products/:id', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const row = await one(
    `UPDATE product SET archived_at = now(), updated_at = now()
      WHERE id = $1 AND household_id = $2 AND archived_at IS NULL RETURNING id, name`,
    [req.params.id, hid],
  );
  if (!row) throw notFound('Produit introuvable');
  await query(
    `UPDATE batch SET status = 'trashed', closed_at = now(), updated_at = now()
      WHERE product_id = $1 AND status = 'active'`,
    [row.id],
  );
  await logMovement({ householdId: hid, productId: row.id, kind: 'archived', label: `${row.name} retiré du stock` });
  res.json({ ok: true });
}));

// ── Lots ────────────────────────────────────────────────────────
stockRouter.post('/batches', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(batchInput.extend({ productId: z.string().uuid() }), req.body);
  const product = await one('SELECT id, name, default_unit FROM product WHERE id = $1 AND household_id = $2',
    [body.productId, hid]);
  if (!product) throw notFound('Produit introuvable');
  const row = await one(
    `INSERT INTO batch (id, household_id, product_id, location_id, qty, unit, date_type, best_before,
                        lot_code, opened_at, frozen_at)
     VALUES (COALESCE($1, gen_random_uuid()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [body.id ?? null, hid, product.id, body.locationId ?? null, body.qty ?? 1, body.unit ?? product.default_unit,
     body.dateType ?? (body.bestBefore ? 'DLC' : 'NONE'), body.bestBefore ?? null,
     body.lotCode ?? null, body.openedAt ?? null, body.frozenAt ?? null],
  );
  await logMovement({
    householdId: hid, productId: product.id, batchId: row!.id, kind: 'added',
    qtyDelta: body.qty ?? 1, toLocationId: body.locationId ?? null,
    label: `${product.name} — nouveau lot`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [row!.id]);
  res.status(201).json(mapBatch(full!));
}));

stockRouter.patch('/batches/:id', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(batchInput, req.body);
  const cols: Record<string, unknown> = {
    location_id: body.locationId, qty: body.qty, unit: body.unit, date_type: body.dateType,
    best_before: body.bestBefore, lot_code: body.lotCode, opened_at: body.openedAt, frozen_at: body.frozenAt,
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [col, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) throw new HttpError(400, 'Rien à modifier');
  vals.push(req.params.id, hid);
  const row = await one(
    `UPDATE batch SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${vals.length - 1} AND household_id = $${vals.length} RETURNING id, product_id`,
    vals,
  );
  if (!row) throw notFound('Lot introuvable');
  const edited = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id, kind: 'edited',
    label: `${edited!.name} — lot modifié`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [row.id]);
  res.json(mapBatch(full!));
}));

/** −1 consommé (ou −N). Le lot tombé à zéro reste visible jusqu'au choix de l'utilisateur. */
stockRouter.post('/batches/:id/consume', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const { qty } = parse(z.object({ qty: z.number().min(0.01).max(9999).default(1) }), req.body ?? {});
  const row = await one(
    `UPDATE batch SET qty = GREATEST(0, qty - $1), updated_at = now()
      WHERE id = $2 AND household_id = $3 AND status = 'active'
      RETURNING id, product_id, qty, unit`,
    [qty, req.params.id, hid],
  );
  if (!row) throw notFound('Lot introuvable');
  const p = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id, kind: 'consumed',
    qtyDelta: -qty, label: `${p!.name} consommé`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [row.id]);
  res.json({ item: mapBatch(full!), depleted: Number(row.qty) === 0, productName: p!.name });
}));

/** Jeté ou terminé : le lot sort du stock mais reste dans l'historique. */
stockRouter.post('/batches/:id/close', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const { reason } = parse(z.object({ reason: z.enum(['consumed', 'trashed']).default('consumed') }), req.body ?? {});
  const row = await one(
    `UPDATE batch SET status = $1, qty = 0, closed_at = now(), updated_at = now()
      WHERE id = $2 AND household_id = $3 AND status = 'active' RETURNING id, product_id`,
    [reason, req.params.id, hid],
  );
  if (!row) throw notFound('Lot introuvable');
  const p = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id, kind: reason,
    label: reason === 'trashed' ? `${p!.name} jeté` : `${p!.name} terminé`,
  });
  res.json({ ok: true, productName: p!.name });
}));

/** Réouvre un lot fermé par erreur — c'est le « Annuler » du bandeau. */
stockRouter.post('/batches/:id/reopen', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const { qty } = parse(z.object({ qty: z.number().min(0).max(9999) }), req.body ?? {});
  const row = await one(
    `UPDATE batch SET status = 'active', qty = $1, closed_at = NULL, updated_at = now()
      WHERE id = $2 AND household_id = $3 RETURNING id, product_id`,
    [qty, req.params.id, hid],
  );
  if (!row) throw notFound('Lot introuvable');
  const restored = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id, kind: 'restored',
    label: `${restored!.name} — action annulée`,
  });
  res.json({ ok: true });
}));

/** Ouvert : la date d'ouverture peut avancer l'échéance (X jours après ouverture). */
stockRouter.post('/batches/:id/open', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(z.object({
    openedAt: isoDate.nullable().optional(),
    daysAfterOpening: z.number().int().min(0).max(3650).nullable().optional(),
  }), req.body ?? {});
  const opened = body.openedAt === undefined ? new Date().toISOString().slice(0, 10) : body.openedAt;
  const row = await one(
    `UPDATE batch SET opened_at = $1, updated_at = now()
      WHERE id = $2 AND household_id = $3 AND status = 'active' RETURNING id, product_id`,
    [opened, req.params.id, hid],
  );
  if (!row) throw notFound('Lot introuvable');
  if (body.daysAfterOpening !== undefined) {
    await query('UPDATE product SET days_after_opening = $1, updated_at = now() WHERE id = $2',
      [body.daysAfterOpening, row.product_id]);
  }
  const openedProduct = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id,
    kind: opened ? 'opened' : 'edited',
    label: opened ? `${openedProduct!.name} ouvert` : `${openedProduct!.name} — ouverture annulée`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [row.id]);
  res.json(mapBatch(full!));
}));

stockRouter.post('/batches/:id/move', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const { locationId } = parse(z.object({ locationId: z.string().uuid().nullable() }), req.body);
  const before = await one('SELECT location_id, product_id FROM batch WHERE id = $1 AND household_id = $2',
    [req.params.id, hid]);
  if (!before) throw notFound('Lot introuvable');
  const dest = locationId
    ? await one('SELECT id, name, kind FROM location WHERE id = $1 AND household_id = $2', [locationId, hid])
    : null;
  if (locationId && !dest) throw notFound('Emplacement introuvable');

  // Un passage au congélateur date la congélation ; un retour la lève.
  const goingToFreezer = dest?.kind === 'congelateur';
  await query(
    `UPDATE batch SET location_id = $1,
            frozen_at = CASE WHEN $2 THEN COALESCE(frozen_at, CURRENT_DATE) ELSE frozen_at END,
            thawed_at = CASE WHEN $2 THEN NULL ELSE thawed_at END,
            updated_at = now()
      WHERE id = $3`,
    [locationId, goingToFreezer, req.params.id],
  );
  const p = await one('SELECT name FROM product WHERE id = $1', [before.product_id]);
  await logMovement({
    householdId: hid, productId: before.product_id, batchId: req.params.id,
    kind: goingToFreezer ? 'frozen' : 'moved',
    fromLocationId: before.location_id, toLocationId: locationId,
    label: `${p!.name} déplacé vers ${dest?.name ?? 'aucun emplacement'}`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [req.params.id]);
  res.json({ item: mapBatch(full!), destination: dest?.name ?? null });
}));

/** Décongélation : on note la date et on laisse l'utilisateur fixer une nouvelle échéance. */
stockRouter.post('/batches/:id/thaw', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const body = parse(z.object({
    locationId: z.string().uuid().nullable().optional(),
    bestBefore: isoDate.nullable().optional(),
  }), req.body ?? {});
  const row = await one(
    `UPDATE batch SET thawed_at = CURRENT_DATE, frozen_at = NULL,
            location_id = COALESCE($1, location_id),
            best_before = COALESCE($2, best_before),
            updated_at = now()
      WHERE id = $3 AND household_id = $4 AND status = 'active' RETURNING id, product_id`,
    [body.locationId ?? null, body.bestBefore ?? null, req.params.id, hid],
  );
  if (!row) throw notFound('Lot introuvable');
  const thawed = await one('SELECT name FROM product WHERE id = $1', [row.product_id]);
  await logMovement({
    householdId: hid, productId: row.product_id, batchId: row.id, kind: 'thawed',
    label: `${thawed!.name} décongelé`,
  });
  const full = await one(`${BATCH_SELECT} WHERE b.id = $1`, [row.id]);
  res.json(mapBatch(full!));
}));

stockRouter.delete('/batches/:id', wrap(async (req, res) => {
  const hid = req.session!.household_id;
  const row = await one('DELETE FROM batch WHERE id = $1 AND household_id = $2 RETURNING product_id', [req.params.id, hid]);
  if (!row) throw notFound('Lot introuvable');
  res.json({ ok: true });
}));
