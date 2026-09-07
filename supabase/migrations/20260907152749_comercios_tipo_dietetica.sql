-- =============================================================================
-- 049 — comercios.tipo: agregar 'dietetica'
-- =============================================================================
-- QUÉ CUBRE: el CHECK de comercios.tipo.
--
-- POR QUÉ FALTABA: la 001 lo definió como
--   ('autoservicio','almacen','kiosco','mayorista','otro')
-- y 'dietetica' se sumó después a mano. Sobre una base fresca, crear un
-- comercio de ese tipo falla con constraint violation.
-- Ver docs/AUDITORIA-2026-09.md sección 2.5.
--
-- El orden de la lista replica el de docs/schema-real-2026-09-pre-incidente.md sección 2,
-- para que la definición del constraint sea idéntica al dump carácter por
-- carácter y el diff posterior no marque una diferencia cosmética.
-- =============================================================================

ALTER TABLE comercios DROP CONSTRAINT IF EXISTS comercios_tipo_check;
ALTER TABLE comercios ADD CONSTRAINT comercios_tipo_check
  CHECK (tipo IN ('almacen', 'kiosco', 'autoservicio', 'dietetica', 'mayorista', 'otro'));
