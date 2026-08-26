/**
 * Décodage GS1 des DataMatrix imprimés sur les boîtes de médicaments.
 * Identifiants utiles : 01 = code produit, 17 = péremption, 10 = lot, 21 = numéro de série.
 */
export type Gs1 = { gtin?: string; expiry?: string; lot?: string; serial?: string };

// Séparateur des champs de longueur variable (ASCII 29).
const GS = String.fromCharCode(29);
const FIXED: Record<string, number> = { '00': 18, '01': 14, '11': 6, '15': 6, '16': 6, '17': 6, '20': 2 };

export function parseGs1(raw: string): Gs1 | null {
  let s = raw.replace(/^\]d2/i, '').replace(/^\]C1/i, '');
  if (!/^(01|17|10|21|00|11|15|16)/.test(s)) return null;

  const out: Gs1 = {};
  let guard = 0;
  while (s.length >= 2 && guard++ < 24) {
    const ai = s.slice(0, 2);
    s = s.slice(2);
    const fixedLen = FIXED[ai];
    let value: string;
    if (fixedLen !== undefined) {
      value = s.slice(0, fixedLen);
      s = s.slice(fixedLen);
    } else {
      const end = s.indexOf(GS);
      value = end === -1 ? s : s.slice(0, end);
      s = end === -1 ? '' : s.slice(end + 1);
    }
    if (!value) break;
    if (ai === '01') out.gtin = value.replace(/^0+(?=\d{8,})/, '');
    else if (ai === '17') out.expiry = yymmddToIso(value);
    else if (ai === '10') out.lot = value;
    else if (ai === '21') out.serial = value;
    // Un séparateur peut suivre un champ de longueur fixe.
    if (s.startsWith(GS)) s = s.slice(1);
  }
  return out.gtin || out.expiry || out.lot ? out : null;
}

/** « 260930 » → 2026-09-30. Un jour à 00 signifie « fin du mois ». */
function yymmddToIso(v: string): string | undefined {
  if (!/^\d{6}$/.test(v)) return undefined;
  const year = 2000 + Number(v.slice(0, 2));
  const month = Number(v.slice(2, 4));
  let day = Number(v.slice(4, 6));
  if (month < 1 || month > 12) return undefined;
  if (day === 0) day = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
