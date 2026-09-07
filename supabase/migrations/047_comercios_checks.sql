-- =============================================================================
-- 047 — Tabla comercios_checks
-- =============================================================================
-- QUÉ CUBRE: log de validación GPS de un gondolero contra un comercio.
-- Un registro por par (comercio, gondolero) — de ahí el UNIQUE.
--
-- POR QUÉ FALTABA: creada a mano en el SQL Editor. Es la segunda de las dos
-- tablas que docs/AUDITORIA-2026-09.md sección 2.2 marca como ausentes.
--
-- Forma tomada de docs/schema-real-2026-09.md (secciones 1, 2, 3 y 4).
--
-- OJO (no lo arregla esta migración): la política de esta tabla es
-- `FOR ALL USING (true)`, así que cualquier usuario autenticado puede leer los
-- logs GPS con su distri_id. Está en la sección 1.2 de la auditoría. Se replica
-- tal cual para que la base fresca coincida con producción; el endurecimiento
-- va en la fase de RLS, no acá.
-- =============================================================================

CREATE TABLE IF NOT EXISTS comercios_checks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id  uuid        REFERENCES comercios(id) ON DELETE CASCADE,
  gondolero_id uuid        REFERENCES profiles(id),
  distri_id    uuid        REFERENCES distribuidoras(id),
  latitud      numeric,
  longitud     numeric,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (comercio_id, gondolero_id)
);

ALTER TABLE comercios_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON comercios_checks;
CREATE POLICY "service_role_all" ON comercios_checks FOR ALL USING (true);
