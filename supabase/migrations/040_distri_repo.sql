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
CREATE POLICY "service_role_all" ON distri_repo_tokens FOR ALL USING (true);
