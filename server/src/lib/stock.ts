import { query } from '../db.js';

export type Urgency = 'expired' | 'today' | 'next3' | 'week' | 'later' | 'nodate';

/** Le code couleur d'urgence, identique côté serveur et côté app. */
export function urgencyOf(daysLeft: number | null): Urgency {
  if (daysLeft === null) return 'nodate';
  if (daysLeft < 0) return 'expired';
  if (daysLeft === 0) return 'today';
  if (daysLeft <= 3) return 'next3';
  if (daysLeft <= 7) return 'week';
  return 'later';
}

/**
 * Une ligne de stock = un lot. Deux lots du même produit gardent leurs dates
 * distinctes (4 yaourts vendredi, 8 la semaine suivante).
 */
export const BATCH_SELECT = `
  SELECT b.id, b.product_id, b.qty, b.unit, b.date_type, b.best_before, b.lot_code,
         b.opened_at, b.frozen_at, b.thawed_at, b.status, b.created_at, b.updated_at,
         b.effective_date, b.date_from_opening, b.days_after_opening,
         (b.effective_date - CURRENT_DATE)          AS days_left,
         p.name, p.brand, p.barcode, p.image_url, p.package_text,
         p.is_medicine, p.dosage, p.med_form, p.notes, p.is_favorite,
         l.id AS location_id, l.name AS location_name, l.tone AS location_tone, l.kind AS location_kind,
         c.id AS category_id, c.name AS category_name, c.tone AS category_tone
    FROM batch_effective b
    JOIN product  p ON p.id = b.product_id
    LEFT JOIN location l ON l.id = b.location_id
    LEFT JOIN category c ON c.id = p.category_id`;

export type BatchRow = Record<string, any>;

export function mapBatch(r: BatchRow) {
  const daysLeft: number | null = r.days_left === null || r.days_left === undefined ? null : Number(r.days_left);
  return {
    id: r.id as string,
    productId: r.product_id as string,
    name: r.name as string,
    brand: (r.brand ?? null) as string | null,
    barcode: (r.barcode ?? null) as string | null,
    imageUrl: (r.image_url ?? null) as string | null,
    packageText: (r.package_text ?? null) as string | null,
    qty: Number(r.qty),
    unit: r.unit as string,
    dateType: r.date_type as 'DLC' | 'DDM' | 'EXP' | 'NONE',
    bestBefore: (r.best_before ?? null) as string | null,
    effectiveDate: (r.effective_date ?? null) as string | null,
    dateFromOpening: Boolean(r.date_from_opening),
    daysLeft,
    urgency: urgencyOf(daysLeft),
    openedAt: (r.opened_at ?? null) as string | null,
    frozenAt: (r.frozen_at ?? null) as string | null,
    thawedAt: (r.thawed_at ?? null) as string | null,
    daysAfterOpening: r.days_after_opening === null ? null : Number(r.days_after_opening),
    lotCode: (r.lot_code ?? null) as string | null,
    status: r.status as 'active' | 'consumed' | 'trashed',
    isMedicine: Boolean(r.is_medicine),
    dosage: (r.dosage ?? null) as string | null,
    medForm: (r.med_form ?? null) as string | null,
    notes: (r.notes ?? null) as string | null,
    isFavorite: Boolean(r.is_favorite),
    locationId: (r.location_id ?? null) as string | null,
    locationName: (r.location_name ?? 'Sans emplacement') as string,
    locationTone: (r.location_tone ?? '#8E8E93') as string,
    locationKind: (r.location_kind ?? 'autre') as string,
    categoryId: (r.category_id ?? null) as string | null,
    categoryName: (r.category_name ?? null) as string | null,
    categoryTone: (r.category_tone ?? '#8E8E93') as string,
    createdAt: r.created_at as string,
  };
}

export type StockItem = ReturnType<typeof mapBatch>;

/** Journalise un mouvement. Toujours appelé après l'écriture qu'il décrit. */
export async function logMovement(opts: {
  householdId: string;
  productId?: string | null;
  batchId?: string | null;
  kind: string;
  qtyDelta?: number | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  label: string;
}) {
  await query(
    `INSERT INTO movement (household_id, product_id, batch_id, kind, qty_delta,
                           from_location_id, to_location_id, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      opts.householdId, opts.productId ?? null, opts.batchId ?? null, opts.kind,
      opts.qtyDelta ?? null, opts.fromLocationId ?? null, opts.toLocationId ?? null, opts.label,
    ],
  );
}
