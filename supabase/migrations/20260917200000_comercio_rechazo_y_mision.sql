-- ─────────────────────────────────────────────────────────────────────────────
-- Validación de comercios: motivo de rechazo y aviso al gondolero
--
-- Contexto (17/9/2026): una campaña `tipo='comercios'` nunca creó la misión del
-- alta. El gondolero cargaba el comercio y no cobraba nunca, porque
-- `min_comercios_para_cobrar` cuenta comercios distintos con misión APROBADA y
-- esa misión no existía. A partir de este tramo la misión se crea al VALIDAR el
-- comercio y se aprueba por el mismo camino que el resto (aprobarMisionCore),
-- así que el bounty y el mínimo funcionan igual que en cualquier campaña.
--
-- Esta migración habilita las dos mitades que faltaban en la base:
--
--   1. `comercios.motivo_rechazo` — hoy un comercio se rechaza y no queda
--      escrito por qué. `fotos` tiene la columna desde siempre; `comercios` no.
--      Sin ella el rechazo es una puerta que se cierra sin explicación.
--
--   2. El tipo de notificación `comercio_rechazado`. `comercio_validado` ya
--      estaba en el CHECK desde abril — y NADIE lo emitía. O sea que el
--      gondolero daba de alta un comercio y no se enteraba de nada, ni si le
--      sirvió ni si no. Los dos avisos salen juntos a propósito: si solo se
--      avisa el rechazo, el silencio pasa a significar "todavía no te
--      aprobaron" en vez de "salió bien".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;

COMMENT ON COLUMN comercios.motivo_rechazo IS
  'Por qué se rechazó el alta. Obligatorio al rechazar: viaja al texto de la '
  'notificación que recibe el gondolero. Espejo de fotos.motivo_rechazo.';

-- El CHECK se reescribe entero porque Postgres no permite agregarle valores a
-- uno existente. La lista es la de 20260915220000 más 'comercio_rechazado'.
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
  -- Parte B de corrección de ubicación
  'comercio_ubicacion_reportada',
  -- Nuevo — el alta de comercio rechazada, con motivo
  'comercio_rechazado'
));
