-- ════════════════════════════════════════════════════════════════════════════
-- 20261008100000 — panel_pdv devuelve también departamento y provincia
--
-- ── PARA QUÉ ────────────────────────────────────────────────────────────────
-- El filtro de provincia en los paneles y el KPI de "provincias con presencia".
-- Los DOS números del KPI salen de esta función sola: provincias distintas
-- sobre todas las filas, y provincias distintas donde `verdaderos > 0`. Sin
-- consulta nueva, y usando el MISMO predicado que `agruparCobertura` ya usa
-- para `conPresencia`, así que el KPI y la tabla de cobertura no pueden
-- divergir.
--
-- ── LA CADENA ES DE CUATRO NIVELES, Y ESO NO ES UN DETALLE ──────────────────
-- **`localidades` NO tiene `provincia_id`.** Es la divergencia del dump que ya
-- costó un embed apuntando a una columna inexistente, y que `expandirZonas` en
-- `lib/zonas-gondolero.ts` tiene documentada por el mismo motivo.
--
--     comercios.localidad_id → localidades.departamento_id
--                            → departamentos.provincia_id → provincias
--
-- Medido antes de escribir esto, el 26/9/2026: la cadena resuelve para
-- **106/106 en dev y 98/98 en prod**. Cero huérfanos. Las provincias con
-- comercios son tres: Entre Ríos 80, Córdoba 15, Santa Fe 11.
--
-- ── LOS JOIN SIGUEN SIENDO LEFT, A PROPÓSITO ────────────────────────────────
-- Un comercio sin localidad NO desaparece de la función. Es la misma doctrina
-- que `agruparCobertura`, que los agrupa como "Sin ciudad asignada" en vez de
-- esconderlos: "esconderlo haría que los PDV del panel no sumen los que hay, y
-- el que haga la resta va a desconfiar del resto de los números".
--
-- Y el cero de hoy es una foto, no una propiedad: **el alta escribe
-- `localidad_sugerida_id`, no `localidad_id`**, así que todo comercio recién
-- cargado está sin provincia hasta que la distri lo confirma en su bandeja.
--
-- ── POR QUÉ HAY UN DROP, QUE ES LA PARTE PELIGROSA ──────────────────────────
-- `CREATE OR REPLACE` **no puede cambiar el tipo de retorno**: agregar columnas
-- obliga a dropear y recrear.
--
-- Y con el DROP **se van los permisos**. Supabase tiene un
-- `ALTER DEFAULT PRIVILEGES` que le da EXECUTE a `anon` y `authenticated` sobre
-- cada función nueva, de forma EXPLÍCITA. O sea que recrear sin revocar no deja
-- la función como estaba: **la deja ABIERTA**. Y acá el parámetro es una lista
-- de campañas, un dato que varias pantallas ya muestran, así que un
-- `authenticated` con EXECUTE no tendría que adivinar nada.
--
-- Por eso los REVOKE/GRANT se repiten al pie, idénticos a los de
-- `20260928100000`, y la verificación los chequea con `has_function_privilege`
-- para los tres roles. Es el mismo cuidado que ya tuvo el dry-run de
-- `20260929100000_drop_panel_marca`.
--
-- ── ES COMPATIBLE HACIA ATRÁS ───────────────────────────────────────────────
-- Los seis llamadores leen por NOMBRE (PostgREST devuelve objetos), así que una
-- columna de más no rompe a ninguno. El orden deploy/migración da igual.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Precondición: que la función exista y tenga la forma esperada. Si alguien la
-- cambió por otro lado, este DROP se llevaría algo distinto de lo que este
-- archivo cree estar reemplazando.
DO $$
BEGIN
  IF to_regprocedure('public.panel_pdv(uuid[])') IS NULL THEN
    RAISE EXCEPTION '[panel_pdv] No existe panel_pdv(uuid[]). Nada que ampliar.';
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'panel_pdv') <> 1 THEN
    RAISE EXCEPTION '[panel_pdv] Hay más de una firma de panel_pdv. Se aborta: el DROP tomaría la equivocada.';
  END IF;
END $$;

DROP FUNCTION public.panel_pdv(uuid[]);

CREATE FUNCTION public.panel_pdv(_campanas uuid[])
RETURNS TABLE (
  comercio_id       uuid,
  comercio_nombre   text,
  comercio_tipo     text,
  lat               double precision,
  lng               double precision,
  localidad_id      integer,
  localidad_nombre  text,
  -- Las tres nuevas. `departamento_nombre` viaja aunque hoy no lo pinte nadie:
  -- ya está en el JOIN que hace falta para llegar a la provincia, así que no
  -- cuesta una consulta, y el día que alguien agrupe por departamento no hay
  -- que volver a dropear la función para agregarlo.
  departamento_id   integer,
  departamento_nombre text,
  provincia_id      integer,
  provincia_nombre  text,
  misiones          bigint,
  con_valor         bigint,
  verdaderos        bigint,
  ultima_medicion   timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  WITH obs AS (
    SELECT mi.comercio_id, mi.id AS mision_id,
           bool_or(CASE WHEN jsonb_typeof(r.valor) = 'boolean'
                        THEN (r.valor #>> '{}')::boolean END) AS presente
      FROM mision_respuestas r
      JOIN bloque_campos bc ON bc.id = r.campo_id
      JOIN metricas      m  ON m.id  = bc.metrica_id
                           AND m.activa AND m.slug = 'presencia'
      JOIN misiones      mi ON mi.id = r.mision_id
                           AND mi.estado NOT IN ('descartada', 'rechazada')
      JOIN campanas      c  ON c.id  = mi.campana_id
     WHERE c.id = ANY (_campanas)
       AND r.reemplazada_por IS NULL
     GROUP BY 1, 2

    UNION ALL

    SELECT mi.comercio_id, mi.id,
           bool_or(f.declaracion = 'producto_presente')
      FROM fotos f
      JOIN misiones mi ON mi.id = f.mision_id
                      AND mi.estado NOT IN ('descartada', 'rechazada')
      JOIN campanas c  ON c.id  = mi.campana_id
      JOIN metricas m  ON m.slug = 'presencia' AND m.activa
                      AND 'declaracion_foto' = ANY (m.fuentes)
     WHERE c.id = ANY (_campanas)
       AND f.declaracion IS NOT NULL
       AND f.estado = 'aprobada'
     GROUP BY 1, 2
  ),
  visitas AS (
    SELECT mi.comercio_id,
           count(*)                                      AS misiones,
           max(COALESCE(mi.capturada_at, mi.created_at))  AS ultima
      FROM misiones mi
      JOIN campanas c ON c.id = mi.campana_id
     WHERE c.id = ANY (_campanas)
       AND mi.estado NOT IN ('descartada', 'rechazada')
     GROUP BY 1
  )
  SELECT
    co.id,
    co.nombre,
    co.tipo,
    -- `comercios.lat/lng` son `numeric`: por PostgREST llegan como número, pero
    -- por `pg` llegarían como STRING. Se castean acá y el consumidor recibe un
    -- número por los dos caminos — es el mismo cuidado que `num()` en
    -- lib/panel-metricas.ts, resuelto una vez del lado de la base.
    co.lat::double precision,
    co.lng::double precision,
    co.localidad_id,
    l.nombre,
    -- Los tres LEFT encadenados: un comercio sin localidad llega igual, con
    -- las cuatro columnas de geografía en NULL. Un INNER lo borraría de la
    -- función y del panel, que es justo lo que no se quiere.
    d.id,
    d.nombre,
    p.id,
    p.nombre,
    v.misiones,
    count(o.mision_id) FILTER (WHERE o.presente IS NOT NULL)  AS con_valor,
    count(o.mision_id) FILTER (WHERE o.presente)              AS verdaderos,
    v.ultima
  FROM visitas v
  JOIN comercios   co ON co.id = v.comercio_id
  LEFT JOIN localidades   l ON l.id = co.localidad_id
  LEFT JOIN departamentos d ON d.id = l.departamento_id
  LEFT JOIN provincias    p ON p.id = d.provincia_id
  LEFT JOIN obs      o  ON o.comercio_id = v.comercio_id
  GROUP BY co.id, co.nombre, co.tipo, co.lat, co.lng, co.localidad_id, l.nombre,
           d.id, d.nombre, p.id, p.nombre,
           v.misiones, v.ultima
  ORDER BY co.nombre;
$fn$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- Se repiten porque el DROP se los llevó, y el `ALTER DEFAULT PRIVILEGES` de
-- Supabase ya le dio EXECUTE a anon y authenticated sobre la función NUEVA, de
-- forma explícita. Revocar de PUBLIC no toca un grant explícito: hay que
-- nombrarlos. Sin estas dos líneas la migración deja la función más abierta de
-- lo que estaba.
REVOKE ALL ON FUNCTION public.panel_pdv(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_pdv(uuid[]) TO service_role;

COMMENT ON FUNCTION public.panel_pdv(uuid[]) IS
  'Un comercio por fila, con coordenadas y su geografía completa (localidad, departamento, provincia). Filtrar por una campaña es pasar un arreglo de un elemento. Los JOIN de geografía son LEFT: un comercio sin localidad llega con las cuatro columnas en NULL, no desaparece.';

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló.
DO $$
DECLARE
  _cols       integer;
  _anon       boolean;
  _auth       boolean;
  _srv        boolean;
  _campanas   uuid[];
  _filas      integer;
  _sin_prov   integer;
  _con_prov   integer;
BEGIN
  -- 1. Las columnas nuevas están.
  SELECT count(*) INTO _cols
    FROM unnest(string_to_array(pg_get_function_result(
           'public.panel_pdv(uuid[])'::regprocedure), ',')) AS t(col)
   WHERE trim(col) LIKE 'provincia_id%' OR trim(col) LIKE 'provincia_nombre%'
      OR trim(col) LIKE 'departamento_id%' OR trim(col) LIKE 'departamento_nombre%';

  IF _cols <> 4 THEN
    RAISE EXCEPTION '[panel_pdv] Se esperaban las 4 columnas de geografía y se encontraron %.', _cols;
  END IF;

  -- 2. LOS PERMISOS, que es lo que el DROP se lleva en silencio.
  SELECT has_function_privilege('anon',          'public.panel_pdv(uuid[])', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.panel_pdv(uuid[])', 'EXECUTE'),
         has_function_privilege('service_role',  'public.panel_pdv(uuid[])', 'EXECUTE')
    INTO _anon, _auth, _srv;

  IF _anon OR _auth THEN
    RAISE EXCEPTION '[panel_pdv] Quedó ejecutable por anon=% authenticated=%. El DROP se llevó los REVOKE.',
      _anon, _auth;
  END IF;
  IF NOT _srv THEN
    RAISE EXCEPTION '[panel_pdv] service_role NO puede ejecutarla: el panel entero dejaría de responder.';
  END IF;

  -- 3. LA OTRA DIRECCIÓN: que devuelva lo mismo que antes más la geografía.
  --    Se ejercita con las campañas que tengan misiones, no con un arreglo
  --    vacío — que no probaría nada.
  SELECT coalesce(array_agg(DISTINCT campana_id), ARRAY[]::uuid[]) INTO _campanas
    FROM misiones WHERE estado NOT IN ('descartada', 'rechazada');

  IF array_length(_campanas, 1) IS NULL THEN
    RAISE NOTICE '[panel_pdv] Sin misiones vivas: no se pudo ejercitar la función con datos.';
  ELSE
    SELECT count(*), count(*) FILTER (WHERE provincia_id IS NULL),
           count(*) FILTER (WHERE provincia_id IS NOT NULL)
      INTO _filas, _sin_prov, _con_prov
      FROM public.panel_pdv(_campanas);

    IF _filas = 0 THEN
      RAISE EXCEPTION '[panel_pdv] Devolvió cero filas para % campañas con misiones vivas.',
        array_length(_campanas, 1);
    END IF;

    -- Un comercio con localidad TIENE que resolver provincia: si no, la cadena
    -- de cuatro niveles está rota y el filtro mostraría de menos sin avisar.
    IF EXISTS (SELECT 1 FROM public.panel_pdv(_campanas)
                WHERE localidad_id IS NOT NULL AND provincia_id IS NULL) THEN
      RAISE EXCEPTION '[panel_pdv] Hay comercios con localidad que no resuelven provincia: la cadena localidad→departamento→provincia está rota.';
    END IF;

    RAISE NOTICE '[panel_pdv] OK — % filas, % con provincia, % sin localidad (llegan igual). service_role sí, anon/authenticated no.',
      _filas, _con_prov, _sin_prov;
  END IF;
END $$;

COMMIT;
