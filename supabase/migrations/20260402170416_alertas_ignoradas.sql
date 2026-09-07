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
  --
  -- RENOMBRADO 7/9/2026: sin nombre explícito, Postgres la llamaba
  -- alertas_ignoradas_distri_id_tipo_referencia_id_key. En producción se creó
  -- a mano como alertas_ignoradas_unique. Se fija el nombre acá, en el origen,
  -- para que una base fresca coincida — el índice que la respalda toma el
  -- mismo nombre, así que esto alinea la constraint y el índice de una.
  CONSTRAINT alertas_ignoradas_unique UNIQUE (distri_id, tipo, referencia_id)
);

ALTER TABLE alertas_ignoradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertas_distri" ON alertas_ignoradas
  FOR ALL USING (
    distri_id = (
      SELECT distri_id FROM profiles WHERE id = auth.uid()
    )
  );
