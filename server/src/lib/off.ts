import { config } from '../config.js';
import { one, query } from '../db.js';

export type Lookup = {
  barcode: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
  packageText: string | null;
  categoryHint: string | null;
  source: 'stock' | 'cache' | 'off' | 'none';
  productId?: string;
};

/** Un code-barres EAN/UPC : 8 à 14 chiffres. */
export function isBarcode(code: string) {
  return /^[0-9]{8,14}$/.test(code);
}

/**
 * Résolution d'un code-barres, du moins cher au plus cher :
 *   1. un produit déjà dans le stock du foyer  → ajout en deux gestes
 *   2. le cache local des codes déjà rencontrés
 *   3. Open Food Facts (puis mis en cache)
 */
export async function lookupBarcode(householdId: string, barcode: string): Promise<Lookup> {
  const local = await one(
    `SELECT p.id, p.name, p.brand, p.image_url, p.package_text, c.name AS cat
       FROM product p LEFT JOIN category c ON c.id = p.category_id
      WHERE p.household_id = $1 AND p.barcode = $2 AND p.archived_at IS NULL
      LIMIT 1`,
    [householdId, barcode],
  );
  if (local) {
    return {
      barcode, name: local.name, brand: local.brand, imageUrl: local.image_url,
      packageText: local.package_text, categoryHint: local.cat, source: 'stock', productId: local.id,
    };
  }

  const cached = await one('SELECT * FROM barcode_cache WHERE barcode = $1', [barcode]);
  if (cached) {
    await query('UPDATE barcode_cache SET hits = hits + 1 WHERE barcode = $1', [barcode]);
    return {
      barcode, name: cached.name, brand: cached.brand, imageUrl: cached.image_url,
      packageText: cached.package_text, categoryHint: cached.category_hint, source: 'cache',
    };
  }

  const fetched = await fetchOpenFoodFacts(barcode);
  if (!fetched) return { barcode, name: null, brand: null, imageUrl: null, packageText: null, categoryHint: null, source: 'none' };

  await query(
    `INSERT INTO barcode_cache (barcode, name, brand, image_url, package_text, category_hint, source, payload)
     VALUES ($1,$2,$3,$4,$5,$6,'off',$7)
     ON CONFLICT (barcode) DO UPDATE SET
       name = EXCLUDED.name, brand = EXCLUDED.brand, image_url = EXCLUDED.image_url,
       package_text = EXCLUDED.package_text, category_hint = EXCLUDED.category_hint,
       fetched_at = now()`,
    [barcode, fetched.name, fetched.brand, fetched.imageUrl, fetched.packageText, fetched.categoryHint, fetched.payload],
  );
  return { ...fetched, barcode, source: 'off' };
}

/** Mémorise un produit nommé à la main pour que le prochain scan le reconnaisse. */
export async function rememberBarcode(barcode: string, name: string, brand: string | null, imageUrl: string | null) {
  if (!isBarcode(barcode)) return;
  await query(
    `INSERT INTO barcode_cache (barcode, name, brand, image_url, source)
     VALUES ($1,$2,$3,$4,'manual')
     ON CONFLICT (barcode) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, barcode_cache.name),
       brand = COALESCE(EXCLUDED.brand, barcode_cache.brand),
       image_url = COALESCE(EXCLUDED.image_url, barcode_cache.image_url),
       source = 'manual', fetched_at = now()`,
    [barcode, name, brand, imageUrl],
  );
}

const OFF_FIELDS =
  'product_name,product_name_fr,generic_name_fr,brands,image_front_url,image_url,quantity,categories';

async function fetchOpenFoodFacts(barcode: string) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': config.offUserAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    if (body.status !== 1 || !body.product) return null;
    const p = body.product;
    const name: string | null = p.product_name_fr || p.product_name || p.generic_name_fr || null;
    if (!name) return null;
    return {
      name: String(name).trim().slice(0, 200),
      brand: p.brands ? String(p.brands).split(',')[0].trim().slice(0, 120) : null,
      imageUrl: p.image_front_url || p.image_url || null,
      packageText: p.quantity ? String(p.quantity).trim().slice(0, 60) : null,
      categoryHint: p.categories ? String(p.categories).split(',').pop()!.trim().slice(0, 80) : null,
      payload: p,
    };
  } catch {
    // Hors ligne ou Open Food Facts injoignable : ce n'est pas une erreur bloquante,
    // l'utilisateur nommera le produit à la main.
    return null;
  }
}
