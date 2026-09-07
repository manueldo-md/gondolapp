-- ─── Tabla repositoras (análoga a distribuidoras) ───────────────────────────
CREATE TABLE IF NOT EXISTS repositoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social text NOT NULL,
  cuit text,
  validada boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE repositoras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON repositoras FOR ALL USING (true);

-- ─── Actor types + repositora_id en profiles ────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_tipo_actor_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_tipo_actor_check
  CHECK (tipo_actor IN ('gondolero','fixer','distribuidora','marca','admin','repositora'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS repositora_id uuid REFERENCES repositoras(id);

-- ─── Solicitudes fixer ↔ repositora ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixer_repo_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixer_id uuid REFERENCES profiles(id),
  repositora_id uuid REFERENCES repositoras(id),
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(fixer_id, repositora_id)
);
ALTER TABLE fixer_repo_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON fixer_repo_solicitudes FOR ALL USING (true);

-- ─── Relación marca ↔ repositora ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marca_repo_relaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca_id uuid REFERENCES marcas(id),
  repositora_id uuid REFERENCES repositoras(id),
  estado text DEFAULT 'activa' CHECK (estado IN ('activa','inactiva')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(marca_id, repositora_id)
);
ALTER TABLE marca_repo_relaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON marca_repo_relaciones FOR ALL USING (true);

-- ─── Campo actor_campana en campanas ─────────────────────────────────────────
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS actor_campana text DEFAULT 'gondolero'
  CHECK (actor_campana IN ('gondolero','fixer'));
