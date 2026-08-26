const bool = (v: string | undefined, dflt: boolean) =>
  v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://gardemanger:gardemanger@localhost:5432/gardemanger',
  isProd: process.env.NODE_ENV === 'production',
  householdName: process.env.HOUSEHOLD_NAME ?? 'Maison',
  householdPassword: process.env.HOUSEHOLD_PASSWORD ?? '',
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 180),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  uploadsDir: process.env.UPLOADS_DIR ?? '/data/uploads',
  offUserAgent: process.env.OFF_USER_AGENT ?? 'Garde-Manger/1.0 (foyer privé)',
  // Fuseau du foyer : détermine ce que « aujourd'hui » veut dire pour les dates.
  timezone: process.env.TZ ?? 'Europe/Paris',
};

export const COOKIE_NAME = 'gm_session';
