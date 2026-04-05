-- Agrega bounty_estado a fotos para implementar la lógica de retención de puntos
-- hasta que el gondolero alcance el mínimo requerido (min_comercios_para_cobrar)

ALTER TABLE fotos
  ADD COLUMN IF NOT EXISTS bounty_estado text DEFAULT 'acreditado'
    CHECK (bounty_estado IN ('acreditado', 'retenido', 'anulado'));

-- Índice para acelerar liberación de puntos al cerrar campaña
CREATE INDEX IF NOT EXISTS fotos_bounty_retenido_idx
  ON fotos (campana_id, bounty_estado)
  WHERE bounty_estado = 'retenido';
