-- 045_fotos_campo_id.sql
-- Agrega campo_id a la tabla fotos para registrar fotos de campos tipo='foto'
-- como filas propias en fotos (en vez de guardar la URL como texto en foto_respuestas).
--
-- NULL  = foto del bloque (comportamiento actual)
-- UUID  = foto capturada para ese campo específico (tipo='foto')

ALTER TABLE fotos ADD COLUMN IF NOT EXISTS campo_id uuid REFERENCES bloque_campos(id);
