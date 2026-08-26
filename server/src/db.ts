import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

// Les dates SQL (type 1082) reviennent en 'YYYY-MM-DD', pas en objet Date :
// on manipule des dates civiles, pas des instants.
pg.types.setTypeParser(1082, (v: string) => v);
// numeric -> number (les quantités restent petites)
pg.types.setTypeParser(1700, (v: string) => Number(v));

// « Aujourd'hui » doit être celui du foyer, pas celui d'UTC : CURRENT_DATE
// sert partout à calculer les jours restants avant péremption.
export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  options: `-c timezone=${config.timezone.replace(/[^A-Za-z0-9_/+-]/g, '')}`,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  const r = await pool.query<T>(text, params);
  return r.rows[0] ?? null;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Attend que Postgres réponde (le conteneur db peut démarrer après l'API). */
export async function waitForDb(timeoutMs = 60_000) {
  const started = Date.now();
  for (;;) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      if (Date.now() - started > timeoutMs) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/** Applique les fichiers de src/migrations dans l'ordre, une seule fois chacun. */
export async function migrate() {
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, 'migrations');
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migration (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migration WHERE name = $1', [file]);
    if (done.rowCount) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
    });
    console.log(`[db] migration appliquée : ${file}`);
  }
}
