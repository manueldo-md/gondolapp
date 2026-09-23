-- ─────────────────────────────────────────────────────────────────────────────
-- panel_marca_pdv: coordenadas y filtro por campaña
--
-- ── QUÉ AGREGA ───────────────────────────────────────────────────────────────
-- 1. `lat` y `lng`, que es lo único que le faltaba para dibujar el mapa.
-- 2. `_campana_id` opcional, para el control "todos mis PDV / los de una
--    campaña". Con NULL se comporta exactamente como antes.
--
-- ── OJO: ESTO ES UN DROP, NO UN CREATE OR REPLACE ────────────────────────────
-- `CREATE OR REPLACE FUNCTION` con un parámetro NUEVO **no reemplaza: crea una
-- SOBRECARGA**. Y como el parámetro nuevo lleva DEFAULT, la llamada de un solo
-- argumento —la que hace el dashboard hoy— pasaría a ser ambigua entre las dos
-- firmas y Postgres tiraría 42725 (*is not unique*). Lo aprendimos con
-- `generar_codigo_gondolero` en 20260923100000.
--
-- Así que la vieja se DROPEA primero, y el bloque de verificación de abajo
-- comprueba que quedó UNA sola firma. Un grep después de escribir el código, no
-- antes.
--
-- ── POR QUÉ UN PARÁMETRO Y NO DESGLOSE POR CAMPAÑA ───────────────────────────
-- Cambiar la forma de la respuesta para todos, por un filtro que se usa a
-- veces, es caro: obligaría a cada consumidor a agrupar. Y el desglose por
-- campaña ya existe donde tiene sentido, que es la serie
-- (`panel_marca_series`, con su GROUPING SETS).
--
-- ── EL RESTO DE LAS REGLAS NO CAMBIA ─────────────────────────────────────────
-- Mismo grano por (misión, fuente) que `panel_marca_series` —ver
-- 20260926100000—, mismas dos fuentes de presencia, mismo filtro de estados, y
-- `misiones` sigue contando las visitas hayan medido o no.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP FUNCTION IF EXISTS public.panel_marca_pdv(uuid);

CREATE FUNCTION public.panel_marca_pdv(_marca_id uuid, _campana_id uuid DEFAULT NULL)
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
     WHERE c.marca_id = _marca_id
       AND (_campana_id IS NULL OR c.id = _campana_id)
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
     WHERE c.marca_id = _marca_id
       AND (_campana_id IS NULL OR c.id = _campana_id)
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
     WHERE c.marca_id = _marca_id
       AND (_campana_id IS NULL OR c.id = _campana_id)
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
    -- lib/panel-marca.ts, resuelto una vez del lado de la base.
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

REVOKE ALL ON FUNCTION public.panel_marca_pdv(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_marca_pdv(uuid, uuid) TO service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
DO $verif$
DECLARE
  _marca   uuid;
  _firmas  int;
  _sin     int;
  _todas   int;
  _una     int;
  _campana uuid;
BEGIN
  -- 1. UNA sola firma. Es lo que el DROP viene a garantizar: si quedaran dos,
  --    la llamada de un argumento del dashboard reventaría con 42725.
  SELECT count(*) INTO _firmas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'panel_marca_pdv';
  IF _firmas <> 1 THEN
    RAISE EXCEPTION 'panel_marca_pdv quedó con % firmas: la llamada de un argumento sería ambigua', _firmas;
  END IF;

  IF has_function_privilege('authenticated', 'public.panel_marca_pdv(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.panel_marca_pdv(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon o authenticated pueden ejecutar panel_marca_pdv';
  END IF;

  SELECT c.marca_id INTO _marca
    FROM misiones mi JOIN campanas c ON c.id = mi.campana_id
   WHERE c.marca_id IS NOT NULL
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  IF _marca IS NULL THEN
    RAISE EXCEPTION 'No hay marca con misiones: la verificación no probaría nada';
  END IF;

  -- 2. La llamada de UN argumento tiene que seguir funcionando igual.
  SELECT count(*) INTO _sin FROM public.panel_marca_pdv(_marca);
  SELECT count(*) INTO _todas FROM public.panel_marca_pdv(_marca, NULL);
  IF _sin <> _todas THEN
    RAISE EXCEPTION 'La llamada sin campaña (%) difiere de la que pasa NULL (%)', _sin, _todas;
  END IF;

  -- 3. Filtrar por una campaña no puede devolver MÁS que no filtrar.
  SELECT c.id INTO _campana
    FROM campanas c JOIN misiones mi ON mi.campana_id = c.id
   WHERE c.marca_id = _marca GROUP BY c.id ORDER BY count(*) DESC LIMIT 1;

  IF _campana IS NOT NULL THEN
    SELECT count(*) INTO _una FROM public.panel_marca_pdv(_marca, _campana);
    IF _una > _todas THEN
      RAISE EXCEPTION 'Filtrar por campaña devolvió más PDV (%) que no filtrar (%)', _una, _todas;
    END IF;
    IF _una = 0 THEN
      RAISE EXCEPTION 'Filtrar por la campaña con más misiones devolvió 0 PDV';
    END IF;
  END IF;

  -- 4. Las coordenadas llegan y son coordenadas.
  IF EXISTS (SELECT 1 FROM public.panel_marca_pdv(_marca)
              WHERE lat IS NOT NULL AND (lat NOT BETWEEN -90 AND 90 OR lng NOT BETWEEN -180 AND 180)) THEN
    RAISE EXCEPTION 'Hay coordenadas fuera de rango';
  END IF;

  RAISE NOTICE 'OK — % PDV, % con la campaña de más misiones', _todas, _una;
END
$verif$;

COMMIT;
