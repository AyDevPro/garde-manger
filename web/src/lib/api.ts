export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Vrai quand la requête n'a même pas atteint le serveur (mode hors ligne). */
export class OfflineError extends Error {
  constructor() {
    super('Hors ligne — les modifications seront à refaire une fois reconnecté.');
  }
}

type Options = { method?: string; body?: unknown; signal?: AbortSignal };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: opts.body === undefined ? undefined : { 'Content-Type': 'application/json' },
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

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
