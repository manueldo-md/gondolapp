-- Agregar campos a marca_distri_relaciones para tracking de reinicio
ALTER TABLE marca_distri_relaciones
  ADD COLUMN IF NOT EXISTS fecha_fin     timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_reinicio timestamptz;

-- Tabla de solicitudes de reinicio de relación
CREATE TABLE IF NOT EXISTS relacion_reinicio_solicitudes (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  relacion_id    uuid NOT NULL REFERENCES marca_distri_relaciones ON DELETE CASCADE,
  solicitado_por text NOT NULL CHECK (solicitado_por IN ('marca', 'distri')),
  estado         text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  acepto_tyc     boolean DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE relacion_reinicio_solicitudes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actores_ven_reinicio_sus_relaciones" ON relacion_reinicio_solicitudes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM marca_distri_relaciones mdr
      WHERE mdr.id = relacion_reinicio_solicitudes.relacion_id
        AND (
          EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.marca_id = mdr.marca_id)
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.distri_id = mdr.distri_id)
        )
    )
  );

CREATE POLICY "admin_gestiona_solicitudes_reinicio" ON relacion_reinicio_solicitudes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin')
  );
