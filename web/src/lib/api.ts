import {
  type Intent, type Pending,
  listPending, nextSeq, putPending, readCache, removePending, writeCache,
} from './offline';
import { applyPending } from './pending';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** La requête n'a pas atteint le serveur : réseau coupé, VPS injoignable. */
export class OfflineError extends Error {
  constructor() {
    super('Hors ligne');
  }
}

/** Aucune donnée en cache pour cet écran, et pas de réseau pour aller la chercher. */
export class NoDataError extends Error {
  constructor() {
    super('Pas encore de données enregistrées sur cet appareil.');
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal; idempotencyKey?: string };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: Object.keys(headers).length ? headers : undefined,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new OfflineError();
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, (data && (data as any).error) || `Erreur ${res.status}`);
  return data as T;
}

const safeJson = (text: string) => {
  try { return JSON.parse(text); } catch { return null; }
};

/** L'état de session vient du serveur ou de nulle part : le mettre en cache
 *  ferait croire à l'app qu'elle est connectée alors que la session a expiré. */
const isCacheable = (path: string) => !path.startsWith('/auth/');

/** Prévient l'app qu'une lecture vient du cache, ou que le réseau est revenu. */
const signal_ = (fresh: boolean) => window.dispatchEvent(new Event(fresh ? 'gm:fresh' : 'gm:stale'));

/**
 * Lecture : le réseau d'abord, le dernier état connu sinon. Dans les deux cas
 * la file d'attente est rejouée par-dessus, pour que l'écran montre ce que
 * l'utilisateur vient de faire même si rien n'est encore parti.
 */
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let data: T;
  try {
    data = await request<T>(path, { signal });
    if (isCacheable(path)) writeCache(path, data);
    signal_(true);
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    // Pas de repli possible pour l'état de session : l'appelant doit savoir
    // que c'est le réseau qui manque, pas la session qui a expiré.
    if (!isCacheable(path)) throw err;
    const cached = await readCache<T>(path);
    if (cached === undefined) throw new NoDataError();
    signal_(false);
    data = cached;
  }
  return applyPending(path, data, await listPending());
}

/** Écriture qui exige le réseau : connexion, mot de passe, photo, recherche de code. */
const direct = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body ?? {} });

export type QueueResult = 'sent' | 'queued';

/**
 * Écriture qui survit à la coupure : tentée tout de suite, mise en file si le
 * réseau manque. La clé d'idempotence est fixée dès la mise en file, donc un
 * rejeu ne peut pas produire l'action deux fois.
 */
export async function queued(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  intent: Intent,
): Promise<QueueResult> {
  const key = crypto.randomUUID();
  try {
    await request(path, { method, body: method === 'DELETE' ? undefined : body ?? {}, idempotencyKey: key });
    return 'sent';
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    const entry: Pending = {
      seq: await nextSeq(), key, method, path, body, intent, createdAt: Date.now(),
    };
    await putPending(entry);
    return 'queued';
  }
}

/**
 * Rejeu de la file, dans l'ordre. On s'arrête à la première coupure : rejouer
 * la suite hors ordre donnerait un état incohérent (consommer avant d'ajouter).
 */
export async function syncOutbox(): Promise<{ sent: number; dropped: number; remaining: number }> {
  const queue = await listPending();
  let sent = 0;
  let dropped = 0;

  for (const entry of queue) {
    try {
      await request(entry.path, {
        method: entry.method,
        body: entry.method === 'DELETE' ? undefined : entry.body ?? {},
        idempotencyKey: entry.key,
      });
      await removePending(entry.seq);
      sent++;
    } catch (err) {
      if (err instanceof OfflineError) break;
      // Le serveur a refusé : le lot a été supprimé ailleurs, la session a
      // expiré… Rejouer indéfiniment bloquerait tout le reste de la file.
      const failures = (entry.failures ?? 0) + 1;
      if (err instanceof ApiError && (err.status === 401 || err.status === 429)) break;
      if (failures >= 3 || (err instanceof ApiError && err.status >= 400 && err.status < 500)) {
        await removePending(entry.seq);
        dropped++;
      } else {
        await putPending({ ...entry, failures });
        break;
      }
    }
  }

  return { sent, dropped, remaining: (await listPending()).length };
}

export const api = {
  get,
  post: <T>(path: string, body?: unknown) => direct<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => direct<T>('PATCH', path, body),
  del: <T>(path: string) => direct<T>('DELETE', path),
  queued,
};
