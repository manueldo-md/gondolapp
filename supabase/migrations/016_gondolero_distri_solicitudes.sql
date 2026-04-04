-- =============================================================================
-- Migration 016: Tabla de solicitudes de vinculación gondolero ↔ distribuidora
-- =============================================================================

CREATE TABLE IF NOT EXISTS gondolero_distri_solicitudes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gondolero_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  distri_id uuid NOT NULL REFERENCES distribuidoras ON DELETE CASCADE,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  mensaje text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (gondolero_id, distri_id)
);

ALTER TABLE gondolero_distri_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitudes_gondolero" ON gondolero_distri_solicitudes
  FOR ALL USING (gondolero_id = auth.uid());

CREATE POLICY "solicitudes_distri" ON gondolero_distri_solicitudes
  FOR ALL USING (
    distri_id = (
      SELECT distri_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "solicitudes_admin" ON gondolero_distri_solicitudes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin')
  );
