import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { parse, wrap } from '../lib/http.js';
import { isBarcode, lookupBarcode } from '../lib/off.js';

export const lookupRouter = Router();

/** Base locale d'abord, Open Food Facts ensuite. */
lookupRouter.get('/lookup/:barcode', wrap(async (req, res) => {
  const code = String(req.params.barcode).trim();
  if (!isBarcode(code)) return res.status(400).json({ error: 'Code-barres invalide (8 à 14 chiffres)' });
  res.json(await lookupBarcode(req.session!.household_id, code));
}));

/** Produits récemment ajoutés — la base de l'ajout rapide. */
lookupRouter.get('/recent-products', wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT DISTINCT ON (p.id) p.id, p.name, p.brand, p.barcode, p.image_url, p.default_unit,
            p.category_id, p.days_after_opening, p.is_medicine, max(b.created_at) AS last_added
       FROM product p JOIN batch b ON b.product_id = p.id
      WHERE p.household_id = $1 AND p.archived_at IS NULL
      GROUP BY p.id
      ORDER BY p.id, last_added DESC`,
    [req.session!.household_id],
  );
  const sorted = rows
    .sort((a, b) => String(b.last_added).localeCompare(String(a.last_added)))
    .slice(0, 24);
  res.json(sorted.map((p) => ({
    id: p.id, name: p.name, brand: p.brand, barcode: p.barcode, imageUrl: p.image_url,
    defaultUnit: p.default_unit, categoryId: p.category_id,
    daysAfterOpening: p.days_after_opening, isMedicine: p.is_medicine,
  })));
}));

/** Confirmation manuelle d'une date lue sur l'emballage (écran « Scanner la date »). */
lookupRouter.post('/parse-date', wrap(async (req, res) => {
  const { text } = parse(z.object({ text: z.string().max(400) }), req.body);
  res.json({ candidates: extractDates(text) });
}));

/**
 * Repère les dates dans un texte brut (OCR ou saisie). Toujours confirmé à la main :
 * une date mal lue est pire qu'une date absente.
 */
export function extractDates(text: string) {
  const out: { iso: string; raw: string; dateType: 'DLC' | 'DDM' | 'EXP' | null }[] = [];
  // Les plages déjà consommées : « 02/09/2026 » ne doit pas aussi produire « 09/2026 ».
  const taken: [number, number][] = [];
  const overlaps = (i: number, len: number) => taken.some(([a, b]) => i < b && i + len > a);
  const claim = (i: number, len: number) => taken.push([i, i + len]);
  const hint = /consommer jusqu|à consommer jusqu|\bDLC\b/i.test(text)
    ? 'DLC' as const
    : /préférence avant|\bDDM\b|\bDLUO\b/i.test(text)
      ? 'DDM' as const
      : /\bEXP\b|expir/i.test(text)
        ? 'EXP' as const
        : null;
  const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

  // 02/09/2026 · 02-09-26 · 02.09.2026
  for (const m of text.matchAll(/\b(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{2,4})\b/g)) {
    const iso = toIso(+m[1], +m[2], +m[3]);
    if (!iso) continue;
    claim(m.index!, m[0].length);
    out.push({ iso, raw: m[0], dateType: hint });
  }
  // 09/2026 (mois seul) → dernier jour du mois
  for (const m of text.matchAll(/\b(\d{1,2})[\/.\-](\d{4})\b/g)) {
    const mo = +m[1], yr = +m[2];
    if (mo >= 1 && mo <= 12 && !overlaps(m.index!, m[0].length)) {
      const last = new Date(yr, mo, 0).getDate();
      const iso = toIso(last, mo, yr);
      if (iso && !out.some((o) => o.iso === iso)) { claim(m.index!, m[0].length); out.push({ iso, raw: m[0], dateType: hint }); }
    }
  }
  // 2 sept. 2026
  for (const m of text.matchAll(/\b(\d{1,2})\s*([a-zéûà]{3,5})\.?\s*(\d{2,4})\b/gi)) {
    const idx = MONTHS.findIndex((x) => m[2].toLowerCase().startsWith(x.slice(0, 3)));
    if (idx >= 0 && !overlaps(m.index!, m[0].length)) {
      const iso = toIso(+m[1], idx + 1, +m[3]);
      if (iso && !out.some((o) => o.iso === iso)) { claim(m.index!, m[0].length); out.push({ iso, raw: m[0], dateType: hint }); }
    }
  }
  return out.slice(0, 5);
}

function toIso(d: number, m: number, y: number) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
