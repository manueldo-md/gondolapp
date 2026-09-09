-- fotos.reemplazada_por — vincula una foto rechazada con su recaptura
--
-- Sin esta columna la recaptura no cierra: la foto vieja queda en 'rechazada'
-- para siempre, así que el aviso de "tenés fotos rechazadas" nunca se apaga y
-- el retake se puede repetir infinitas veces. Y la misión queda en limbo,
-- porque actualizarEstadoMision solo resuelve si TODAS las fotos están
-- aprobadas, y la rechazada nunca lo va a estar.
--
-- Por qué una columna y no cambiar el estado de la foto vieja a 'archivada':
-- se pierde el rastro. La regla del proyecto es que una foto rechazada no se
-- borra ni se disfraza — queda con su estado y su motivo_rechazo. Lo que
-- cambia es que ahora se sabe cuál la reemplazó, que es justamente el dato que
-- sirve para auditar una recaptura sospechosa (comparar GPS y timestamp de las
-- dos fotos).
--
-- Semántica: reemplazada_por IS NULL significa "sigue vigente". Todas las
-- consultas de fotos rechazadas que alimentan el aviso al gondolero filtran
-- por eso.

ALTER TABLE fotos
  ADD COLUMN IF NOT EXISTS reemplazada_por uuid REFERENCES fotos(id) ON DELETE SET NULL;

COMMENT ON COLUMN fotos.reemplazada_por IS
  'Foto que reemplaza a esta en una recaptura. NULL = vigente. La fila original conserva estado=rechazada y motivo_rechazo.';

-- Se consulta siempre como "reemplazada_por IS NULL" junto con estado, así que
-- el índice parcial cubre el caso real sin pesar sobre el resto de la tabla.
CREATE INDEX IF NOT EXISTS fotos_rechazadas_vigentes_idx
  ON fotos (mision_id)
  WHERE estado = 'rechazada' AND reemplazada_por IS NULL;
