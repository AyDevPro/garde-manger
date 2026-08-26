import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { COOKIE_NAME, config } from './config.js';
import { one, query, tx } from './db.js';

// ── Mot de passe ────────────────────────────────────────────────
// scrypt : natif à Node, pas de dépendance compilée à installer dans Docker.
// maxmem doit couvrir 128 * N * r, sinon Node refuse les paramètres.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 2 ** 15 * 8 * 2 };

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const { keylen, ...params } = SCRYPT;
  const key = crypto.scryptSync(password, salt, keylen, params);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, salt, key] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 128 * Number(N) * Number(r) * 2,
  });
  return crypto.timingSafeEqual(expected, actual);
}

// ── Sessions ────────────────────────────────────────────────────
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export type Session = { id: string; household_id: string; device_label: string };

export async function createSession(householdId: string, req: Request) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionDays * 86_400_000);
  const ua = String(req.get('user-agent') ?? '');
  const row = await one(
    `INSERT INTO session (household_id, token_hash, device_label, user_agent, ip, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [householdId, sha256(token), deviceLabel(ua), ua.slice(0, 400), clientIp(req), expires],
  );
  return { token, expires, sessionId: row!.id as string };
}

export function setSessionCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    expires,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' });
}

export async function revokeSession(token: string) {
  await query('UPDATE session SET revoked_at = now() WHERE token_hash = $1', [sha256(token)]);
}

export async function revokeAllSessions(householdId: string) {
  await query('UPDATE session SET revoked_at = now() WHERE household_id = $1 AND revoked_at IS NULL', [householdId]);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { session?: Session }
  }
}

/** Exige une session valide ; rafraîchit last_seen_at au passage. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Non connecté' });
  const row = await one<Session>(
    `UPDATE session SET last_seen_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING id, household_id, device_label`,
    [sha256(token)],
  );
  if (!row) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Session expirée' });
  }
  req.session = row;
  next();
}

// ── Anti-bruteforce ─────────────────────────────────────────────
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;

export function clientIp(req: Request) {
  const fwd = req.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.ip) || '0.0.0.0';
}

export async function checkLoginAllowed(ip: string) {
  const row = await one('SELECT failures, locked_until FROM login_attempt WHERE ip = $1', [ip]);
  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    const secs = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
    return { allowed: false as const, retryAfter: secs };
  }
  return { allowed: true as const, retryAfter: 0 };
}

export async function noteLoginFailure(ip: string) {
  await query(
    `INSERT INTO login_attempt (ip, failures, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (ip) DO UPDATE SET
       failures = CASE WHEN login_attempt.locked_until IS NOT NULL
                        AND login_attempt.locked_until < now()
                       THEN 1 ELSE login_attempt.failures + 1 END,
       locked_until = CASE WHEN login_attempt.failures + 1 >= $2
                           THEN now() + ($3 || ' minutes')::interval ELSE NULL END,
       updated_at = now()`,
    [ip, MAX_FAILURES, String(LOCK_MINUTES)],
  );
}

export async function clearLoginFailures(ip: string) {
  await query('DELETE FROM login_attempt WHERE ip = $1', [ip]);
}

// ── Étiquette d'appareil lisible ────────────────────────────────
function deviceLabel(ua: string) {
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'PC Windows';
  return 'Appareil';
}

// ── Amorçage du foyer ───────────────────────────────────────────
const DEFAULT_LOCATIONS: [string, string, string][] = [
  ['Frigo', '#0A84FF', 'frigo'],
  ['Congélateur', '#64D2FF', 'congelateur'],
  ['Placard', '#FF9F0A', 'placard'],
  ['Pharmacie', '#BF5AF2', 'pharmacie'],
  ['Cellier', '#30D158', 'autre'],
  ['Cave', '#AC8E68', 'autre'],
];

const DEFAULT_CATEGORIES: [string, string, boolean][] = [
  ['Produits laitiers', '#64D2FF', false],
  ['Viandes', '#FF453A', false],
  ['Fruits & légumes', '#30D158', false],
  ['Boissons', '#0A84FF', false],
  ['Épicerie', '#FF9F0A', false],
  ['Médicaments', '#BF5AF2', true],
  ['Hygiène', '#5E5CE6', false],
  ['Entretien', '#AC8E68', false],
];

/** Crée le foyer, ses emplacements et ses catégories au premier démarrage. */
export async function bootstrapHousehold() {
  const existing = await one('SELECT id FROM household ORDER BY created_at LIMIT 1');
  if (existing) return existing.id as string;

  if (!config.householdPassword || config.householdPassword.length < 8) {
    throw new Error(
      'HOUSEHOLD_PASSWORD est absent ou trop court (8 caractères minimum). ' +
        'Renseignez-le dans .env avant le premier démarrage.',
    );
  }

  return tx(async (c) => {
    const h = await c.query(
      'INSERT INTO household (name, password_hash) VALUES ($1,$2) RETURNING id',
      [config.householdName, hashPassword(config.householdPassword)],
    );
    const id = h.rows[0].id as string;
    for (const [i, [name, tone, kind]] of DEFAULT_LOCATIONS.entries()) {
      await c.query(
        'INSERT INTO location (household_id, name, tone, position, kind) VALUES ($1,$2,$3,$4,$5)',
        [id, name, tone, i, kind],
      );
    }
    for (const [i, [name, tone, isMed]] of DEFAULT_CATEGORIES.entries()) {
      await c.query(
        'INSERT INTO category (household_id, name, tone, position, is_medicine) VALUES ($1,$2,$3,$4,$5)',
        [id, name, tone, i, isMed],
      );
    }
    console.log(`[auth] foyer « ${config.householdName} » créé avec ses emplacements et catégories.`);
    return id;
  });
}
