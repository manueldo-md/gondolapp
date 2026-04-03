CREATE TABLE IF NOT EXISTS errores_reportados (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id uuid REFERENCES profiles,
  tipo_actor text,
  url text NOT NULL,
  descripcion text,
  error_tecnico text,
  contexto jsonb,
  estado text DEFAULT 'nuevo' CHECK (estado IN (
    'nuevo', 'revisado', 'resuelto', 'descartado'
  )),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE errores_reportados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "errores_insert" ON errores_reportados
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "errores_admin" ON errores_reportados
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND tipo_actor = 'admin'
    )
  );
