import type { Dashboard, StockItem } from '../types';
import type { Intent, Pending } from './offline';
import { daysUntil, urgencyOf } from './format';

/**
 * Rejoue les écritures en attente par-dessus les données affichées, qu'elles
 * viennent du réseau ou du cache. Sans ça, un « −1 consommé » fait hors ligne
 * disparaîtrait de l'écran au premier rafraîchissement.
 */
export function applyPending<T>(path: string, data: T, pending: Pending[]): T {
  if (!pending.length) return data;
  const route = path.split('?')[0];
  const intents = pending.map((p) => p.intent);

  if (route === '/stock') return intents.reduce(onList, data as StockItem[]) as T;
  if (route.startsWith('/stock/')) return onDetail(data as any, intents) as T;
  if (route === '/dashboard') return onDashboard(data as Dashboard, intents) as T;
  if (route === '/shopping') return intents.reduce(onShopping, data as any[]) as T;
  return data;
}

/** Recalcule la tranche d'urgence quand une date bouge. */
function withUrgency(item: StockItem): StockItem {
  const daysLeft = daysUntil(item.effectiveDate);
  return { ...item, daysLeft, urgency: urgencyOf(daysLeft) };
}

function patchBatchFields(item: StockItem, fields: Record<string, unknown>): StockItem {
  const next: StockItem = { ...item };
  if ('qty' in fields) next.qty = Number(fields.qty);
  if ('unit' in fields) next.unit = String(fields.unit);
  if ('lotCode' in fields) next.lotCode = (fields.lotCode ?? null) as string | null;
  if ('dateType' in fields) next.dateType = fields.dateType as StockItem['dateType'];
  if ('bestBefore' in fields) {
    next.bestBefore = (fields.bestBefore ?? null) as string | null;
    next.effectiveDate = next.bestBefore;
  }
  return withUrgency(next);
}

function onList(items: StockItem[], intent: Intent): StockItem[] {
  switch (intent.kind) {
    case 'consume':
      return items.map((i) => (i.id === intent.batchId ? { ...i, qty: Math.max(0, i.qty - intent.qty) } : i));
    case 'close':
      return items.filter((i) => i.id !== intent.batchId);
    case 'reopen': {
      // Annuler un « jeté » doit remettre le lot dans la liste dont il vient
      // d'être retiré : les deux écritures cohabitent dans la file.
      const item = intent.item as StockItem;
      return items.some((i) => i.id === item.id) ? items : [withUrgency(item), ...items];
    }
    case 'open':
      return items.map((i) => (i.id === intent.batchId ? { ...i, openedAt: intent.openedAt } : i));
    case 'move':
      return items.map((i) =>
        i.id === intent.batchId ? { ...i, locationId: intent.locationId, locationName: intent.locationName } : i);
    case 'patchBatch':
      return items.map((i) => (i.id === intent.batchId ? patchBatchFields(i, intent.fields) : i));
    case 'patchProduct':
      return items.map((i) =>
        i.productId === intent.productId
          ? { ...i, ...pickProductFields(intent.fields) }
          : i);
    case 'deleteProduct':
      return items.filter((i) => i.productId !== intent.productId);
    case 'createBatch': {
      const item = intent.item as StockItem;
      // Le lot créé hors ligne remonte en tête tant qu'il n'est pas synchronisé.
      return items.some((i) => i.id === item.id) ? items : [withUrgency(item), ...items];
    }
    default:
      return items;
  }
}

function pickProductFields(fields: Record<string, unknown>): Partial<StockItem> {
  const out: Partial<StockItem> = {};
  if ('name' in fields) out.name = String(fields.name);
  if ('brand' in fields) out.brand = (fields.brand ?? null) as string | null;
  if ('imageUrl' in fields) out.imageUrl = (fields.imageUrl ?? null) as string | null;
  if ('isFavorite' in fields) out.isFavorite = Boolean(fields.isFavorite);
  return out;
}

function onDetail(
  data: { item: StockItem; otherBatches: StockItem[]; history: unknown[] } | null,
  intents: Intent[],
) {
  if (!data?.item) return data;
  const [item] = intents.reduce(onList, [data.item]);
  if (!item) return null;
  return { ...data, item, otherBatches: intents.reduce(onList, data.otherBatches) };
}

function onDashboard(d: Dashboard, intents: Intent[]): Dashboard {
  let urgent = d.urgent;
  const counts = { ...d.counts };
  const locations = d.locations.map((l) => ({ ...l }));

  for (const intent of intents) {
    // Ce qui sort du stock se déduit de la liste des urgents quand il s'y trouve.
    if (intent.kind === 'close' || intent.kind === 'deleteProduct') {
      const gone = urgent.filter((i) =>
        intent.kind === 'close' ? i.id === intent.batchId : i.productId === intent.productId);
      for (const item of gone) {
        counts.total = Math.max(0, counts.total - 1);
        counts[item.urgency] = Math.max(0, counts[item.urgency] - 1);
        const loc = locations.find((l) => l.id === item.locationId);
        if (loc) loc.count = Math.max(0, loc.count - 1);
      }
    }
    if (intent.kind === 'move') {
      const item = urgent.find((i) => i.id === intent.batchId);
      const from = locations.find((l) => l.id === item?.locationId);
      const to = locations.find((l) => l.id === intent.locationId);
      if (from) from.count = Math.max(0, from.count - 1);
      if (to) to.count += 1;
    }
    if (intent.kind === 'createBatch') {
      const item = withUrgency(intent.item as StockItem);
      counts.total += 1;
      counts[item.urgency] += 1;
      const loc = locations.find((l) => l.id === item.locationId);
      if (loc) loc.count += 1;
    }
    urgent = onList(urgent, intent);
  }

  // Un lot créé hors ligne n'apparaît en tête que s'il presse vraiment.
  urgent = urgent
    .filter((i) => i.effectiveDate !== null && (i.daysLeft ?? 99) <= 7)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  return { ...d, counts, urgent, locations };
}

type ShoppingItem = { id: string; label: string; qty: number; productId: string | null; checked: boolean };

function onShopping(items: ShoppingItem[], intent: Intent): ShoppingItem[] {
  switch (intent.kind) {
    case 'shoppingAdd': {
      const item = intent.item as ShoppingItem;
      return items.some((i) => i.id === item.id) ? items : [item, ...items];
    }
    case 'shoppingCheck':
      return items.map((i) => (i.id === intent.id ? { ...i, checked: intent.checked } : i));
    case 'shoppingRemove':
      return items.filter((i) => i.id !== intent.id);
    default:
      return items;
  }
}
