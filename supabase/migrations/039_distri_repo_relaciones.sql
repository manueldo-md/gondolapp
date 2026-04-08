-- Relación explícita distribuidora ↔ repositora
CREATE TABLE IF NOT EXISTS distri_repo_relaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distri_id uuid REFERENCES distribuidoras(id),
  repositora_id uuid REFERENCES repositoras(id),
  estado text DEFAULT 'activa' CHECK (estado IN ('activa','inactiva')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(distri_id, repositora_id)
);
ALTER TABLE distri_repo_relaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON distri_repo_relaciones FOR ALL USING (true);
