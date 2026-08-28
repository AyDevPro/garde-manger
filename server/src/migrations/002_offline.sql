-- ═══════════════════════════════════════════════════════════════
-- Synchronisation hors ligne
-- ═══════════════════════════════════════════════════════════════

-- Une écriture partie du téléphone peut arriver deux fois : la première a
-- abouti mais la réponse s'est perdue, et la file la rejoue. La clé
-- d'idempotence permet de renvoyer la réponse d'origine au lieu de refaire.
CREATE TABLE idempotency_key (
  key          text PRIMARY KEY,
  household_id uuid REFERENCES household(id) ON DELETE CASCADE,
  method       text        NOT NULL,
  path         text        NOT NULL,
  status       int         NOT NULL,
  response     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Les clés ne servent qu'au rattrapage : au-delà de quelques jours, une file
-- d'attente aussi vieille n'a plus lieu d'être rejouée.
CREATE INDEX idempotency_key_age_idx ON idempotency_key (created_at);
