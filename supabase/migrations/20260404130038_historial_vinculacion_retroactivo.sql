-- =============================================================================
-- MIGRACIÓN DE DATOS (no de schema)
-- =============================================================================
-- No crea ni modifica estructura: repara historial de vinculación sobre filas
-- que existían en producción en abril de 2026.
--
-- MODIFICADA 7/9/2026 — el primer INSERT usaba VALUES con dos UUID
-- hardcodeados (el gondolero CapitanHielo y la distribuidora Biomega). Ninguna
-- migración crea esas filas, así que sobre una base limpia reventaba con
-- 23503 violates foreign key constraint y cortaba la corrida entera en el
-- archivo 19 de 56.
--
-- Reescrito como INSERT ... SELECT contra las dos tablas padre: si las filas
-- no existen, el SELECT no devuelve nada y la sentencia es un no-op. En
-- producción el resultado es idéntico al original, y sigue siendo idempotente
-- por el ON CONFLICT.
-- =============================================================================

-- Insertar registro histórico para gondoleros ya desvinculados que no tienen historial
-- Caso específico: CapitanHielo (1304c54b) y Biomega (11111111-0000-0000-0000-000000000001)
INSERT INTO gondolero_distri_solicitudes (gondolero_id, distri_id, estado)
SELECT p.id, d.id, 'aprobada'
FROM profiles p
CROSS JOIN distribuidoras d
WHERE p.id = '1304c54b-9235-454d-addd-22e98a66f7ca'
  AND d.id = '11111111-0000-0000-0000-000000000001'
ON CONFLICT (gondolero_id, distri_id) DO UPDATE
  SET estado = 'aprobada',
      updated_at = now();

-- Generar historial retroactivo para todos los gondoleros actualmente vinculados
-- (garantiza que una futura desvinculación siempre tenga ancla histórica)
INSERT INTO gondolero_distri_solicitudes (gondolero_id, distri_id, estado)
SELECT id, distri_id, 'aprobada'
FROM profiles
WHERE tipo_actor = 'gondolero'
  AND distri_id IS NOT NULL
ON CONFLICT (gondolero_id, distri_id) DO UPDATE
  SET estado = 'aprobada';
