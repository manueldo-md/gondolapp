-- ─────────────────────────────────────────────────────────────────────────────
-- panel_series / panel_visitas / panel_pdv — el scope pasa a ser una LISTA DE
-- CAMPAÑAS, y deja de ser "la marca dueña".
--
-- ── QUÉ PROBLEMA RESUELVE ────────────────────────────────────────────────────
-- Las tres funciones del panel filtran por `c.marca_id = _marca_id`. Una
-- distribuidora no es dueña de ninguna campaña de marca: ejecuta campañas, y
-- las suyas propias tienen `distri_id`. Con el filtro por dueño, el panel de
-- métricas no se le puede mostrar.
--
-- ── POR QUÉ UNA LISTA Y NO UN SEGUNDO PARÁMETRO ──────────────────────────────
-- La alternativa era agregar `_distri_id` y un OR. Se descartó: duplicar el
-- cuerpo del SQL es duplicar las reglas que más costaron —las dos fuentes de
-- presencia, el grano por (misión, fuente), el ancla en `capturada_at`, los
-- estados de misión excluidos, el GROUPING SETS— y garantizar que el día que
-- alguien corrija una, la otra quede vieja en silencio.
--
-- Con `uuid[]` **el cuerpo es el mismo para los dos actores** y lo único que
-- cambia es quién arma la lista. Eso vive en TypeScript, en un solo lugar:
-- `lib/campanas-de.ts`.
--
-- ── EL SCOPE DE MARCA NO PUEDE CAMBIAR NI UN NÚMERO ──────────────────────────
-- Es la condición de esta migración y está verificada abajo, DENTRO de la
-- transacción: para CADA marca, las tres funciones nuevas —llamadas con las
-- campañas de esa marca— devuelven exactamente las mismas filas que las tres
-- viejas. Si alguna difiere en una sola fila, la migración no commitea.
--
-- ── LO QUE ESTA MIGRACIÓN NO HACE: EL DROP DE LAS VIEJAS ─────────────────────
-- Las tres funciones `panel_marca_*` **siguen existiendo a propósito**. El
-- orden es el mismo que este proyecto ya usó para `profiles.nivel`: código que
-- deja de usarlas → deploy → verificar en producción → DROP. Al revés, el
-- deploy anterior se queda llamando funciones que ya no existen.
--
-- Es una ventana con DOS PUERTAS a lo mismo, y eso es exactamente lo que este
-- tramo vino a eliminar: mientras dure, `panel_marca_series(uuid)` compila y
-- alguien la puede llamar salteándose `campanasDe`. El DROP está anotado como
-- pendiente en CLAUDE.md y va en la migración siguiente.
--
-- ── NO ES UN `CREATE OR REPLACE` CON UN PARÁMETRO NUEVO ──────────────────────
-- Los nombres son NUEVOS (`panel_series`, no `panel_marca_series`), así que no
-- hay sobrecarga posible. Ese cuidado viene de `generar_codigo_gondolero`
-- (20260923100000) y de `panel_marca_pdv` (20260927100000): `CREATE OR REPLACE`
-- con una firma distinta **crea una sobrecarga**, no reemplaza.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- panel_series
--
-- Cuerpo IDÉNTICO a panel_marca_series salvo el predicado de scope:
--     c.marca_id = _marca_id     →     c.id = ANY (_campanas)
-- Cualquier otra diferencia es un bug, y el bloque de verificación de abajo la
-- detecta comparando fila por fila contra la función vieja.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.panel_series(_campanas uuid[])
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
    WHERE c.id = ANY (_campanas)
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
    WHERE c.id = ANY (_campanas)
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
-- panel_visitas — la OTRA base de cálculo
--
-- No cuelga de ninguna métrica: es "cuántos PDV se visitaron ese mes", contra
-- los cuales se lee "cuántos midieron algo". La brecha entre las dos es el
-- dato: dice cuántas visitas no midieron nada.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.panel_visitas(_campanas uuid[])
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
  WHERE c.id = ANY (_campanas)
    AND mi.estado NOT IN ('descartada', 'rechazada')
  GROUP BY 1
  ORDER BY 1;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- panel_pdv — un comercio por fila, con coordenadas
--
-- El `_campana_id` opcional de `panel_marca_pdv` DESAPARECE, y no se reemplaza
-- por nada: filtrar por una campaña es pasar un arreglo de un elemento. Un
-- parámetro menos y una regla menos.
--
-- OJO con eso del lado del llamador: `panel_marca_pdv` filtraba por marca Y por
-- campaña, así que un `campana_id` ajeno llegado por la URL no devolvía nada.
-- Acá no hay dueño contra el cual contrastar: **la lista ES el permiso**. Por
-- eso `campanasDe()` intersecta lo pedido contra lo que el actor puede ver, y
-- ninguna pantalla arma el arreglo por su cuenta.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.panel_pdv(_campanas uuid[])
RETURNS TABLE (
  comercio_id      uuid,
  comercio_nombre  text,
  comercio_tipo    text,
  lat              double precision,
  lng              double precision,
  localidad_id     integer,
  localidad_nombre text,
  misiones         bigint,
  con_valor        bigint,
  verdaderos       bigint,
  ultima_medicion  timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
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
    v.misiones,
    count(o.mision_id) FILTER (WHERE o.presente IS NOT NULL)  AS con_valor,
    count(o.mision_id) FILTER (WHERE o.presente)              AS verdaderos,
    v.ultima
  FROM visitas v
  JOIN comercios   co ON co.id = v.comercio_id
  LEFT JOIN localidades l ON l.id = co.localidad_id
  LEFT JOIN obs      o  ON o.comercio_id = v.comercio_id
  GROUP BY co.id, co.nombre, co.tipo, co.lat, co.lng, co.localidad_id, l.nombre,
           v.misiones, v.ultima
  ORDER BY co.nombre;
$fn$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC NO ALCANZA: Supabase tiene un ALTER DEFAULT PRIVILEGES que
-- le da EXECUTE a anon y authenticated sobre cada función nueva, de forma
-- EXPLÍCITA, y revocar de PUBLIC no toca un grant explícito. Hay que nombrarlos.
--
-- Y acá pesa más que en 20260925100000: el parámetro ya no es "de quién son los
-- datos" sino "qué campañas quiero ver". Un `authenticated` que pudiera
-- ejecutarlas no necesitaría adivinar el uuid de una marca — le alcanzaría con
-- un id de campaña, que es un dato que varias pantallas ya le muestran.
REVOKE ALL ON FUNCTION public.panel_series(uuid[])  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.panel_visitas(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.panel_pdv(uuid[])     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_series(uuid[])  TO service_role;
GRANT EXECUTE ON FUNCTION public.panel_visitas(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.panel_pdv(uuid[])     TO service_role;

COMMENT ON FUNCTION public.panel_series(uuid[]) IS
  'Serie mensual por métrica. El scope es la LISTA DE CAMPAÑAS: la arma lib/campanas-de.ts, que es el único lugar que sabe cuáles son las de cada actor.';
COMMENT ON FUNCTION public.panel_visitas(uuid[]) IS
  'PDV visitados y misiones por mes. Cuenta las visitas hayan medido o no: la brecha contra panel_series es el dato.';
COMMENT ON FUNCTION public.panel_pdv(uuid[]) IS
  'Un comercio por fila, con coordenadas. Filtrar por una campaña es pasar un arreglo de un elemento.';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN — corre dentro de la transacción: si algo no da, no commitea.
--
-- El invariante que define esta migración: **el scope de marca no cambia ni un
-- número**. Se compara con EXCEPT ALL en las dos direcciones, que además del
-- contenido detecta diferencias de MULTIPLICIDAD — dos filas idénticas donde
-- antes había una es un bug de agregación, y un EXCEPT a secas no lo vería.
-- ─────────────────────────────────────────────────────────────────────────────
DO $verif$
DECLARE
  _m        record;
  _campanas uuid[];
  _dif      bigint;
  _marcas   int := 0;
  _filas    bigint := 0;
BEGIN
  -- 1. Que anon y authenticated no puedan ejecutarlas.
  IF has_function_privilege('authenticated', 'public.panel_series(uuid[])',  'EXECUTE')
  OR has_function_privilege('anon',          'public.panel_series(uuid[])',  'EXECUTE')
  OR has_function_privilege('authenticated', 'public.panel_visitas(uuid[])', 'EXECUTE')
  OR has_function_privilege('anon',          'public.panel_visitas(uuid[])', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.panel_pdv(uuid[])',     'EXECUTE')
  OR has_function_privilege('anon',          'public.panel_pdv(uuid[])',     'EXECUTE') THEN
    RAISE EXCEPTION '[panel scope] anon o authenticated pueden ejecutar las funciones nuevas';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.panel_pdv(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION '[panel scope] service_role no puede ejecutar panel_pdv';
  END IF;

  -- 2. Una sola firma por nombre. Un CREATE OR REPLACE con otra firma crearía
  --    una sobrecarga y la llamada pasaría a ser ambigua (42725).
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('panel_series', 'panel_visitas', 'panel_pdv')) <> 3 THEN
    RAISE EXCEPTION '[panel scope] se esperaban 3 funciones nuevas y hay otra cantidad';
  END IF;

  -- 3. EL INVARIANTE: para cada marca, lo viejo y lo nuevo son la misma cosa.
  FOR _m IN SELECT id, razon_social FROM marcas ORDER BY razon_social LOOP
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO _campanas
      FROM campanas WHERE marca_id = _m.id;

    SELECT count(*) INTO _dif FROM (
      (SELECT * FROM public.panel_marca_series(_m.id)
        EXCEPT ALL
       SELECT * FROM public.panel_series(_campanas))
      UNION ALL
      (SELECT * FROM public.panel_series(_campanas)
        EXCEPT ALL
       SELECT * FROM public.panel_marca_series(_m.id))
    ) d;
    IF _dif <> 0 THEN
      RAISE EXCEPTION '[panel scope] panel_series difiere en % fila(s) para %', _dif, _m.razon_social;
    END IF;

    SELECT count(*) INTO _dif FROM (
      (SELECT * FROM public.panel_marca_visitas(_m.id)
        EXCEPT ALL
       SELECT * FROM public.panel_visitas(_campanas))
      UNION ALL
      (SELECT * FROM public.panel_visitas(_campanas)
        EXCEPT ALL
       SELECT * FROM public.panel_marca_visitas(_m.id))
    ) d;
    IF _dif <> 0 THEN
      RAISE EXCEPTION '[panel scope] panel_visitas difiere en % fila(s) para %', _dif, _m.razon_social;
    END IF;

    SELECT count(*) INTO _dif FROM (
      (SELECT * FROM public.panel_marca_pdv(_m.id)
        EXCEPT ALL
       SELECT * FROM public.panel_pdv(_campanas))
      UNION ALL
      (SELECT * FROM public.panel_pdv(_campanas)
        EXCEPT ALL
       SELECT * FROM public.panel_marca_pdv(_m.id))
    ) d;
    IF _dif <> 0 THEN
      RAISE EXCEPTION '[panel scope] panel_pdv difiere en % fila(s) para %', _dif, _m.razon_social;
    END IF;

    -- Y el filtro por UNA campaña: pasar un arreglo de un elemento tiene que
    -- dar lo mismo que el `_campana_id` que se va. Se prueba con la primera
    -- campaña de la marca, si tiene.
    IF array_length(_campanas, 1) >= 1 THEN
      SELECT count(*) INTO _dif FROM (
        (SELECT * FROM public.panel_marca_pdv(_m.id, _campanas[1])
          EXCEPT ALL
         SELECT * FROM public.panel_pdv(ARRAY[_campanas[1]]))
        UNION ALL
        (SELECT * FROM public.panel_pdv(ARRAY[_campanas[1]])
          EXCEPT ALL
         SELECT * FROM public.panel_marca_pdv(_m.id, _campanas[1]))
      ) d;
      IF _dif <> 0 THEN
        RAISE EXCEPTION '[panel scope] panel_pdv de una campaña difiere en % fila(s) para %', _dif, _m.razon_social;
      END IF;
    END IF;

    _marcas := _marcas + 1;
    SELECT _filas + count(*) INTO _filas FROM public.panel_series(_campanas);
  END LOOP;

  -- 4. El arreglo VACÍO no devuelve todo. Es el caso de un actor sin campañas,
  --    y el modo de falla sería el peor posible: `= ANY('{}')` mal escrito
  --    —por ejemplo con un `OR cardinality(_campanas) = 0`— le mostraría a una
  --    distribuidora nueva las métricas de todo el sistema.
  IF (SELECT count(*) FROM public.panel_series(ARRAY[]::uuid[])) <> 0
  OR (SELECT count(*) FROM public.panel_visitas(ARRAY[]::uuid[])) <> 0
  OR (SELECT count(*) FROM public.panel_pdv(ARRAY[]::uuid[])) <> 0 THEN
    RAISE EXCEPTION '[panel scope] el arreglo vacío devuelve filas: el scope falla ABIERTO';
  END IF;

  -- 5. Un uuid que no es de ninguna campaña tampoco devuelve nada.
  IF (SELECT count(*) FROM public.panel_series(ARRAY['00000000-0000-0000-0000-000000000000'::uuid])) <> 0 THEN
    RAISE EXCEPTION '[panel scope] un id inexistente devuelve filas';
  END IF;

  RAISE NOTICE '[panel scope] OK — % marcas verificadas, % filas de serie idénticas, scope vacío cerrado',
    _marcas, _filas;
END
$verif$;

COMMIT;
