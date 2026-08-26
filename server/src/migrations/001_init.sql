-- ═══════════════════════════════════════════════════════════════
-- Garde-Manger — schéma initial
-- ═══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Le foyer : un seul compte partagé "Maison".
CREATE TABLE household (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Sessions longue durée. On ne stocke que le hash du jeton.
CREATE TABLE session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  token_hash   text        NOT NULL UNIQUE,
  device_label text        NOT NULL DEFAULT 'Appareil',
  user_agent   text,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX session_household_idx ON session (household_id) WHERE revoked_at IS NULL;

-- Anti-bruteforce : une ligne par IP.
CREATE TABLE login_attempt (
  ip           text PRIMARY KEY,
  failures     int         NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Emplacements personnalisables : Frigo, Congélateur, Placard…
CREATE TABLE location (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  tone         text        NOT NULL DEFAULT '#0A84FF',
  position     int         NOT NULL DEFAULT 0,
  -- 'frigo' | 'congelateur' | 'placard' | 'pharmacie' | 'autre'
  kind         text        NOT NULL DEFAULT 'autre',
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX location_name_key ON location (household_id, lower(name)) WHERE archived_at IS NULL;

-- Catégories personnalisables : alimentation, médicaments, hygiène…
CREATE TABLE category (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  tone         text        NOT NULL DEFAULT '#AC8E68',
  position     int         NOT NULL DEFAULT 0,
  -- marque les catégories dont les produits sont des médicaments
  is_medicine  boolean     NOT NULL DEFAULT false,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX category_name_key ON category (household_id, lower(name)) WHERE archived_at IS NULL;

-- La fiche produit : l'identité, sans quantité ni date.
CREATE TABLE product (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  brand         text,
  barcode       text,
  category_id   uuid REFERENCES category(id) ON DELETE SET NULL,
  image_url     text,
  package_text  text,          -- « 250 g », « 6 × 125 g »
  default_unit  text        NOT NULL DEFAULT 'unités',
  -- pharmacie
  is_medicine   boolean     NOT NULL DEFAULT false,
  dosage        text,          -- « 500 mg »
  med_form      text,          -- comprimé, sirop, gélule…
  -- « à consommer dans les X jours après ouverture »
  days_after_opening int,
  notes         text,
  is_favorite   boolean     NOT NULL DEFAULT false,
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_barcode_key ON product (household_id, barcode) WHERE barcode IS NOT NULL AND archived_at IS NULL;
CREATE INDEX product_search_idx ON product USING gin (
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(barcode,''))
);

-- Un lot = un exemplaire (ou paquet d'exemplaires) avec SA date et SON emplacement.
-- 4 yaourts vendredi + 8 la semaine suivante = deux lots du même produit.
CREATE TABLE batch (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES location(id) ON DELETE SET NULL,
  qty          numeric(10,2) NOT NULL DEFAULT 1 CHECK (qty >= 0),
  unit         text        NOT NULL DEFAULT 'unités',
  -- 'DLC' à consommer jusqu'au · 'DDM' de préférence avant · 'EXP' expiration · 'NONE' sans date
  date_type    text        NOT NULL DEFAULT 'NONE' CHECK (date_type IN ('DLC','DDM','EXP','NONE')),
  best_before  date,
  lot_code     text,
  opened_at    date,
  frozen_at    date,
  thawed_at    date,
  -- 'active' | 'consumed' | 'trashed'
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','consumed','trashed')),
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX batch_active_idx  ON batch (household_id, best_before) WHERE status = 'active';
CREATE INDEX batch_product_idx ON batch (product_id);
CREATE INDEX batch_loc_idx     ON batch (location_id) WHERE status = 'active';

-- Historique des mouvements.
CREATE TABLE movement (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES product(id) ON DELETE SET NULL,
  batch_id     uuid REFERENCES batch(id)   ON DELETE SET NULL,
  -- added consumed trashed moved edited opened frozen thawed archived restored
  kind         text        NOT NULL,
  qty_delta    numeric(10,2),
  from_location_id uuid REFERENCES location(id) ON DELETE SET NULL,
  to_location_id   uuid REFERENCES location(id) ON DELETE SET NULL,
  label        text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movement_recent_idx ON movement (household_id, created_at DESC);

-- Mémoire des codes-barres déjà vus (local d'abord, Open Food Facts ensuite).
CREATE TABLE barcode_cache (
  barcode      text PRIMARY KEY,
  name         text,
  brand        text,
  image_url    text,
  package_text text,
  category_hint text,
  source       text        NOT NULL DEFAULT 'off',  -- 'off' | 'manual'
  payload      jsonb,
  hits         int         NOT NULL DEFAULT 0,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

-- Liste de courses (alimentée quand un produit tombe à zéro).
CREATE TABLE shopping_item (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  product_id   uuid REFERENCES product(id) ON DELETE SET NULL,
  label        text        NOT NULL,
  qty          numeric(10,2) NOT NULL DEFAULT 1,
  checked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ── Vue : date effective d'un lot ────────────────────────────────
-- Un produit ouvert « à consommer sous X jours » peut expirer avant sa DLC.
CREATE VIEW batch_effective AS
SELECT
  b.*,
  p.days_after_opening,
  CASE
    WHEN b.opened_at IS NOT NULL AND p.days_after_opening IS NOT NULL THEN
      LEAST(
        COALESCE(b.best_before, b.opened_at + p.days_after_opening),
        b.opened_at + p.days_after_opening
      )
    ELSE b.best_before
  END AS effective_date,
  (b.opened_at IS NOT NULL
   AND p.days_after_opening IS NOT NULL
   AND (b.best_before IS NULL OR b.opened_at + p.days_after_opening < b.best_before)) AS date_from_opening
FROM batch b
JOIN product p ON p.id = b.product_id;
