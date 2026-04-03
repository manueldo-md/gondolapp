-- Agrega nivel_minimo a campanas para restringir acceso por nivel de gondolero
ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS nivel_minimo text DEFAULT 'casual'
  CHECK (nivel_minimo IN ('casual', 'activo', 'pro'));

COMMENT ON COLUMN campanas.nivel_minimo IS 'Nivel mínimo requerido para que un gondolero pueda unirse a esta campaña';
