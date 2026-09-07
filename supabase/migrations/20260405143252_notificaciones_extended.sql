-- Extender tabla de notificaciones para soportar todos los actores

-- 1. Hacer gondolero_id nullable (era NOT NULL antes)
ALTER TABLE notificaciones ALTER COLUMN gondolero_id DROP NOT NULL;

-- 2. Agregar columnas para otros actores
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS actor_id   uuid;
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS actor_tipo text CHECK (actor_tipo IN ('gondolero','marca','distribuidora','admin'));
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS link_destino text;

-- 3. Reemplazar constraint de tipo para incluir todos los tipos
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo IN (
  -- Gondolero
  'foto_aprobada',
  'foto_rechazada',
  'nivel_subido',
  'mision_aprobada',
  'puntos_acreditados',
  'nueva_campana_disponible',
  'comercio_validado',
  -- Marca
  'campana_aprobada',
  'campana_rechazada',
  'nueva_mision_recibida',
  'campana_por_vencer',
  'nueva_distribuidora_vinculada',
  'distribuidora_termino_relacion',
  -- Distribuidora
  'campana_marca_pendiente',
  'gondolero_solicitud_vinculacion',
  'gondolero_completo_mision',
  'comercio_pendiente_validacion',
  'marca_solicitud_reinicio_relacion',
  'campana_por_vencer_distri',
  -- Admin
  'admin_campana_pendiente',
  'admin_comercio_pendiente',
  'admin_error_reportado'
));

-- 4. Índice para queries de actor
CREATE INDEX IF NOT EXISTS notificaciones_actor_leida_idx
  ON notificaciones (actor_id, actor_tipo, leida);

-- 5. Policy para que cada actor vea sus propias notificaciones
--    (gondolero ya tiene su policy; esta cubre marca/distri/admin)
CREATE POLICY IF NOT EXISTS "actor_ver_sus_notificaciones"
  ON notificaciones
  FOR SELECT
  USING (
    gondolero_id = auth.uid()
    OR actor_id IN (
      SELECT marca_id  FROM profiles WHERE id = auth.uid() AND marca_id IS NOT NULL
      UNION ALL
      SELECT distri_id FROM profiles WHERE id = auth.uid() AND distri_id IS NOT NULL
    )
    OR (actor_tipo = 'admin' AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin'
    ))
  );
