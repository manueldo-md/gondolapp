-- ─────────────────────────────────────────────────────────────────────────────
-- Panel general de la marca — la serie mensual, agregada en Postgres
--
-- ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
-- El dashboard de marca hace hoy CINCO consultas en cascada —profiles →
-- campanas → fotos (.in campanaIds) → comercios (.in comercioIds) →
-- localidades— y agrega en JS con siete pasadas de Map/Set. Cada consulta
-- necesita los ids de la anterior, así que ni siquiera puede paralelizar.
--
-- Y sobre todo: lee UNA sola fuente, `fotos.declaracion`. Medido el 23/9/2026
-- en producción, eso da números equivocados en pantalla ahora mismo:
--
--   marca        fotos aprob.  con declaración  lo que muestra  lo que es
--   Georgalos         137            112              66%          80%
--   Suprante           26              0               0%          64%
--   ACME               22              0               0%        sin datos
--
-- Suprante lee "Presencia 0%" teniendo 11 observaciones tipificadas, 7 de
-- ellas afirmativas. Es el número que la marca mira para decidir.
--
-- ── EL ANCLA ES misiones.capturada_at, NO created_at ─────────────────────────
-- Medido en prod: `mision_respuestas.created_at` dice 2026-09 en el 100% de las
-- 51 respuestas, porque es cuándo entró la fila. `misiones.capturada_at` las
-- reparte en 2026-04 y 2026-09, que es cuándo se hizo el trabajo de campo.
-- Anclar en created_at colapsaría toda la historia en un punto y el panel
-- dibujaría una raya. Las 365 misiones de las dos bases tienen capturada_at
-- cargado —cero nulos—, así que el COALESCE es un cinturón, no un parche en uso.
--
-- ── EL MES SALE COMO TEXTO, YA FORMATEADO ────────────────────────────────────
-- `date_trunc('month', ts AT TIME ZONE '...')` devuelve un `timestamp without
-- time zone`: exactamente el tipo que `new Date()` vuelve a interpretar en la
-- zona del que mira, que es el bug que cerró el tramo C'. Sale como 'YYYY-MM' y
-- no hay ninguna conversión del otro lado.
--
-- ── DOS GRANOS EN UNA PASADA: GROUPING SETS ──────────────────────────────────
-- El panel necesita el total del mes (la línea) y su desglose por campaña (el
-- punto que se abre). No alcanza con traer el desglose y sumarlo en JS, porque
-- `base_pdv` es un COUNT(DISTINCT comercio): un comercio que aparece en dos
-- campañas del mismo mes se contaría dos veces. GROUPING SETS devuelve los dos
-- granos en una sola pasada, con campana_id NULL en las filas de total.
--
-- ── SUMA Y CONTEO, NUNCA PROMEDIO ────────────────────────────────────────────
-- Para las métricas numéricas se devuelve `suma_numerica` y `obs_con_valor`, no
-- el AVG. Promediar los promedios de dos campañas con distinta cantidad de PDV
-- da un número que no es el de ninguna de las dos. El promedio lo hace el
-- consumidor, dividiendo.
--
-- ── LA OBSERVACIÓN ES LA MISIÓN, NO LA FILA ──────────────────────────────────
-- Lo fijó 20260921200000: el piloto son 2 fotos por misión y 1 misión por
-- comercio, así que 112 fotos = 56 observaciones. La misma regla se aplica a
-- las respuestas tipificadas —una fila de la CTE es una misión, no una fila de
-- respuesta— para que las dos fuentes sean comparables. Hoy da igual (hay
-- exactamente 1 respuesta vigente por par misión/métrica, y ninguna campaña
-- tiene dos preguntas de la misma métrica), pero el día que alguien agregue la
-- segunda pregunta de precio, la cuenta no se duplica sola.
--
-- ── QUÉ MISIONES CUENTAN ─────────────────────────────────────────────────────
-- Todas menos 'descartada' y 'rechazada'. Descartada es trabajo que no ocurrió
-- (descarte offline o deduplicación); rechazada es trabajo revisado y hallado
-- inválido. 'pendiente' y 'parcial' SÍ cuentan: son capturas honestas esperando
-- revisión, y excluirlas haría que el panel vaya siempre atrás de la realidad.
-- La contracara, dicha de frente: si una revisión rechaza una misión, el número
-- del mes baja. En prod hoy esto saca 2 misiones descartadas que tienen
-- respuestas tipificadas, y ninguna con declaración.
--
-- ── SEGURIDAD: INVOKER Y SOLO service_role ───────────────────────────────────
-- SECURITY INVOKER a propósito. Con DEFINER, cualquier usuario autenticado
-- podría llamarla con el marca_id de otro y leerle la serie entera. El EXECUTE
-- se revoca de PUBLIC y se otorga solo a service_role, que es con lo que los
-- Server Components de /marca ya consultan.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Índices ──────────────────────────────────────────────────────────────────
-- El plan de la serie hacía `Seq Scan on misiones`. El único índice que tocaba
-- campana_id era el PARCIAL de deduplicación, que no sirve para esto.
CREATE INDEX IF NOT EXISTS misiones_campana_id_idx
  ON public.misiones (campana_id);

-- La fuente de declaración busca por mision_id entre TODAS las fotos. Son 113
-- filas de historia congelada —`registrarMision` no escribe la columna desde
-- 20260407124015—, así que el índice parcial es diminuto, perfectamente
-- selectivo, y no va a crecer.
CREATE INDEX IF NOT EXISTS fotos_declaracion_mision_idx
  ON public.fotos (mision_id)
  WHERE declaracion IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- panel_marca_series — la serie, en los dos granos
--
-- Una fila con campana_id NULL es el TOTAL del mes para esa métrica: es la que
-- dibuja la línea. Las filas con campana_id son su desglose.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.panel_marca_series(_marca_id uuid)
RETURNS TABLE (
  mes             text,
  metrica_slug    text,
  metrica_nombre  text,
  tipo_respuesta  text,
  orden           integer,
  campana_id      uuid,
  campana_nombre  text,
  fuente          text,
  observaciones   bigint,
  base_pdv        bigint,
  obs_con_valor   bigint,
  suma_numerica   numeric,
  verdaderos      bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH obs AS (
    -- ── Fuente 1: las preguntas tipificadas ─────────────────────────────────
    -- Una fila por (misión, métrica). El bool_or / avg de adentro es lo que
    -- colapsa dos respuestas de la misma métrica en una sola observación.
    SELECT
      to_char(date_trunc('month',
        COALESCE(mi.capturada_at, mi.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'
      ), 'YYYY-MM')                                      AS mes,
      m.slug                                             AS metrica_slug,
      m.nombre                                           AS metrica_nombre,
      m.tipo_respuesta                                   AS tipo_respuesta,
      m.orden                                            AS orden,
      c.id                                               AS campana_id,
      c.nombre                                           AS campana_nombre,
      'respuestas'::text                                 AS fuente,
      mi.id                                              AS mision_id,
      mi.comercio_id                                     AS comercio_id,
      -- El jsonb_typeof no es paranoia: una métrica de tipo 'texto' o
      -- 'seleccion_unica' haría explotar el cast y con él la función entera.
      -- Así la observación igual cuenta y el valor queda en NULL.
      avg(CASE WHEN m.tipo_respuesta = 'numero'  AND jsonb_typeof(r.valor) = 'number'
               THEN (r.valor #>> '{}')::numeric END)     AS valor_numerico,
      bool_or(CASE WHEN m.tipo_respuesta = 'binaria' AND jsonb_typeof(r.valor) = 'boolean'
                   THEN (r.valor #>> '{}')::boolean END) AS valor_bool
    FROM mision_respuestas r
    JOIN bloque_campos bc ON bc.id = r.campo_id
    JOIN metricas      m  ON m.id  = bc.metrica_id AND m.activa
    JOIN misiones      mi ON mi.id = r.mision_id
                         AND mi.estado NOT IN ('descartada', 'rechazada')
    JOIN campanas      c  ON c.id  = mi.campana_id
    WHERE c.marca_id = _marca_id
      AND r.reemplazada_por IS NULL
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

    UNION ALL

    -- ── Fuente 2: fotos.declaracion, historia congelada ─────────────────────
    -- El JOIN a metricas no es decorativo: si alguien saca 'declaracion_foto'
    -- de metricas.fuentes, el panel deja de usar esta fuente sin tocar código.
    -- Es para lo que esa columna existe.
    SELECT
      to_char(date_trunc('month',
        COALESCE(mi.capturada_at, mi.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'
      ), 'YYYY-MM'),
      m.slug, m.nombre, m.tipo_respuesta, m.orden,
      c.id, c.nombre,
      'declaracion_foto'::text,
      mi.id, mi.comercio_id,
      NULL::numeric,
      -- 'solo_competencia' cuenta como AUSENCIA, no se excluye: el producto no
      -- está y además hay competencia. Es una observación con información de
      -- más, no una visita fallida. (Ver 20260921200000.)
      bool_or(f.declaracion = 'producto_presente')
    FROM fotos f
    -- El INNER JOIN a misiones es además el filtro de `declaracionEsObservacion`:
    -- descarta la foto de fachada del alta de comercio, que actions-comercios.ts
    -- escribe con 'producto_presente' FIJO y sin mision_id. 1 fila en prod.
    JOIN misiones mi ON mi.id = f.mision_id
                    AND mi.estado NOT IN ('descartada', 'rechazada')
    JOIN campanas c  ON c.id  = mi.campana_id
    JOIN metricas m  ON m.slug = 'presencia'
                    AND m.activa
                    AND 'declaracion_foto' = ANY (m.fuentes)
    WHERE c.marca_id = _marca_id
      AND f.declaracion IS NOT NULL
      AND f.estado = 'aprobada'
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
  )
  SELECT
    o.mes,
    o.metrica_slug,
    -- nombre / tipo / orden son 1:1 con el slug, así que min() devuelve el
    -- único valor que hay. Van acá y no en la clave para no repetirlos en los
    -- dos grouping sets.
    min(o.metrica_nombre)                                AS metrica_nombre,
    min(o.tipo_respuesta)                                AS tipo_respuesta,
    min(o.orden)                                         AS orden,
    o.campana_id,
    o.campana_nombre,
    o.fuente,
    count(*)                                             AS observaciones,
    count(DISTINCT o.comercio_id)                        AS base_pdv,
    count(*) FILTER (WHERE o.valor_numerico IS NOT NULL
                        OR o.valor_bool     IS NOT NULL) AS obs_con_valor,
    sum(o.valor_numerico)                                AS suma_numerica,
    count(*) FILTER (WHERE o.valor_bool)                 AS verdaderos
  FROM obs o
  GROUP BY GROUPING SETS (
    (o.mes, o.metrica_slug),
    (o.mes, o.metrica_slug, o.campana_id, o.campana_nombre, o.fuente)
  )
  ORDER BY o.mes, min(o.orden), o.campana_nombre NULLS FIRST;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- panel_marca_visitas — la OTRA base de cálculo
--
-- No cuelga de ninguna métrica, por eso es una función aparte y no una fila más
-- de la serie: es "cuántos PDV se visitaron ese mes", contra los cuales se lee
-- "cuántos midieron algo". La brecha entre las dos es el dato: dice cuántas
-- visitas no midieron nada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.panel_marca_visitas(_marca_id uuid)
RETURNS TABLE (
  mes            text,
  pdv_visitados  bigint,
  misiones       bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT
    to_char(date_trunc('month',
      COALESCE(mi.capturada_at, mi.created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires'
    ), 'YYYY-MM')                   AS mes,
    count(DISTINCT mi.comercio_id)  AS pdv_visitados,
    count(*)                        AS misiones
  FROM misiones mi
  JOIN campanas c ON c.id = mi.campana_id
  WHERE c.marca_id = _marca_id
    AND mi.estado NOT IN ('descartada', 'rechazada')
  GROUP BY 1
  ORDER BY 1;
$fn$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC NO ALCANZA, y el dry-run lo agarró: Supabase tiene un
-- ALTER DEFAULT PRIVILEGES que le da EXECUTE a anon y authenticated sobre cada
-- función nueva, de forma EXPLÍCITA. Revocar de PUBLIC no toca un grant
-- explícito, así que la función quedaba llamable por cualquier usuario logueado
-- con el marca_id de otro — la serie entera de otra marca. Hay que nombrarlos.
REVOKE ALL ON FUNCTION public.panel_marca_series(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.panel_marca_visitas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_marca_series(uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.panel_marca_visitas(uuid) TO service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Corre dentro de la transacción: si algo de esto no da, la migración no
-- commitea. Son invariantes, no los números de una base concreta — los números
-- congelados los chequea scripts/probar-migracion-panel-marca.mjs.
DO $verif$
DECLARE
  _marca   uuid;
  _filas   int;
  _totales int;
  _idx     int;
BEGIN
  SELECT count(*) INTO _idx FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('misiones_campana_id_idx', 'fotos_declaracion_mision_idx');
  IF _idx <> 2 THEN
    RAISE EXCEPTION 'Faltan índices: se esperaban 2 y hay %', _idx;
  END IF;

  -- Que ningún rol de cliente pueda llamarlas con el marca_id de otro.
  IF has_function_privilege('authenticated', 'public.panel_marca_series(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.panel_marca_series(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.panel_marca_visitas(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.panel_marca_visitas(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon o authenticated pueden ejecutar las funciones del panel';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.panel_marca_series(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role no puede ejecutar panel_marca_series';
  END IF;

  -- La marca con más observaciones de declaración: es el piloto, y es la que
  -- hace que el panel no arranque en blanco.
  SELECT c.marca_id INTO _marca
    FROM fotos f
    JOIN misiones mi ON mi.id = f.mision_id
    JOIN campanas c  ON c.id  = mi.campana_id
   WHERE f.declaracion IS NOT NULL AND c.marca_id IS NOT NULL
   GROUP BY c.marca_id
   ORDER BY count(*) DESC
   LIMIT 1;

  IF _marca IS NULL THEN
    RAISE EXCEPTION 'No hay ninguna marca con declaraciones: la verificación no probaría nada';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE s.campana_id IS NULL)
    INTO _filas, _totales
    FROM public.panel_marca_series(_marca) s;

  IF _filas = 0 THEN
    RAISE EXCEPTION 'panel_marca_series devolvió 0 filas para una marca con datos';
  END IF;
  IF _totales = 0 THEN
    RAISE EXCEPTION 'No hay filas de TOTAL (campana_id NULL): el GROUPING SETS no está agrupando';
  END IF;
  IF _totales = _filas THEN
    RAISE EXCEPTION 'No hay filas de DESGLOSE: el GROUPING SETS devolvió un solo grano';
  END IF;

  -- Un desglose nunca puede superar a su total.
  IF EXISTS (
    SELECT 1
      FROM public.panel_marca_series(_marca) t
      JOIN public.panel_marca_series(_marca) d
        ON d.mes = t.mes AND d.metrica_slug = t.metrica_slug AND d.campana_id IS NOT NULL
     WHERE t.campana_id IS NULL
       AND (d.observaciones > t.observaciones OR d.base_pdv > t.base_pdv)
  ) THEN
    RAISE EXCEPTION 'Un desglose supera a su total: el rollup está mal armado';
  END IF;

  -- La base de una métrica nunca puede superar los PDV visitados del mes.
  IF EXISTS (
    SELECT 1
      FROM public.panel_marca_series(_marca) s
      JOIN public.panel_marca_visitas(_marca) v ON v.mes = s.mes
     WHERE s.campana_id IS NULL AND s.base_pdv > v.pdv_visitados
  ) THEN
    RAISE EXCEPTION 'Una métrica declara más PDV que los visitados en el mes';
  END IF;

  RAISE NOTICE 'OK — serie: % filas, % de total, % de desglose', _filas, _totales, _filas - _totales;
END
$verif$;

COMMIT;
