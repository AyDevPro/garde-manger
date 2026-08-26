import { Router } from 'express';
import { z } from 'zod';
import { COOKIE_NAME, config } from '../config.js';
import { one, query } from '../db.js';
import {
  checkLoginAllowed, clearLoginFailures, clearSessionCookie, clientIp, createSession,
  hashPassword, noteLoginFailure, requireAuth, revokeAllSessions, revokeSession,
  setSessionCookie, sha256, verifyPassword,
} from '../auth.js';
import { HttpError, parse, wrap } from '../lib/http.js';

export const authRouter = Router();

authRouter.get('/me', wrap(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  const household = await one('SELECT id, name FROM household ORDER BY created_at LIMIT 1');
  if (!token) return res.json({ authenticated: false, householdName: household?.name ?? config.householdName });
  const sess = await one(
    `SELECT s.id, s.device_label, h.name
       FROM session s JOIN household h ON h.id = s.household_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)],
  );
  if (!sess) return res.json({ authenticated: false, householdName: household?.name ?? config.householdName });
  res.json({ authenticated: true, householdName: sess.name, deviceLabel: sess.device_label, sessionId: sess.id });
}));

authRouter.post('/login', wrap(async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1, 'mot de passe requis') }), req.body);
  const ip = clientIp(req);

  const gate = await checkLoginAllowed(ip);
  if (!gate.allowed) {
    res.set('Retry-After', String(gate.retryAfter));
    throw new HttpError(429, `Trop de tentatives. Réessayez dans ${Math.ceil(gate.retryAfter / 60)} min.`);
  }

  const household = await one('SELECT id, name, password_hash FROM household ORDER BY created_at LIMIT 1');
  if (!household || !verifyPassword(password, household.password_hash)) {
    await noteLoginFailure(ip);
    throw new HttpError(401, 'Mot de passe incorrect');
  }

  await clearLoginFailures(ip);
  const { token, expires } = await createSession(household.id, req);
  setSessionCookie(res, token, expires);
  res.json({ authenticated: true, householdName: household.name });
}));

authRouter.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) await revokeSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.post('/logout-all', requireAuth, wrap(async (req, res) => {
  await revokeAllSessions(req.session!.household_id);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.post('/password', requireAuth, wrap(async (req, res) => {
  const body = parse(
    z.object({
      current: z.string().min(1, 'mot de passe actuel requis'),
      next: z.string().min(8, '8 caractères minimum'),
      logoutOthers: z.boolean().optional(),
    }),
    req.body,
  );
  const h = await one('SELECT id, password_hash FROM household WHERE id = $1', [req.session!.household_id]);
  if (!h || !verifyPassword(body.current, h.password_hash)) throw new HttpError(401, 'Mot de passe actuel incorrect');

  await query('UPDATE household SET password_hash = $1, updated_at = now() WHERE id = $2',
    [hashPassword(body.next), h.id]);
  if (body.logoutOthers !== false) {
    await query('UPDATE session SET revoked_at = now() WHERE household_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [h.id, req.session!.id]);
  }
  res.json({ ok: true });
}));

authRouter.get('/sessions', requireAuth, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT id, device_label, user_agent, created_at, last_seen_at, expires_at
       FROM session
      WHERE household_id = $1 AND revoked_at IS NULL AND expires_at > now()
      ORDER BY last_seen_at DESC`,
    [req.session!.household_id],
  );
  res.json(rows.map((r) => ({
    id: r.id,
    name: r.device_label,
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
    current: r.id === req.session!.id,
  })));
}));

authRouter.delete('/sessions/:id', requireAuth, wrap(async (req, res) => {
  await query('UPDATE session SET revoked_at = now() WHERE id = $1 AND household_id = $2',
    [req.params.id, req.session!.household_id]);
  if (req.params.id === req.session!.id) clearSessionCookie(res);
  res.json({ ok: true });
}));
