-- =============================================================================
-- 048 — campanas: via_ejecucion, repositora_id, motivo_rechazo
--       + CHECKs que en las migraciones quedaron más restrictivos que la DB
-- =============================================================================
-- QUÉ CUBRE:
--   1. campanas.via_ejecucion  — modo de ejecución de la campaña. El código la
--      lee en decenas de páginas; sin ella las campañas de una base fresca no
--      tendrían modo de ejecución.
--   2. campanas.repositora_id  — sin ella rompe toda la vinculación de
--      repositoras con campañas.
--   3. campanas.motivo_rechazo — sin ella rompe el flujo de rechazo.
--   4. CHECK de financiada_por: la 001 lo dejó en ('marca','distri','gondolapp').
--      La DB real acepta además 'repositora'. Sin este ALTER, insertar una
--      campaña de repositora falla con constraint violation.
--
-- POR QUÉ FALTABA: las tres columnas se agregaron a mano al SQL Editor cuando
-- se sumó el actor repositora. Ver docs/AUDITORIA-2026-09.md sección 2.2 y 2.5.
--
-- Forma tomada de docs/schema-real-2026-09-pre-incidente.md (secciones 1 y 2).
-- =============================================================================

-- ── Columnas ─────────────────────────────────────────────────────────────────
ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS via_ejecucion  text DEFAULT 'distribuidora',
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS repositora_id  uuid REFERENCES repositoras(id);

-- ── CHECK de via_ejecucion ───────────────────────────────────────────────────
ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_via_ejecucion_check;
ALTER TABLE campanas ADD CONSTRAINT campanas_via_ejecucion_check
  CHECK (via_ejecucion IN ('distribuidora', 'gondolapp', 'repositora'));

-- ── CHECK de financiada_por — sumar 'repositora' ─────────────────────────────
ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_financiada_por_check;
ALTER TABLE campanas ADD CONSTRAINT campanas_financiada_por_check
  CHECK (financiada_por IN ('marca', 'distri', 'gondolapp', 'repositora'));
