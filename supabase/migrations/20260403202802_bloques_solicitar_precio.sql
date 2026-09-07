-- Agrega campo solicitar_precio a bloques_foto
-- y precio_confirmado a fotos (el precio que ingresa el gondolero)
ALTER TABLE bloques_foto ADD COLUMN IF NOT EXISTS solicitar_precio boolean DEFAULT false;
ALTER TABLE fotos ADD COLUMN IF NOT EXISTS precio_confirmado decimal;
