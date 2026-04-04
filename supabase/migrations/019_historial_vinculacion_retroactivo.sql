-- Insertar registro histórico para gondoleros ya desvinculados que no tienen historial
-- Caso específico: CapitanHielo (1304c54b) y Biomega (11111111-0000-0000-0000-000000000001)
INSERT INTO gondolero_distri_solicitudes (gondolero_id, distri_id, estado)
VALUES (
  '1304c54b-9235-454d-addd-22e98a66f7ca',
  '11111111-0000-0000-0000-000000000001',
  'aprobada'
)
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
