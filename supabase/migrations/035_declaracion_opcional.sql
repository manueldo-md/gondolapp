-- Hace declaracion opcional en fotos.
-- La declaracion ahora es responsabilidad del modulo de preguntas
-- (bloque_campos), no del flujo de captura fijo.

ALTER TABLE fotos ALTER COLUMN declaracion DROP NOT NULL;
ALTER TABLE fotos DROP CONSTRAINT IF EXISTS fotos_declaracion_check;
