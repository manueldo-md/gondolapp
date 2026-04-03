-- =============================================================================
-- GondolApp — Migración 008: Tabla de configuración global de la plataforma
-- =============================================================================

CREATE TABLE IF NOT EXISTS configuracion (
  clave  text PRIMARY KEY,
  valor  text NOT NULL,
  descripcion text,
  updated_at timestamptz DEFAULT now()
);

-- Solo admins pueden leer/escribir
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "configuracion_select_admin" ON configuracion;
CREATE POLICY "configuracion_select_admin"
  ON configuracion FOR SELECT
  USING (get_tipo_actor() = 'admin');

DROP POLICY IF EXISTS "configuracion_update_admin" ON configuracion;
CREATE POLICY "configuracion_update_admin"
  ON configuracion FOR UPDATE
  USING (get_tipo_actor() = 'admin');

-- Valores iniciales (mismos que el código actual)
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('compresion_max_kb',   '250',  'Tamaño máximo de foto en KB tras compresión'),
  ('compresion_max_width','1024', 'Ancho máximo en px'),
  ('compresion_calidad',  '0.70', 'Calidad JPEG inicial (0.1–1.0)')
ON CONFLICT (clave) DO NOTHING;
