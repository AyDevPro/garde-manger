import type { DateType, Urgency } from '../types';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDaysIso = (days: number, from = todayIso()) => {
  const [y, m, d] = from.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

/** « 2 sept. » (court) ou « 2 septembre 2026 » (long). */
export function frDate(iso: string | null, short = false) {
  if (!iso) return 'Sans date';
  const [y, m, d] = iso.split('-').map(Number);
  return short ? `${d} ${MOIS[m - 1]}` : `${d} ${MOIS_LONG[m - 1]} ${y}`;
}

/** « Mercredi 26 août » — l'en-tête de l'accueil. */
export function frToday() {
  const d = new Date();
  const jour = JOURS[d.getDay()];
  return `${jour[0].toUpperCase()}${jour.slice(1)} ${d.getDate()} ${MOIS_LONG[d.getMonth()]}`;
}

/** Jours restants avant une date, du point de vue de l'appareil. */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86_400_000);
}

/** Le même découpage que le serveur, pour recalculer hors ligne. */
export function urgencyOf(daysLeft: number | null): Urgency {
  if (daysLeft === null) return 'nodate';
  if (daysLeft < 0) return 'expired';
  if (daysLeft === 0) return 'today';
  if (daysLeft <= 3) return 'next3';
  if (daysLeft <= 7) return 'week';
  return 'later';
}

export const URGENCY_COLOR: Record<Urgency, string> = {
  expired: 'var(--red)',
  today: 'var(--red)',
  next3: 'var(--orange)',
  week: 'var(--yellow)',
  later: 'rgba(235,235,245,.6)',
  nodate: 'rgba(235,235,245,.45)',
};

export const URGENCY_TINT: Record<Urgency, string> = {
  expired: 'rgba(255,69,58,.16)',
  today: 'rgba(255,69,58,.16)',
  next3: 'rgba(255,159,10,.16)',
  week: 'rgba(255,214,10,.14)',
  later: 'rgba(255,255,255,.08)',
  nodate: 'rgba(255,255,255,.07)',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  expired: 'Expirés',
  today: "Aujourd'hui",
  next3: '3 prochains jours',
  week: 'Cette semaine',
  later: 'Plus tard',
  nodate: 'Sans date',
};

/** L'étiquette d'une pastille : « Expiré · 2 j », « Aujourd'hui », « Dans 5 j ». */
export function urgencyBadge(urgency: Urgency, daysLeft: number | null) {
  if (urgency === 'nodate' || daysLeft === null) return 'Sans date';
  if (daysLeft < 0) return `Expiré · ${Math.abs(daysLeft)} j`;
  if (daysLeft === 0) return "Aujourd'hui";
  if (daysLeft === 1) return 'Demain';
  return `Dans ${daysLeft} j`;
}

export const HERO: Record<Urgency, string> = {
  expired: 'linear-gradient(#7E1B13,#2A0C08 82%)',
  today: 'linear-gradient(#7E1B13,#2A0C08 82%)',
  next3: 'linear-gradient(#7A4A06,#2A1A04 82%)',
  week: 'linear-gradient(#6E5A05,#241D03 82%)',
  later: 'linear-gradient(#14432A,#0A1A11 82%)',
  nodate: 'linear-gradient(#2C2C2E,#111 82%)',
};

export const DATE_TYPE_LABEL: Record<DateType, string> = {
  DLC: 'À consommer jusqu’au',
  DDM: 'À consommer de préférence avant',
  EXP: 'Date d’expiration',
  NONE: 'Sans date',
};

export const DATE_TYPE_SHORT: Record<DateType, string> = {
  DLC: 'DLC', DDM: 'DDM', EXP: 'EXP', NONE: '—',
};

export const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

export const qtyLabel = (qty: number, unit: string) => {
  const n = Number.isInteger(qty) ? qty : Number(qty.toFixed(2));
  return `${n} ${unit}`;
};

export const MOVEMENT_LABEL: Record<string, string> = {
  added: 'Ajouté', consumed: 'Consommé', trashed: 'Jeté', moved: 'Déplacé',
  edited: 'Modifié', opened: 'Ouvert', frozen: 'Congelé', thawed: 'Décongelé',
  archived: 'Retiré', restored: 'Restauré',
};
