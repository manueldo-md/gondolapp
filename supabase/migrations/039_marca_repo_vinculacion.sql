-- ─── Tokens de invitación marca → repositora ────────────────────────────────
CREATE TABLE IF NOT EXISTS marca_repo_tokens (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token     text UNIQUE NOT NULL,
  marca_id  uuid REFERENCES marcas(id) NOT NULL,
  usado     boolean DEFAULT false,
  expira_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE marca_repo_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON marca_repo_tokens FOR ALL USING (true);

-- ─── Extender marca_repo_relaciones ─────────────────────────────────────────
-- Agregar estado 'terminada' y campos de auditoría
ALTER TABLE marca_repo_relaciones
  DROP CONSTRAINT IF EXISTS marca_repo_relaciones_estado_check;
ALTER TABLE marca_repo_relaciones
  ADD CONSTRAINT marca_repo_relaciones_estado_check
  CHECK (estado IN ('activa', 'inactiva', 'terminada'));

ALTER TABLE marca_repo_relaciones ADD COLUMN IF NOT EXISTS fecha_fin   timestamptz;
ALTER TABLE marca_repo_relaciones ADD COLUMN IF NOT EXISTS updated_at  timestamptz DEFAULT now();
