-- =============================================================================
-- 041b — Tablas bloque_campos y foto_respuestas
-- =============================================================================
-- POR QUÉ FALTABA:
-- Ambas tablas se crearon a mano en el SQL Editor de Supabase y nunca se
-- versionaron. La 042 lo dice explícitamente en su propio comentario
-- ("La tabla fue creada directamente en Supabase sin migration").
--
-- POR QUÉ 041b Y NO 046:
-- No alcanza con agregarlas al final. Sobre una base limpia:
--   - 042 hace ALTER TABLE bloque_campos  -> falla, la tabla no existe
--   - 045 hace REFERENCES bloque_campos(id) -> falla por la misma razón
-- La corrida aborta en la 042 y nunca llega a la 046. Por eso este archivo
-- tiene que ordenarse ANTES de la 042.
--
-- NOTA: esta divergencia NO figura en docs/AUDITORIA-2026-09.md sección 2.
-- Se detectó comparando las tablas del dump contra los CREATE TABLE de las
-- migraciones. Referencia de forma: docs/schema-real-2026-09-pre-incidente.md sección 1.
-- =============================================================================

-- ── bloque_campos ────────────────────────────────────────────────────────────
-- Campos configurables dentro de un bloque de foto (preguntas de la misión).
CREATE TABLE IF NOT EXISTS bloque_campos (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  bloque_id   uuid        NOT NULL REFERENCES bloques_foto(id) ON DELETE CASCADE,
  tipo        text        NOT NULL,
  pregunta    text        NOT NULL,
  opciones    text[],
  obligatorio boolean     DEFAULT false,
  orden       integer     DEFAULT 1,
  created_at  timestamptz DEFAULT now()
);

-- El CHECK de `tipo` lo define la 042 (agrega 'foto' a la lista). No se
-- declara acá para no duplicar la fuente de verdad de ese constraint.

ALTER TABLE bloque_campos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bloque_campos_select" ON bloque_campos;
CREATE POLICY "bloque_campos_select" ON bloque_campos
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "bloque_campos_insert" ON bloque_campos;
CREATE POLICY "bloque_campos_insert" ON bloque_campos
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── foto_respuestas ──────────────────────────────────────────────────────────
-- Respuestas de campos no-foto asociadas a una foto concreta.
CREATE TABLE IF NOT EXISTS foto_respuestas (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  foto_id    uuid        NOT NULL REFERENCES fotos(id) ON DELETE CASCADE,
  campo_id   uuid        NOT NULL REFERENCES bloque_campos(id) ON DELETE CASCADE,
  valor      jsonb       NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (foto_id, campo_id)
);

ALTER TABLE foto_respuestas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foto_respuestas_select" ON foto_respuestas;
CREATE POLICY "foto_respuestas_select" ON foto_respuestas
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "foto_respuestas_insert" ON foto_respuestas;
CREATE POLICY "foto_respuestas_insert" ON foto_respuestas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
