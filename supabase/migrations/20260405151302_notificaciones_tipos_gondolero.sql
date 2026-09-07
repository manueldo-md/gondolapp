-- Agregar tipos de notificación faltantes para gondoleros
-- (solicitud_aprobada, solicitud_rechazada, desvinculacion_distri estaban en el código
--  pero no en el constraint, causando errores silenciosos en cada aprobación)
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
  'solicitud_aprobada',
  'solicitud_rechazada',
  'desvinculacion_distri',
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
