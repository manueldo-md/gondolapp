-- Versionado de respuestas en retake: misma semántica que fotos.reemplazada_por.
-- La fila original queda intacta con reemplazada_por = <id de la nueva fila>.
-- La nueva fila queda con reemplazada_por = NULL (versión vigente).
-- Nunca se borran filas — trazabilidad completa de lo que cambió entre visitas.

ALTER TABLE mision_respuestas
  ADD COLUMN reemplazada_por uuid REFERENCES mision_respuestas(id);

-- Índice parcial: cubre solo las filas vigentes (reemplazada_por IS NULL).
-- Todos los readers filtran por esta condición + mision_id, así que el índice
-- es mucho más pequeño y rápido que el índice completo existente.
-- El índice completo (mision_respuestas_mision_id_idx) se conserva para
-- consultas de auditoría que lean también las versiones viejas.
CREATE INDEX mision_respuestas_vigentes_idx
  ON mision_respuestas (mision_id)
  WHERE reemplazada_por IS NULL;
