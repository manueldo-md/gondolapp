-- notificaciones.tipo — agregar 'comercio_ubicacion_reportada'
--
-- Parte B de la corrección de ubicación: cuando un gondolero reporta que un
-- comercio está mal ubicado, se le avisa a su distribuidora con link al detalle
-- del comercio. Sin el aviso, la ruta linkeable no sirve de nada: el reporte
-- espera a que alguien entre por casualidad a la lista.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Y DE PASO, UN BUG QUE ESTABA LATENTE
-- ─────────────────────────────────────────────────────────────────────────────
-- 'campana_cerrada_por_tope' está en el union TipoNotificacion de
-- lib/notificaciones.ts y lo usan TRES llamadas en registrarMision (admin, marca
-- y distribuidora, al cerrarse una campaña por alcanzar el tope) — pero nunca
-- entró al CHECK de la tabla.
--
-- O sea que cada vez que una campaña se cierra automáticamente, los tres avisos
-- fallan con violación de constraint. Y fallan EN SILENCIO: los helpers de
-- lib/notificaciones.ts loguean el error y devuelven { error }, no tiran. Así
-- que la campaña se cierra y no se entera nadie.
--
-- Se agrega acá porque esta migración ya reescribe ese mismo CHECK. Dejarlo
-- afuera sabiendo que está roto sería volver a escribir la lista completa
-- mañana.
--
-- El CHECK se reemplaza entero, como vienen haciendo las migraciones
-- anteriores: DROP + ADD con la lista completa. Es frágil —cada tipo nuevo
-- obliga a copiar toda la lista y es fácil perder uno por el camino, que es
-- exactamente lo que pasó con campana_cerrada_por_tope— pero cambiar el patrón
-- ahora es otro trabajo.

ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo IN (
  -- Gondolero
  'foto_aprobada','foto_rechazada','nivel_subido','mision_aprobada','puntos_acreditados',
  'nueva_campana_disponible','comercio_validado',
  -- Marca
  'campana_aprobada','campana_rechazada','nueva_mision_recibida','campana_por_vencer',
  'nueva_distribuidora_vinculada','distribuidora_termino_relacion',
  -- Distribuidora
  'campana_marca_pendiente','gondolero_solicitud_vinculacion','gondolero_completo_mision',
  'comercio_pendiente_validacion','marca_solicitud_reinicio_relacion','campana_por_vencer_distri',
  -- Admin
  'admin_campana_pendiente','admin_comercio_pendiente','admin_error_reportado',
  -- Vinculaciones
  'solicitud_aprobada','solicitud_rechazada','desvinculacion_distri','cambios_solicitados',
  -- Faltaba: lo emiten tres llamadas de registrarMision desde abril
  'campana_cerrada_por_tope',
  -- Nuevo — Parte B de corrección de ubicación
  'comercio_ubicacion_reportada'
));
