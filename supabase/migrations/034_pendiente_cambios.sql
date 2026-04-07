-- Agregar estado 'pendiente_cambios' a campanas y tipo 'cambios_solicitados' a notificaciones

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_estado_check;
ALTER TABLE campanas ADD CONSTRAINT campanas_estado_check
CHECK (estado IN ('borrador','pendiente_aprobacion','activa','pausada','cerrada','pendiente_cambios'));

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo IN (
  'foto_aprobada','foto_rechazada','nivel_subido','mision_aprobada','puntos_acreditados',
  'nueva_campana_disponible','comercio_validado','campana_aprobada','campana_rechazada',
  'nueva_mision_recibida','campana_por_vencer','nueva_distribuidora_vinculada',
  'distribuidora_termino_relacion','campana_marca_pendiente','gondolero_solicitud_vinculacion',
  'gondolero_completo_mision','comercio_pendiente_validacion','marca_solicitud_reinicio_relacion',
  'campana_por_vencer_distri','admin_campana_pendiente','admin_comercio_pendiente',
  'admin_error_reportado','solicitud_aprobada','solicitud_rechazada','desvinculacion_distri',
  'cambios_solicitados'
));
