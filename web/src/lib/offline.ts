/**
 * Stockage local : la file des écritures en attente, et le dernier état connu
 * des lectures. IndexedDB plutôt que localStorage — les photos y tiennent et
 * l'écriture ne bloque pas le rendu.
 */

const DB_NAME = 'garde-manger';
const DB_VERSION = 1;
const OUTBOX = 'outbox';
const CACHE = 'cache';

export type Pending = {
  /** Ordre d'émission : la file se rejoue dans l'ordre où l'on a agi. */
  seq: number;
  /** Clé d'idempotence : le serveur s'en sert pour ne pas traiter deux fois. */
  key: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  /** Ce que l'action fait, pour rejouer l'effet sur les listes affichées. */
  intent: Intent;
  createdAt: number;
  /** Nombre d'échecs non réseau : au-delà, l'entrée est abandonnée. */
  failures?: number;
};

/** Description de l'effet local d'une écriture, indépendante de la route. */
export type Intent =
  | { kind: 'consume'; batchId: string; qty: number }
  | { kind: 'close'; batchId: string; reason: 'consumed' | 'trashed' }
  | { kind: 'reopen'; item: unknown }
  | { kind: 'open'; batchId: string; openedAt: string | null }
  | { kind: 'move'; batchId: string; locationId: string | null; locationName: string }
  | { kind: 'patchBatch'; batchId: string; fields: Record<string, unknown> }
  | { kind: 'patchProduct'; productId: string; fields: Record<string, unknown> }
  | { kind: 'deleteProduct'; productId: string }
  | { kind: 'createBatch'; item: unknown }
  | { kind: 'shoppingAdd'; item: unknown }
  | { kind: 'shoppingCheck'; id: string; checked: boolean }
  | { kind: 'shoppingRemove'; id: string }
  | { kind: 'opaque' };

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'seq' });
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── File d'attente ──────────────────────────────────────────────
export const listPending = () =>
  run<Pending[]>(OUTBOX, 'readonly', (s) => s.getAll() as IDBRequest<Pending[]>)
    .then((rows) => rows.sort((a, b) => a.seq - b.seq))
    .catch(() => []);

export const putPending = (entry: Pending) =>
  run(OUTBOX, 'readwrite', (s) => s.put(entry)).then(() => undefined).catch(() => undefined);

export const removePending = (seq: number) =>
  run(OUTBOX, 'readwrite', (s) => s.delete(seq)).then(() => undefined).catch(() => undefined);

export const clearPending = () =>
  run(OUTBOX, 'readwrite', (s) => s.clear()).then(() => undefined).catch(() => undefined);

/** Numéro d'ordre strictement croissant, y compris entre deux lancements. */
export async function nextSeq() {
  const rows = await listPending();
  const last = rows.length ? rows[rows.length - 1].seq : 0;
  return Math.max(last + 1, Date.now());
}

// ── Dernier état connu des lectures ─────────────────────────────
export const readCache = <T>(path: string) =>
  run<T | undefined>(CACHE, 'readonly', (s) => s.get(path) as IDBRequest<T | undefined>).catch(() => undefined);

export const writeCache = (path: string, data: unknown) =>
  run(CACHE, 'readwrite', (s) => s.put(data, path)).then(() => undefined).catch(() => undefined);

export const clearCache = () =>
  run(CACHE, 'readwrite', (s) => s.clear()).then(() => undefined).catch(() => undefined);

/** L'appareil se souvient d'avoir été connecté : l'app s'ouvre hors ligne. */
const SESSION_FLAG = 'gm.session';

export const rememberSession = (householdName: string) => {
  try { localStorage.setItem(SESSION_FLAG, householdName); } catch { /* navigation privée */ }
};

export const forgetSession = () => {
  try { localStorage.removeItem(SESSION_FLAG); } catch { /* navigation privée */ }
};

export const recalledSession = () => {
  try { return localStorage.getItem(SESSION_FLAG); } catch { return null; }
};
