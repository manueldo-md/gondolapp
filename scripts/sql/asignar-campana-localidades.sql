-- =============================================================================
-- Poblar campana_localidades a partir de los datos existentes
-- =============================================================================
-- Después de la restauración del 7/9/2026, campana_localidades quedó vacía:
-- ningún script la puebla. Con la tabla vacía el filtro de campañas por zona
-- queda inerte — el código trata a toda campaña sin zona como "abierta por
-- defecto", así que todos los gondoleros ven todas las campañas.
--
-- Criterio, en dos pasadas:
--   1. Si la campaña tiene misiones, sus localidades son las de los comercios
--      efectivamente relevados. Es el dato más fiel: dice dónde se trabajó.
--   2. Si no tiene misiones, se cae a las localidades donde hay comercios
--      registrados por gondoleros de su distribuidora.
--
-- CORRER LOS PASOS 0 Y 1 PRIMERO Y MIRAR EL RESULTADO. Los INSERT están
-- después y son idempotentes, pero conviene ver qué va a asignar cada uno.
-- =============================================================================


-- ── PASO 0 — Estado actual ───────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM campanas)            AS campanas,
  (SELECT count(*) FROM campana_localidades) AS asignaciones_actuales,
  (SELECT count(*) FROM comercios WHERE localidad_id IS NULL) AS comercios_sin_localidad;


-- ── PASO 1 — Qué asignaría cada estrategia, por campaña ──────────────────────
-- Mirar esto antes de insertar nada.
SELECT
  c.nombre,
  c.estado,
  count(DISTINCT m.id)                                                   AS misiones,
  count(DISTINCT co.localidad_id)                                        AS loc_via_comercios,
  count(DISTINCT m.comercio_id) FILTER (WHERE co.localidad_id IS NULL)   AS comercios_sin_localidad
FROM campanas c
LEFT JOIN misiones  m  ON m.campana_id = c.id
LEFT JOIN comercios co ON co.id = m.comercio_id
GROUP BY c.id, c.nombre, c.estado
ORDER BY misiones DESC, c.nombre;


-- ── PASO 2 — Estrategia A: localidades de los comercios relevados ────────────
-- Cubre la campaña de Georgalos y toda campaña con misiones, sin importar la
-- provincia: la localidad sale del comercio, así que Entre Ríos, Córdoba y
-- Rosario se resuelven con la misma consulta.

INSERT INTO campana_localidades (campana_id, localidad_id)
SELECT DISTINCT m.campana_id, co.localidad_id
FROM misiones m
JOIN comercios co ON co.id = m.comercio_id
WHERE co.localidad_id IS NOT NULL
ON CONFLICT (campana_id, localidad_id) DO NOTHING;


-- ── PASO 3 — Estrategia B: campañas sin misiones ─────────────────────────────
-- Se apoya en los comercios registrados por los gondoleros y fixers de la
-- distribuidora de la campaña.
--
-- Nota: el criterio original era "las localidades donde operan los gondoleros
-- de su distribuidora", que sería gondolero_localidades — pero esa tabla
-- también está vacía. Los comercios que esos gondoleros registraron son el
-- mejor proxy disponible del territorio donde trabajan.
--
-- Solo aplica a campañas que quedaron sin ninguna localidad tras el paso 2, y
-- solo a las que tienen distri_id. Una campaña de marca pura sin misiones no
-- se puede resolver por este camino y queda sin asignar a propósito.

INSERT INTO campana_localidades (campana_id, localidad_id)
SELECT DISTINCT c.id, co.localidad_id
FROM campanas c
JOIN profiles  p  ON p.distri_id = c.distri_id
                 AND p.tipo_actor IN ('gondolero', 'fixer')
JOIN comercios co ON co.registrado_por = p.id
WHERE c.distri_id IS NOT NULL
  AND co.localidad_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM campana_localidades cl WHERE cl.campana_id = c.id)
ON CONFLICT (campana_id, localidad_id) DO NOTHING;


-- ── PASO 4 — Verificación ────────────────────────────────────────────────────
-- Toda campaña activa debería tener al menos una localidad. Las que queden en
-- 0 son las que ningún criterio pudo resolver: revisarlas a mano.

SELECT
  c.nombre,
  c.estado,
  count(cl.localidad_id) AS localidades,
  string_agg(DISTINCT l.nombre, ', ' ORDER BY l.nombre) AS detalle
FROM campanas c
LEFT JOIN campana_localidades cl ON cl.campana_id = c.id
LEFT JOIN localidades         l  ON l.id = cl.localidad_id
GROUP BY c.id, c.nombre, c.estado
ORDER BY localidades ASC, c.nombre;
