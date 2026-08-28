import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { bootstrapHousehold, requireAuth } from './auth.js';
import { migrate, pool, waitForDb } from './db.js';
import { HttpError } from './lib/http.js';
import { idempotency, startIdempotencyCleanup } from './lib/idempotency.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { lookupRouter } from './routes/lookup.js';
import { miscRouter } from './routes/misc.js';
import { stockRouter } from './routes/stock.js';
import { taxonomyRouter } from './routes/taxonomy.js';

const app = express();
// Derrière le reverse-proxy TLS : req.ip et les cookies "secure" doivent voir la vraie requête.
app.set('trust proxy', 1);

app.use(helmet({
  // Le service worker et les styles inline de l'app ont besoin d'une CSP sur mesure.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      // Les photos produit viennent d'Open Food Facts.
      imgSrc: ["'self'", 'data:', 'blob:', 'https://images.openfoodfacts.org', 'https://static.openfoodfacts.org'],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  // Nécessaire pour afficher les images distantes d'Open Food Facts.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '9mb' }));
app.use(cookieParser());

// CORS uniquement si des origines sont explicitement déclarées.
if (config.allowedOrigins.length) {
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
// Tout le reste de l'API exige une session du foyer.
app.use('/api', requireAuth, idempotency, dashboardRouter, stockRouter, taxonomyRouter, lookupRouter, miscRouter);

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', fallthrough: true, index: false }));

// ── L'app compilée, servie par le même serveur (même origine, cookie simple) ──
const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(process.env.WEB_DIST ?? join(here, '..', '..', 'web', 'dist'));
if (existsSync(webDist)) {
  app.use(express.static(webDist, {
    index: false,
    setHeaders(res, path) {
      // Le service worker et index.html ne doivent jamais rester en cache.
      if (path.endsWith('sw.js') || path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (/\/assets\//.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
} else {
  console.warn(`[web] ${webDist} absent — seule l'API est servie.`);
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error('[erreur]', err);
  res.status(500).json({ error: 'Erreur serveur' });
});

async function main() {
  await waitForDb();
  await migrate();
  await bootstrapHousehold();
  startIdempotencyCleanup();
  app.listen(config.port, () => {
    console.log(`[garde-manger] à l'écoute sur http://0.0.0.0:${config.port}`);
  });
}

main().catch((err) => {
  console.error('[démarrage]', err instanceof Error ? err.message : err);
  process.exit(1);
});
