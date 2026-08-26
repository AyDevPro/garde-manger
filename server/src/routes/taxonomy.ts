import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, notFound, parse, wrap } from '../lib/http.js';

export const taxonomyRouter = Router();

// Emplacements et catégories partagent la même forme : une seule paire de
// handlers, paramétrée par la table.
type Kind = 'location' | 'category';

const listOf = (kind: Kind) =>
  wrap(async (req, res) => {
    const countExpr =
      kind === 'location'
        ? `(SELECT count(*) FROM batch b WHERE b.location_id = t.id AND b.status = 'active')`
        : `(SELECT count(*) FROM batch b JOIN product p ON p.id = b.product_id
             WHERE p.category_id = t.id AND b.status = 'active')`;
    const extra = kind === 'location' ? 't.kind' : 't.is_medicine';
    const { rows } = await query(
      `SELECT t.id, t.name, t.tone, t.position, ${extra}, ${countExpr} AS count
         FROM ${kind} t
        WHERE t.household_id = $1 AND t.archived_at IS NULL
        ORDER BY t.position, t.name`,
      [req.session!.household_id],
    );
    res.json(rows.map((r) => ({
      id: r.id, name: r.name, tone: r.tone, position: r.position,
      count: Number(r.count),
      ...(kind === 'location' ? { kind: r.kind } : { isMedicine: r.is_medicine }),
    })));
  });

const bodySchema = (kind: Kind) =>
  z.object({
    name: z.string().trim().min(1, 'nom requis').max(60),
    tone: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur invalide').optional(),
    position: z.number().int().min(0).max(999).optional(),
    ...(kind === 'location'
      ? { kind: z.enum(['frigo', 'congelateur', 'placard', 'pharmacie', 'autre']).optional() }
      : { isMedicine: z.boolean().optional() }),
  });

const createOf = (kind: Kind) =>
  wrap(async (req, res) => {
    const b = parse(bodySchema(kind), req.body) as any;
    const col = kind === 'location' ? 'kind' : 'is_medicine';
    const val = kind === 'location' ? (b.kind ?? 'autre') : Boolean(b.isMedicine);
    const dup = await one(
      `SELECT 1 FROM ${kind} WHERE household_id = $1 AND lower(name) = lower($2) AND archived_at IS NULL`,
      [req.session!.household_id, b.name],
    );
    if (dup) throw new HttpError(409, `« ${b.name} » existe déjà`);
    const pos = b.position ?? (await one(`SELECT COALESCE(max(position),-1)+1 AS p FROM ${kind} WHERE household_id=$1`,
      [req.session!.household_id]))!.p;
    const row = await one(
      `INSERT INTO ${kind} (household_id, name, tone, position, ${col})
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, tone, position`,
      [req.session!.household_id, b.name, b.tone ?? (kind === 'location' ? '#0A84FF' : '#AC8E68'), pos, val],
    );
    res.status(201).json({ ...row, count: 0 });
  });

const updateOf = (kind: Kind) =>
  wrap(async (req, res) => {
    const b = parse(bodySchema(kind).partial(), req.body) as any;
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (b.name !== undefined) push('name', b.name);
    if (b.tone !== undefined) push('tone', b.tone);
    if (b.position !== undefined) push('position', b.position);
    if (kind === 'location' && b.kind !== undefined) push('kind', b.kind);
    if (kind === 'category' && b.isMedicine !== undefined) push('is_medicine', b.isMedicine);
    if (!sets.length) throw new HttpError(400, 'Rien à modifier');
    vals.push(req.params.id, req.session!.household_id);
    const row = await one(
      `UPDATE ${kind} SET ${sets.join(', ')}
        WHERE id = $${vals.length - 1} AND household_id = $${vals.length} AND archived_at IS NULL
        RETURNING id, name, tone, position`,
      vals,
    );
    if (!row) throw notFound();
    res.json(row);
  });

// On archive plutôt que supprimer : l'historique garde du sens.
const archiveOf = (kind: Kind) =>
  wrap(async (req, res) => {
    const inUse = await one(
      kind === 'location'
        ? `SELECT count(*) AS n FROM batch WHERE location_id = $1 AND status = 'active'`
        : `SELECT count(*) AS n FROM batch b JOIN product p ON p.id = b.product_id
             WHERE p.category_id = $1 AND b.status = 'active'`,
      [req.params.id],
    );
    if (Number(inUse!.n) > 0 && req.query.force !== '1') {
      throw new HttpError(409,
        kind === 'location'
          ? `Cet emplacement contient encore ${inUse!.n} produit(s). Déplacez-les d'abord.`
          : `Cette catégorie contient encore ${inUse!.n} produit(s).`);
    }
    const row = await one(
      `UPDATE ${kind} SET archived_at = now() WHERE id = $1 AND household_id = $2 RETURNING id`,
      [req.params.id, req.session!.household_id],
    );
    if (!row) throw notFound();
    res.json({ ok: true });
  });

/** Réordonne d'un coup (glisser-déposer côté app). */
const reorderOf = (kind: Kind) =>
  wrap(async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1) }), req.body);
    for (const [i, id] of ids.entries()) {
      await query(`UPDATE ${kind} SET position = $1 WHERE id = $2 AND household_id = $3`,
        [i, id, req.session!.household_id]);
    }
    res.json({ ok: true });
  });

for (const kind of ['location', 'category'] as Kind[]) {
  const base = kind === 'location' ? '/locations' : '/categories';
  taxonomyRouter.get(base, listOf(kind));
  taxonomyRouter.post(base, createOf(kind));
  taxonomyRouter.post(`${base}/reorder`, reorderOf(kind));
  taxonomyRouter.patch(`${base}/:id`, updateOf(kind));
  taxonomyRouter.delete(`${base}/:id`, archiveOf(kind));
}
