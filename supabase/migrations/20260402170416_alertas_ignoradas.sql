-- Tabla para ignorar alertas temporalmente (7 días por defecto)
-- Ejecutar en Supabase Dashboard > SQL Editor

CREATE TABLE IF NOT EXISTS alertas_ignoradas (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  distri_id     uuid NOT NULL REFERENCES distribuidoras,
  tipo          text NOT NULL CHECK (tipo IN (
                  'quiebre_stock', 'sin_visita',
                  'campana_riesgo', 'gondolero_inactivo'
                )),
  referencia_id uuid NOT NULL,  -- comercio_id, campana_id o gondolero_id
  ignorada_hasta timestamptz NOT NULL,
  created_at    timestamptz DEFAULT now(),

  -- Unique constraint para el upsert (una entrada activa por combinación)
  UNIQUE (distri_id, tipo, referencia_id)
);

ALTER TABLE alertas_ignoradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_distri" ON alertas_ignoradas
  FOR ALL USING (
    distri_id = (
      SELECT distri_id FROM profiles WHERE id = auth.uid()
    )
  );
