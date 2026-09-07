-- Agregar columna puntos_por_mision a campanas.
-- La unidad de cobro pasa de foto a misión completada.
-- puntos_por_foto se mantiene para compatibilidad con campañas existentes (fallback).

ALTER TABLE campanas ADD COLUMN IF NOT EXISTS puntos_por_mision integer DEFAULT 0;

COMMENT ON COLUMN campanas.puntos_por_mision IS
  'Puntos que gana el gondolero al completar una misión en esta campaña. '
  'Reemplaza a puntos_por_foto para nuevas campañas. '
  'Si es 0 y puntos_por_foto > 0, se usa puntos_por_foto como fallback (campañas legacy).';
