-- =============================================================================
-- 050 — Estado 'terminada' en las solicitudes de vinculación
-- =============================================================================
-- QUÉ CUBRE: los CHECK de estado en gondolero_distri_solicitudes y
-- fixer_repo_solicitudes.
--
-- POR QUÉ FALTABA: es uno de los cambios ejecutados a mano el 7/9/2026,
-- documentado al inicio de docs/schema-real-2026-09-pre-incidente.md ("Cambios aplicados
-- DESPUÉS de tomar este dump"). Cerró el bug de desvinculación abierto desde
-- abril: el código escribe estado='terminada' y el CHECK original solo aceptaba
-- ('pendiente','aprobada','rechazada'), así que la desvinculación fallaba.
--
-- Referencia de la versión previa: la 016 (gondolero_distri_solicitudes) y la
-- 036 (fixer_repo_solicitudes), que declaran los CHECK sin 'terminada'.
--
-- NOTA: fixer_distri_solicitudes ya nace con 'terminada' en la 038, así que
-- no necesita corrección.
-- =============================================================================

ALTER TABLE gondolero_distri_solicitudes
  DROP CONSTRAINT IF EXISTS gondolero_distri_solicitudes_estado_check;
ALTER TABLE gondolero_distri_solicitudes
  ADD CONSTRAINT gondolero_distri_solicitudes_estado_check
  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'terminada'));

ALTER TABLE fixer_repo_solicitudes
  DROP CONSTRAINT IF EXISTS fixer_repo_solicitudes_estado_check;
ALTER TABLE fixer_repo_solicitudes
  ADD CONSTRAINT fixer_repo_solicitudes_estado_check
  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'terminada'));
