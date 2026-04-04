-- =============================================================================
-- Migration 017: Tokens de invitación + código personal de gondolero
-- =============================================================================

-- Tabla de tokens de invitación (generados por la distribuidora)
CREATE TABLE IF NOT EXISTS vinculacion_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text UNIQUE NOT NULL,
  distri_id uuid NOT NULL REFERENCES distribuidoras ON DELETE CASCADE,
  tipo text DEFAULT 'distri_invita',
  usado boolean DEFAULT false,
  gondolero_id uuid REFERENCES profiles ON DELETE SET NULL,
  expira_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE vinculacion_tokens ENABLE ROW LEVEL SECURITY;

-- La distri puede ver y crear sus propios tokens
CREATE POLICY "tokens_distri" ON vinculacion_tokens
  FOR ALL USING (
    distri_id = (
      SELECT distri_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Cualquiera puede leer tokens (para validar el link de invitación)
CREATE POLICY "tokens_public_select" ON vinculacion_tokens
  FOR SELECT USING (true);

-- Campo código personal para gondoleros (4 letras + guión + 4 números)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS codigo_gondolero text UNIQUE;

-- Generar códigos para gondoleros existentes que no tengan uno
UPDATE profiles
SET codigo_gondolero =
  UPPER(SUBSTRING(COALESCE(alias, nombre, 'GOND'), 1, 4)) ||
  '-' ||
  LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0')
WHERE tipo_actor = 'gondolero'
  AND codigo_gondolero IS NULL;
