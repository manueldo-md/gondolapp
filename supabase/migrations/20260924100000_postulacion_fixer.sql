-- =============================================================================
-- Postulación de fixers a campañas — ETAPA 1: el schema
-- =============================================================================
-- Este archivo NO enciende ninguna funcionalidad. Abre las columnas y arregla
-- dos CHECK que hoy están rechazando escrituras en silencio. El código de las
-- etapas 2 a 6 llega después.
--
-- ── LO QUE ARREGLA, Y QUE NO ES PARTE DE LA FEATURE ─────────────────────────
--
-- `notificaciones.tipo` RECHAZA CUATRO TIPOS QUE EL CÓDIGO ESCRIBE HOY.
-- Probado contra dev insertando cada uno:
--
--     tipo='vinculacion_invitacion'          → 23514 RECHAZADO
--     tipo='vinculacion_invitacion_enviada'  → 23514
--     tipo='vinculacion_nueva'               → 23514
--     tipo='desvinculacion_repositora'       → 23514
--     actor_tipo='fixer'                     → 23514
--     actor_tipo='repositora'                → 23514
--
-- Los tres paneles de invitación escriben `vinculacion_invitacion` **sin
-- chequear el error** —una de las 137— así que desde que existe ese flujo
-- ningún gondolero ni fixer recibió el aviso de que lo invitaron. La tabla lo
-- confirma: CERO filas de ese tipo en dev, con vínculos aprobados existiendo.
--
-- Y `aprobarSolicitudFixer` escribe `actor_tipo='fixer'`, que también rebota:
-- el fixer tampoco se entera de que lo aprobaron. Ese es exactamente el último
-- paso del flujo que este tramo viene a construir, así que arreglarlo no es un
-- extra: es el piso.
--
-- ── LO QUE NO HIZO FALTA ────────────────────────────────────────────────────
-- `estado='rechazada'` YA lo aceptan las dos tablas de fixer. Verificado contra
-- la base viva y probado insertando la fila. No hay nada que corregir ahí.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El flag de la campaña.
--
--    OJO CON `campanas.es_abierta`, QUE YA EXISTE Y SIGNIFICA OTRA COSA: es el
--    escape del filtro de zona (`gondolero/campanas/page.tsx`), no "abierta a
--    cualquiera". Reusarla mezclaría dos reglas que no tienen nada que ver.
--
--    `NOT NULL DEFAULT false` y no nullable: "no sé" no es un estado válido acá
--    — o la campaña acepta postulaciones o no las acepta. Las 21 de dev y las 9
--    de prod nacen en false, que es el comportamiento de hoy.
--
--    Quién puede ponerlo en true lo decide el editor, no la base: solo campañas
--    con `actor_campana='fixer'` Y con ejecutor (`repositora_id` o `distri_id`).
--    Una campaña de GondolApp ya está abierta a todos por `accesoACampana`, así
--    que no hay a qué postularse. No va como CHECK porque el editor construye la
--    fila por partes y un CHECK ahí rebotaría borradores a medio llenar.
-- ---------------------------------------------------------------------------
ALTER TABLE public.campanas
  ADD COLUMN IF NOT EXISTS abierta_a_postulaciones boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campanas.abierta_a_postulaciones IS
  'Un fixer sin vínculo con el ejecutor la ve como oferta y puede postularse. Solo tiene sentido con actor_campana=fixer y con ejecutor: las de GondolApp ya son abiertas. NO confundir con es_abierta, que es el escape del filtro de zona.';

-- ---------------------------------------------------------------------------
-- 2. `iniciado_por` en las solicitudes de repositora.
--
--    `fixer_distri_solicitudes` la tiene desde abril; `fixer_repo_solicitudes`
--    NO — y eso bloquea el tramo, no es un detalle de prolijidad.
--
--    El perfil del fixer muestra TODA solicitud de repositora en 'pendiente'
--    como una invitación para aceptar, mientras que las de distri las filtra con
--    `iniciado_por = 'distri'`. Sin esta columna, **la postulación del propio
--    fixer le aparecería a él mismo como una invitación que puede auto-aceptar**,
--    y el vínculo quedaría aprobado sin que la repositora hiciera nada.
--
--    DEFAULT 'repositora' y no 'fixer': las 6 filas de dev y las 6 de prod las
--    creó la repositora invitando. El default tiene que describir lo que hay, no
--    lo que viene.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fixer_repo_solicitudes
  ADD COLUMN IF NOT EXISTS iniciado_por text DEFAULT 'repositora';

ALTER TABLE public.fixer_repo_solicitudes
  DROP CONSTRAINT IF EXISTS fixer_repo_solicitudes_iniciado_por_check;

ALTER TABLE public.fixer_repo_solicitudes
  ADD CONSTRAINT fixer_repo_solicitudes_iniciado_por_check
  CHECK (iniciado_por = ANY (ARRAY['fixer'::text, 'repositora'::text]));

-- ---------------------------------------------------------------------------
-- 3. El rechazo: cuándo fue y por qué.
--
--    ── POR QUÉ UNA COLUMNA PROPIA Y NO `updated_at` ──────────────────────────
--    La ventana de 30 días decide si alguien puede volver a postularse, o sea
--    si puede trabajar. `updated_at` lo mueve CUALQUIER escritura futura sobre
--    la fila, así que apoyar una regla de negocio ahí es pedir que dentro de seis
--    meses una escritura sin relación le reabra o le cierre la puerta a alguien
--    sin que nada falle. Es el mismo criterio por el que `puntos-retenidos` no
--    lee `participaciones.comercios_completados`.
--
--    (Hoy no hay triggers sobre estas dos tablas —verificado— así que `updated_at`
--    solo se mueve cuando el código lo escribe. Eso es una propiedad de hoy, no
--    una garantía.)
--
--    ── EL MOTIVO ES OPCIONAL ────────────────────────────────────────────────
--    A diferencia del rechazo de un comercio, donde es obligatorio porque cada
--    motivo manda al gondolero a hacer algo distinto. Acá el fixer ve "Tu
--    postulación no fue aceptada" y no hay nada que pueda hacer al respecto por
--    30 días: exigirle un texto a quien rechaza solo produciría textos vacíos.
-- ---------------------------------------------------------------------------
ALTER TABLE public.fixer_repo_solicitudes
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS rechazada_at   timestamptz;

ALTER TABLE public.fixer_distri_solicitudes
  ADD COLUMN IF NOT EXISTS motivo_rechazo text,
  ADD COLUMN IF NOT EXISTS rechazada_at   timestamptz;

COMMENT ON COLUMN public.fixer_repo_solicitudes.rechazada_at IS
  'Cuándo se rechazó. Manda la ventana de 30 días para volver a postularse. Columna propia y no updated_at: una regla que decide acceso no puede apoyarse en una marca que mueve cualquier escritura.';
COMMENT ON COLUMN public.fixer_distri_solicitudes.rechazada_at IS
  'Cuándo se rechazó. Ver el comentario de fixer_repo_solicitudes.rechazada_at.';

-- ---------------------------------------------------------------------------
-- 4. Los dos CHECK de `notificaciones`.
--
--    Se reescriben enteros porque un CHECK no se amplía: se reemplaza. La lista
--    de abajo es la de la base —verificada IDÉNTICA en dev y prod el 23/9/2026—
--    más los cinco que faltan.
--
--    El rechazo de la postulación NO lleva tipo nuevo: reusa
--    `solicitud_rechazada`, que ya existe y ya se usa para exactamente eso.
-- ---------------------------------------------------------------------------
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE public.notificaciones
  ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo = ANY (ARRAY[
    -- ── Los que ya estaban ──────────────────────────────────────────────────
    'foto_aprobada'::text, 'foto_rechazada'::text, 'nivel_subido'::text,
    'mision_aprobada'::text, 'puntos_acreditados'::text,
    'nueva_campana_disponible'::text, 'comercio_validado'::text,
    'campana_aprobada'::text, 'campana_rechazada'::text,
    'nueva_mision_recibida'::text, 'campana_por_vencer'::text,
    'nueva_distribuidora_vinculada'::text, 'distribuidora_termino_relacion'::text,
    'campana_marca_pendiente'::text, 'gondolero_solicitud_vinculacion'::text,
    'gondolero_completo_mision'::text, 'comercio_pendiente_validacion'::text,
    'marca_solicitud_reinicio_relacion'::text, 'campana_por_vencer_distri'::text,
    'admin_campana_pendiente'::text, 'admin_comercio_pendiente'::text,
    'admin_error_reportado'::text, 'solicitud_aprobada'::text,
    'solicitud_rechazada'::text, 'desvinculacion_distri'::text,
    'cambios_solicitados'::text, 'campana_cerrada_por_tope'::text,
    'comercio_ubicacion_reportada'::text, 'comercio_rechazado'::text,
    -- ── Los CUATRO que el código ya escribe y la base rechazaba ─────────────
    'vinculacion_invitacion'::text,          -- los 3 paneles de invitación
    'vinculacion_invitacion_enviada'::text,
    'vinculacion_nueva'::text,
    'desvinculacion_repositora'::text,       -- repositora/fixers desvincular
    -- ── El del tramo: un fixer se postuló a una campaña ─────────────────────
    'postulacion_fixer'::text
  ]));

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_actor_tipo_check;

-- `fixer` y `repositora` faltaban, y `aprobarSolicitudFixer` ya escribe
-- actor_tipo='fixer': esa notificación viene rebotando desde siempre.
ALTER TABLE public.notificaciones
  ADD CONSTRAINT notificaciones_actor_tipo_check CHECK (actor_tipo = ANY (ARRAY[
    'gondolero'::text, 'fixer'::text, 'marca'::text,
    'distribuidora'::text, 'repositora'::text, 'admin'::text
  ]));

-- ---------------------------------------------------------------------------
-- 5. Verificación. Falla con EXCEPTION y adentro de la transacción, así que si
--    algo no quedó como se esperaba NO entra nada.
--
--    Se chequean LAS DOS direcciones: que lo nuevo entre y que lo viejo siga
--    entrando. Mirar una sola deja pasar el error caro — acá sería reescribir el
--    CHECK de `tipo` y perderse un tipo de los 29 que ya andaban.
-- ---------------------------------------------------------------------------
DO $verif$
DECLARE
  _faltan text[] := ARRAY[]::text[];
  _t      text;
  _gond   uuid;
BEGIN
  -- Las columnas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='campanas' AND column_name='abierta_a_postulaciones') THEN
    RAISE EXCEPTION '[postulacion] falta campanas.abierta_a_postulaciones';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='fixer_repo_solicitudes' AND column_name='iniciado_por') THEN
    RAISE EXCEPTION '[postulacion] falta fixer_repo_solicitudes.iniciado_por';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name IN ('fixer_repo_solicitudes','fixer_distri_solicitudes')
        AND column_name IN ('motivo_rechazo','rechazada_at')) <> 4 THEN
    RAISE EXCEPTION '[postulacion] faltan columnas de rechazo en las tablas de fixer';
  END IF;

  -- Las 12 filas existentes quedaron etiquetadas como lo que son.
  IF EXISTS (SELECT 1 FROM fixer_repo_solicitudes WHERE iniciado_por IS NULL) THEN
    RAISE EXCEPTION '[postulacion] hay solicitudes de repositora sin iniciado_por';
  END IF;

  SELECT id INTO _gond FROM profiles WHERE tipo_actor = 'gondolero' LIMIT 1;

  -- Que ENTRE lo nuevo Y que siga entrando lo viejo. Se prueba insertando de
  -- verdad y revirtiendo con un savepoint: un CHECK se lee mal muy fácil.
  FOREACH _t IN ARRAY ARRAY[
    'vinculacion_invitacion', 'vinculacion_invitacion_enviada', 'vinculacion_nueva',
    'desvinculacion_repositora', 'postulacion_fixer',
    'foto_aprobada', 'solicitud_aprobada', 'solicitud_rechazada', 'comercio_rechazado'
  ] LOOP
    BEGIN
      INSERT INTO notificaciones (gondolero_id, tipo, titulo, mensaje, leida)
      VALUES (_gond, _t, 'dry', 'dry', false);
      RAISE EXCEPTION 'ok_rollback';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'ok_rollback' THEN RAISE; END IF;
      WHEN check_violation THEN
        _faltan := _faltan || _t;
    END;
  END LOOP;

  FOREACH _t IN ARRAY ARRAY['gondolero','fixer','marca','distribuidora','repositora','admin'] LOOP
    BEGIN
      INSERT INTO notificaciones (gondolero_id, tipo, titulo, mensaje, leida, actor_tipo, actor_id)
      VALUES (_gond, 'foto_aprobada', 'dry', 'dry', false, _t, _gond);
      RAISE EXCEPTION 'ok_rollback';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'ok_rollback' THEN RAISE; END IF;
      WHEN check_violation THEN
        _faltan := _faltan || ('actor_tipo=' || _t);
    END;
  END LOOP;

  IF cardinality(_faltan) > 0 THEN
    RAISE EXCEPTION '[postulacion] el CHECK de notificaciones rechaza: %', array_to_string(_faltan, ', ');
  END IF;

  RAISE NOTICE '[postulacion] OK — columnas puestas, las 12 solicitudes etiquetadas, y los 9 tipos + 6 actor_tipo entran';
END;
$verif$;

COMMIT;
