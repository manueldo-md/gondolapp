-- Solicitudes fixer ↔ distribuidora
CREATE TABLE IF NOT EXISTS fixer_distri_solicitudes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixer_id uuid REFERENCES profiles(id),
  distri_id uuid REFERENCES distribuidoras(id),
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada','terminada')),
  iniciado_por text DEFAULT 'distri' CHECK (iniciado_por IN ('fixer','distri')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(fixer_id, distri_id)
);
ALTER TABLE fixer_distri_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON fixer_distri_solicitudes FOR ALL USING (true);

-- Tokens de invitación para fixers (distri o repositora)
CREATE TABLE IF NOT EXISTS fixer_invitacion_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('distri','repositora')),
  actor_id uuid NOT NULL,  -- distri_id o repositora_id según tipo
  usado boolean DEFAULT false,
  expira_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fixer_invitacion_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON fixer_invitacion_tokens FOR ALL USING (true);
