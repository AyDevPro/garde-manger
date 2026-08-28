import type { NextFunction, Request, Response } from 'express';
import { one, query } from '../db.js';

/** Les clés plus vieilles que ça ne sont plus rejouables. */
const RETENTION_DAYS = 14;

const isMutation = (method: string) => method === 'POST' || method === 'PATCH' || method === 'DELETE';

/**
 * Rejeu sans doublon. Le téléphone joint une clé unique à chaque écriture mise
 * en file ; si elle a déjà été traitée, on renvoie la réponse d'origine au lieu
 * de consommer un yaourt une seconde fois.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.get('idempotency-key');
  if (!key || !isMutation(req.method)) return next();
  if (key.length > 200) return res.status(400).json({ error: 'Clé d’idempotence trop longue' });

  const seen = await one(
    'SELECT status, response FROM idempotency_key WHERE key = $1 AND household_id = $2',
    [key, req.session!.household_id],
  );
  if (seen) {
    res.set('Idempotent-Replay', 'true');
    return res.status(seen.status).json(seen.response);
  }

  // On mémorise la réponse au moment où elle part, sans bloquer l'envoi.
  const send = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 400) {
      query(
        `INSERT INTO idempotency_key (key, household_id, method, path, status, response)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (key) DO NOTHING`,
        [key, req.session!.household_id, req.method, req.originalUrl.slice(0, 500), res.statusCode, body],
      ).catch((err) => console.error('[idempotence]', err));
    }
    return send(body);
  };
  next();
}

/** Purge périodique — la table ne sert qu'au rattrapage récent. */
export function startIdempotencyCleanup() {
  const purge = () =>
    query(`DELETE FROM idempotency_key WHERE created_at < now() - ($1 || ' days')::interval`, [String(RETENTION_DAYS)])
      .catch((err) => console.error('[idempotence] purge', err));
  purge();
  const timer = setInterval(purge, 24 * 60 * 60 * 1000);
  timer.unref();
}
