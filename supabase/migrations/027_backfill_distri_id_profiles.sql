-- Backfill: asignar distri_id en profiles para gondoleros con vinculación aprobada
-- que quedaron con distri_id = null por aprobaciones anteriores al fix estructural.
-- Usa la solicitud aprobada más reciente por gondolero.
UPDATE profiles p
SET distri_id = g.distri_id
FROM (
  SELECT DISTINCT ON (gondolero_id)
    gondolero_id,
    distri_id
  FROM gondolero_distri_solicitudes
  WHERE estado = 'aprobada'
  ORDER BY gondolero_id, updated_at DESC
) g
WHERE g.gondolero_id = p.id
  AND p.distri_id IS NULL;
