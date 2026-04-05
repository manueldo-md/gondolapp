-- Tabla de misiones: unidad de trabajo = todos los bloques de una campaña en un comercio
CREATE TABLE IF NOT EXISTS misiones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id    uuid REFERENCES campanas(id),
  comercio_id   uuid REFERENCES comercios(id),
  gondolero_id  uuid REFERENCES profiles(id),
  estado        text DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'parcial')),
  puntos_total  numeric DEFAULT 0,
  bounty_estado text DEFAULT 'retenido'
                  CHECK (bounty_estado IN ('acreditado', 'retenido', 'anulado')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE misiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON misiones FOR ALL USING (true);

-- Columna mision_id en fotos (nullable para backward compat con fotos antiguas)
ALTER TABLE fotos ADD COLUMN IF NOT EXISTS mision_id uuid REFERENCES misiones(id);

-- Trigger updated_at para misiones
CREATE OR REPLACE FUNCTION update_misiones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_misiones_updated_at ON misiones;
CREATE TRIGGER trigger_misiones_updated_at
  BEFORE UPDATE ON misiones
  FOR EACH ROW
  EXECUTE FUNCTION update_misiones_updated_at();
