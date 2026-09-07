-- NOTA (reconciliación): la 039_distri_repo_relaciones.sql ya crea
-- distri_repo_relaciones con un CHECK más restrictivo y sin updated_at. El
-- CREATE TABLE IF NOT EXISTS de abajo queda en no-op sobre una base fresca; la
-- forma final la corrige la 053_reconciliacion_conflictos.sql.
--
-- El DROP POLICY agregado no es cosmético: sin él, este CREATE POLICY aborta
-- con "policy already exists" (la 039 ya creó una con el mismo nombre sobre la
-- misma tabla) y la corrida entera se corta acá.

-- ─── Relaciones distribuidora ↔ repositora ──────────────────────────────────
CREATE TABLE IF NOT EXISTS distri_repo_relaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distri_id     uuid REFERENCES distribuidoras(id),
  repositora_id uuid REFERENCES repositoras(id),
  estado        text DEFAULT 'activa'
    CHECK (estado IN ('activa', 'inactiva', 'terminada')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(distri_id, repositora_id)
);
ALTER TABLE distri_repo_relaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON distri_repo_relaciones;
CREATE POLICY "service_role_all" ON distri_repo_relaciones FOR ALL USING (true);

-- ─── Tokens de invitación distribuidora → repositora ────────────────────────
CREATE TABLE IF NOT EXISTS distri_repo_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text UNIQUE NOT NULL,
  distri_id     uuid REFERENCES distribuidoras(id) NOT NULL,
  usado         boolean DEFAULT false,
  expira_at     timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now()
);
ALTER TABLE distri_repo_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON distri_repo_tokens;
CREATE POLICY "service_role_all" ON distri_repo_tokens FOR ALL USING (true);
