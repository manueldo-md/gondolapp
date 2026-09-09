-- Agrega campo motivo_rechazo a fotos
-- Permite que quien rechaza una foto explique el motivo,
-- que luego se incluye en la notificación al gondolero y
-- quedará disponible para el flujo de recaptura.

ALTER TABLE fotos
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;
