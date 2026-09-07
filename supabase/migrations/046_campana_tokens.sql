-- =============================================================================
-- 046 — Tabla campana_tokens
-- =============================================================================
-- QUÉ CUBRE: tokens de invitación de campaña para distribuidoras y repositoras
-- (los que consumen /distri/invitacion-campana/[token] y
--  /repo/invitacion-campana/[token]).
--
-- POR QUÉ FALTABA: la tabla se creó a mano en el SQL Editor. Es una de las dos
-- tablas que docs/AUDITORIA-2026-09.md sección 2.2 marca como ausentes de toda
-- migración. La columna repositora_id se agregó después, también a mano.
--
-- Forma tomada de docs/schema-real-2026-09.md (secciones 1, 2, 3 y 4).
-- =============================================================================

-- gen_random_bytes() vive en pgcrypto y la 001 no la habilita.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS campana_tokens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  campana_id    uuid        REFERENCES campanas(id) ON DELETE CASCADE,
  distri_id     uuid        REFERENCES distribuidoras(id),
  usado         boolean     DEFAULT false,
  expira_at     timestamptz DEFAULT (now() + interval '7 days'),
  created_at    timestamptz DEFAULT now(),
  repositora_id uuid        REFERENCES repositoras(id) ON DELETE CASCADE
);

-- Por si la tabla ya existía sin repositora_id (estado intermedio en la DB real).
ALTER TABLE campana_tokens
  ADD COLUMN IF NOT EXISTS repositora_id uuid REFERENCES repositoras(id) ON DELETE CASCADE;

ALTER TABLE campana_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON campana_tokens;
CREATE POLICY "service_role_all" ON campana_tokens FOR ALL USING (true);
