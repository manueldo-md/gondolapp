-- ─────────────────────────────────────────────────────────────────────────────
-- Panel de marca: la presencia POR PUNTO DE VENTA
--
-- ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
-- La etapa 3 arregló el KPI de Presencia y el dónut, pero "Cobertura por
-- ciudad" y "Presencia por tipo de comercio" siguieron contando solo
-- `fotos.declaracion`. O sea que en la MISMA pantalla, después del arreglo,
-- Suprante leía 64% arriba y 0% en cada ciudad y en cada tipo de comercio.
--
-- Una pantalla que se contradice a sí misma es peor que una equivocada: la
-- equivocada se corrige, la contradictoria enseña a no creerle a ninguna de las
-- dos partes.
--
-- ── UNA FILA POR COMERCIO, Y LA AGRUPACIÓN AFUERA ────────────────────────────
-- Devuelve el grano más fino que las dos pantallas necesitan —el comercio— con
-- su localidad y su tipo pegados. Agrupar por ciudad o por tipo es una suma
-- trivial del lado de TypeScript, y tenerlo por comercio permite las dos
-- lecturas sin dos funciones.
--
-- El efecto de traer `localidad_nombre` y `comercio_tipo` acá es que la página
-- deja de necesitar las consultas de `comercios` y `localidades`: la cascada
-- de cinco pasos se corta en tres.
--
-- ── EL DENOMINADOR NO SON LOS PDV VISITADOS ──────────────────────────────────
-- `misiones` cuenta las visitas; `con_valor` cuenta las que MIDIERON presencia.
-- Son distintos y los dos hacen falta: un porcentaje sobre los visitados
-- castiga a una ciudad donde se relevó mucho y se preguntó poco, y esconde
-- justamente el dato accionable —"acá visitamos 15 PDV y solo 8 midieron
-- presencia"—. Es la misma regla de base de cálculo del resto del tramo.
--
-- ── MISMO GRANO QUE panel_marca_series, A PROPÓSITO ──────────────────────────
-- Las dos funciones cuentan una observación por (misión, fuente). Si una misión
-- alguna vez tuviera respuesta tipificada Y declaración de foto, las dos la
-- contarían dos veces — y las dos igual, que es lo que importa: no pueden
-- contradecirse entre sí. Hoy ese caso tiene CERO filas en las dos bases
-- (`fotos.declaracion` está congelada desde 20260407124015 y ninguna campaña
-- del piloto tiene preguntas tipificadas). El día que deje de ser cero, hay que
-- arreglar LAS DOS juntas.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- La fuente de declaración busca por comercio además de por misión.
CREATE INDEX IF NOT EXISTS misiones_comercio_id_idx
  ON public.misiones (comercio_id);

CREATE OR REPLACE FUNCTION public.panel_marca_pdv(_marca_id uuid)
RETURNS TABLE (
  comercio_id      uuid,
  comercio_nombre  text,
  comercio_tipo    text,
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
    -- ── Fuente 1: preguntas tipificadas de presencia ────────────────────────
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
       AND r.reemplazada_por IS NULL
     GROUP BY 1, 2

    UNION ALL

    -- ── Fuente 2: fotos.declaracion, historia congelada ─────────────────────
    SELECT mi.comercio_id, mi.id,
           bool_or(f.declaracion = 'producto_presente')
      FROM fotos f
      JOIN misiones mi ON mi.id = f.mision_id
                      AND mi.estado NOT IN ('descartada', 'rechazada')
      JOIN campanas c  ON c.id  = mi.campana_id
      JOIN metricas m  ON m.slug = 'presencia' AND m.activa
                      AND 'declaracion_foto' = ANY (m.fuentes)
     WHERE c.marca_id = _marca_id
       AND f.declaracion IS NOT NULL
       AND f.estado = 'aprobada'
     GROUP BY 1, 2
  ),
  -- Todas las visitas, hayan medido presencia o no. Es el LEFT de abajo: una
  -- ciudad donde se visitó y no se midió tiene que aparecer con 0 mediciones,
  -- no desaparecer del panel.
  visitas AS (
    SELECT mi.comercio_id,
           count(*)             AS misiones,
           max(COALESCE(mi.capturada_at, mi.created_at)) AS ultima
      FROM misiones mi
      JOIN campanas c ON c.id = mi.campana_id
     WHERE c.marca_id = _marca_id
       AND mi.estado NOT IN ('descartada', 'rechazada')
     GROUP BY 1
  )
  SELECT
    co.id,
    co.nombre,
    co.tipo,
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
  GROUP BY co.id, co.nombre, co.tipo, co.localidad_id, l.nombre, v.misiones, v.ultima
  ORDER BY co.nombre;
$fn$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
-- Mismo criterio que panel_marca_series: REVOKE de PUBLIC no alcanza porque
-- Supabase le da EXECUTE a anon y authenticated de forma explícita.
REVOKE ALL ON FUNCTION public.panel_marca_pdv(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.panel_marca_pdv(uuid) TO service_role;

-- ── Verificación ─────────────────────────────────────────────────────────────
DO $verif$
DECLARE
  _marca   uuid;
  _pdv     int;
  _presentes int;
  _serie   int;
BEGIN
  IF has_function_privilege('authenticated', 'public.panel_marca_pdv(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.panel_marca_pdv(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon o authenticated pueden ejecutar panel_marca_pdv';
  END IF;

  SELECT c.marca_id INTO _marca
    FROM fotos f
    JOIN misiones mi ON mi.id = f.mision_id
    JOIN campanas c  ON c.id  = mi.campana_id
   WHERE f.declaracion IS NOT NULL AND c.marca_id IS NOT NULL
   GROUP BY c.marca_id ORDER BY count(*) DESC LIMIT 1;

  IF _marca IS NULL THEN
    RAISE EXCEPTION 'No hay marca con declaraciones: la verificación no probaría nada';
  END IF;

  SELECT count(*), coalesce(sum(verdaderos), 0)
    INTO _pdv, _presentes
    FROM public.panel_marca_pdv(_marca);

  IF _pdv = 0 THEN
    RAISE EXCEPTION 'panel_marca_pdv devolvió 0 comercios para una marca con datos';
  END IF;

  -- El invariante que ata las dos funciones: los afirmativos por PDV tienen que
  -- dar lo mismo que los afirmativos de la serie. Si se separan, la pantalla
  -- vuelve a contradecirse a sí misma, que es el bug que esto viene a cerrar.
  SELECT coalesce(sum(verdaderos), 0) INTO _serie
    FROM public.panel_marca_series(_marca)
   WHERE campana_id IS NULL AND metrica_slug = 'presencia';

  IF _presentes <> _serie THEN
    RAISE EXCEPTION 'Los afirmativos por PDV (%) no coinciden con los de la serie (%)',
      _presentes, _serie;
  END IF;

  -- Nadie puede tener más mediciones que visitas.
  IF EXISTS (SELECT 1 FROM public.panel_marca_pdv(_marca) WHERE con_valor > misiones) THEN
    RAISE EXCEPTION 'Hay comercios con más mediciones que visitas';
  END IF;

  RAISE NOTICE 'OK — % comercios, % afirmativos, coincide con la serie', _pdv, _presentes;
END
$verif$;

COMMIT;
