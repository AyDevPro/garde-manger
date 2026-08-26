import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { HttpError, notFound, parse, wrap } from '../lib/http.js';

export const miscRouter = Router();

// ── Historique des mouvements ───────────────────────────────────
miscRouter.get('/movements', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 60), 300);
  const { rows } = await query(
    `SELECT m.id, m.kind, m.qty_delta, m.label, m.created_at,
            p.name AS product_name, p.id AS product_id,
            lf.name AS from_name, lt.name AS to_name
       FROM movement m
       LEFT JOIN product  p  ON p.id  = m.product_id
       LEFT JOIN location lf ON lf.id = m.from_location_id
       LEFT JOIN location lt ON lt.id = m.to_location_id
      WHERE m.household_id = $1
      ORDER BY m.created_at DESC LIMIT $2`,
    [req.session!.household_id, limit],
  );
  res.json(rows.map((m) => ({
    id: m.id, kind: m.kind, qtyDelta: m.qty_delta === null ? null : Number(m.qty_delta),
    label: m.label, at: m.created_at, productId: m.product_id, productName: m.product_name,
    from: m.from_name, to: m.to_name,
  })));
}));

// ── Export CSV ──────────────────────────────────────────────────
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

miscRouter.get('/export.csv', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT p.name, p.brand, p.barcode, c.name AS categorie, l.name AS emplacement,
            b.qty, b.unit, b.date_type, b.best_before, b.effective_date, b.lot_code,
            b.opened_at, b.frozen_at, b.status,
            to_char(b.created_at, 'YYYY-MM-DD') AS created_at
       FROM batch_effective b
       JOIN product p ON p.id = b.product_id
       LEFT JOIN location l ON l.id = b.location_id
       LEFT JOIN category c ON c.id = p.category_id
      WHERE b.household_id = $1 AND b.status = 'active' AND p.archived_at IS NULL
      ORDER BY b.effective_date NULLS LAST, p.name`,
    [req.session!.household_id],
  );
  const header = [
    'Produit', 'Marque', 'Code-barres', 'Catégorie', 'Emplacement', 'Quantité', 'Unité',
    'Type de date', 'Date', 'Date effective', 'Lot', 'Ouvert le', 'Congelé le', 'Statut', 'Ajouté le',
  ];
  // Séparateur ';' : Excel FR l'attend, et le BOM évite les accents cassés.
  const lines = [header.join(';'), ...rows.map((r) => Object.values(r).map(csvCell).join(';'))];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="garde-manger-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}));

// ── Liste de courses ────────────────────────────────────────────
miscRouter.get('/shopping', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, label, qty, checked_at, product_id, created_at FROM shopping_item
      WHERE household_id = $1 ORDER BY checked_at NULLS FIRST, created_at DESC`,
    [req.session!.household_id],
  );
  res.json(rows.map((r) => ({
    id: r.id, label: r.label, qty: Number(r.qty), productId: r.product_id, checked: !!r.checked_at,
  })));
}));

miscRouter.post('/shopping', wrap(async (req, res) => {
  const b = parse(z.object({
    label: z.string().trim().min(1, 'libellé requis').max(120),
    qty: z.number().min(0).max(999).optional(),
    productId: z.string().uuid().nullable().optional(),
  }), req.body);
  const row = await one(
    `INSERT INTO shopping_item (household_id, label, qty, product_id) VALUES ($1,$2,$3,$4)
     RETURNING id, label, qty, product_id`,
    [req.session!.household_id, b.label, b.qty ?? 1, b.productId ?? null],
  );
  res.status(201).json({ id: row!.id, label: row!.label, qty: Number(row!.qty), productId: row!.product_id, checked: false });
}));

miscRouter.patch('/shopping/:id', wrap(async (req, res) => {
  const b = parse(z.object({ checked: z.boolean() }), req.body);
  const row = await one(
    `UPDATE shopping_item SET checked_at = CASE WHEN $1 THEN now() ELSE NULL END
      WHERE id = $2 AND household_id = $3 RETURNING id`,
    [b.checked, req.params.id, req.session!.household_id],
  );
  if (!row) throw notFound();
  res.json({ ok: true });
}));

miscRouter.delete('/shopping/:id', wrap(async (req, res) => {
  await query('DELETE FROM shopping_item WHERE id = $1 AND household_id = $2',
    [req.params.id, req.session!.household_id]);
  res.json({ ok: true });
}));

// ── Photo produit ajoutée à la main ─────────────────────────────
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

miscRouter.post('/uploads', wrap(async (req, res) => {
  const { dataUrl } = parse(z.object({ dataUrl: z.string().max(8_000_000) }), req.body);
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Image invalide');
  const ext = MIME_EXT[m[1]];
  if (!ext) throw new HttpError(400, 'Format accepté : JPEG, PNG ou WebP');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5_000_000) throw new HttpError(413, 'Image trop lourde (5 Mo maximum)');
  await mkdir(config.uploadsDir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(config.uploadsDir, name), buf);
  res.status(201).json({ url: `/uploads/${name}` });
}));
