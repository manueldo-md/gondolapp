-- Tabla para guardar respuestas de campos no-foto vinculadas a una misión.
-- Usada en misiones GPS-only o cuando un bloque tiene campos de texto/selección
-- pero ningún campo tipo='foto'.
-- Los campos tipo='foto' generan filas en la tabla 'fotos' con foto_respuestas.

CREATE TABLE IF NOT EXISTS mision_respuestas (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mision_id  uuid        NOT NULL REFERENCES misiones ON DELETE CASCADE,
  campo_id   uuid        NOT NULL,
  valor      jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mision_respuestas_mision_id_idx ON mision_respuestas (mision_id);

ALTER TABLE mision_respuestas ENABLE ROW LEVEL SECURITY;

-- Solo el service_role puede operar esta tabla (la app usa service_role en server actions)
CREATE POLICY "service_role_all" ON mision_respuestas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
