-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo de métricas + tipificación de preguntas
--
-- ── QUÉ RESUELVE ─────────────────────────────────────────────────────────────
-- Hoy una pregunta es texto libre. "¿Hay productos Suprante en góndola?" y
-- "¿Hay Mantecol en la góndola?" miden lo mismo y el sistema no lo sabe, así
-- que el panel de la marca no puede comparar dos campañas ni la misma campaña
-- en el tiempo. Tipificar la pregunta —decir QUÉ MIDE— es lo que convierte
-- respuestas sueltas en una serie.
--
-- La tipificación es POR PREGUNTA, no por campaña: una misma campaña puede
-- medir presencia, precio y frentes a la vez.
--
-- ── POR QUÉ UNA TABLA Y NO UN ENUM ───────────────────────────────────────────
-- Una métrica nueva no debería necesitar un deploy. Y la métrica lleva datos
-- propios —qué tipo de respuesta admite, cómo se llama, en qué orden se
-- muestra—: con un enum, todo eso terminaría en un Record paralelo en código,
-- que es la tabla otra vez pero sin integridad referencial.
--
-- La contracara: los SLUGS de las cinco iniciales son constantes en código. El
-- panel tiene que hacer algo distinto con 'precio' que con 'presencia', y ese
-- switch no puede leer filas arbitrarias. Una métrica que el código no conozca
-- se muestra como dato crudo, sin agregación. Por eso el slug es inmutable de
-- hecho: cambiarlo rompe el switch, no la base.
--
-- ── UNA MÉTRICA PUEDE TENER MÁS DE UNA FUENTE ────────────────────────────────
-- Esto está en el modelo a propósito, en `metricas.fuentes`.
--
-- 'presencia' se alimenta de DOS lugares:
--   1. 'respuestas'        — preguntas tipificadas, de acá en adelante
--   2. 'declaracion_foto'  — fotos.declaracion, la historia ya importada
--
-- El caso que lo obliga es el piloto de Georgalos (marzo 2026): 112 fotos con
-- declaracion cargada y CERO preguntas. Sin la segunda fuente, el panel de la
-- marca arranca vacío justo en la campaña que más vale mostrar.
--
-- Medido el 21/9/2026 en las dos bases (scripts/mirar-declaracion.mjs):
--
--                                                      PROD   DEV
--   fotos con declaracion                               113   112
--     de "Relevamiento snacks · Entre Ríos Q1 2026"     112   112  ← el piloto
--     de "Alta comercios zona norte"                      1     0  ← ver (3)
--   con declaracion = 'solo_competencia'                  0     0
--   misiones con declaraciones contradictorias entre
--     sus propias fotos                                   0     0
--
-- ── TRES CUIDADOS CON fotos.declaracion, VERIFICADOS ─────────────────────────
-- 1. Se cuenta por MISIÓN, no por foto. En el piloto son 2 fotos por misión y
--    1 misión por comercio: 112 fotos = 56 observaciones. Las 56 misiones
--    tienen declaración coherente entre sus fotos (0 contradicciones), así que
--    agrupar por mision_id no pierde nada.
--
-- 2. El tercer valor del enum es 'solo_competencia', y NO es un caso a excluir:
--    significa que el producto de la campaña NO está y además hay competencia.
--    Es una AUSENCIA con información extra, no una visita fallida. No existe
--    ningún valor para "comercio cerrado" —eso vive en el estado de la misión,
--    no acá—, así que no hay nada que sacar del denominador.
--
-- 3. Sí hay un uso con otro sentido, y hay que filtrarlo:
--    app/(gondolero)/gondolero/captura/actions-comercios.ts escribe
--    declaracion = 'producto_presente' FIJO en la foto de fachada del alta de
--    un comercio. Esa foto no mira ninguna góndola. Se reconoce porque no
--    tiene mision_id: 1 fila en prod, 0 en dev.
--
--    Y al revés, lo más importante: registrarMision NO escribe declaracion.
--    Ninguna foto capturada por la app hoy la tiene. La columna quedó opcional
--    en abril (20260407124015) cuando las preguntas tomaron ese trabajo. O sea
--    que 'declaracion_foto' es una fuente de HISTORIA CONGELADA: lo que hay es
--    todo lo que va a haber. De acá en adelante, presencia sale de preguntas.
--
--    La regla para el panel:
--      mision_id IS NOT NULL AND declaracion IS NOT NULL
--      presente := (declaracion = 'producto_presente')
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── El catálogo ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metricas (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL UNIQUE,
  nombre         text        NOT NULL,
  descripcion    text,
  -- Elegir la métrica FIJA el tipo de respuesta. Sin esto, dos campañas podrían
  -- medir "precio" una con un número y otra con una selección, y la serie no
  -- existiría. Los valores son los mismos de bloque_campos.tipo, menos 'foto'
  -- (una foto no es una medición comparable).
  tipo_respuesta text        NOT NULL CHECK (tipo_respuesta IN (
                               'seleccion_multiple', 'seleccion_unica',
                               'binaria', 'numero', 'texto'
                             )),
  -- De dónde puede salir el dato de esta métrica. Ver el bloque de arriba.
  fuentes        text[]      NOT NULL DEFAULT ARRAY['respuestas'],
  orden          integer     NOT NULL DEFAULT 0,
  -- Retirar una métrica es apagarla, no borrarla: las preguntas ya tipificadas
  -- siguen apuntando acá y su historia tiene que seguir leyéndose.
  activa         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- `cardinality` y no `array_length`: sobre un array vacío `array_length`
  -- devuelve NULL, `NULL >= 1` es NULL, y un CHECK que da NULL PASA. El dry run
  -- lo agarró — con `array_length`, `fuentes = ARRAY[]` entraba sin quejarse y
  -- la métrica quedaba sin ninguna fuente. `cardinality` devuelve 0 y el CHECK
  -- falla, que es lo que se quería. El `<@` tampoco lo frena: el conjunto vacío
  -- es subconjunto de cualquiera.
  CONSTRAINT metricas_fuentes_check CHECK (
    cardinality(fuentes) >= 1
    AND fuentes <@ ARRAY['respuestas', 'declaracion_foto']
  )
);

COMMENT ON TABLE metricas IS
  'Catálogo de qué puede medir una pregunta. Lo administra solo GondolApp. Los slugs de las métricas base son constantes en código (lib/metricas.ts): el panel hace algo distinto con cada una.';
COMMENT ON COLUMN metricas.fuentes IS
  'Una métrica puede alimentarse de varios lugares, hoy y mañana. respuestas = preguntas tipificadas. declaracion_foto = fotos.declaracion, historia congelada del piloto (registrarMision ya no la escribe).';
COMMENT ON COLUMN metricas.tipo_respuesta IS
  'Elegir la métrica fija el tipo del campo. El trigger bloque_campos_metrica_tipo lo hace cumplir.';

ALTER TABLE metricas ENABLE ROW LEVEL SECURITY;

-- Lectura para todos los autenticados: el selector "¿Qué mide?" lo usan marcas
-- y distribuidoras al armar una campaña. Es el mismo criterio que
-- bloque_campos_select, que ya expone las preguntas a cualquier logueado.
DROP POLICY IF EXISTS metricas_select ON metricas;
CREATE POLICY metricas_select ON metricas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Escritura solo admin. Es el punto de "el catálogo lo controla GondolApp": si
-- una marca pudiera agregar métricas, dos marcas medirían presencia con dos
-- filas distintas y la comparación entre campañas dejaría de existir.
DROP POLICY IF EXISTS metricas_insert_admin ON metricas;
CREATE POLICY metricas_insert_admin ON metricas
  FOR INSERT WITH CHECK (get_tipo_actor() = 'admin');

DROP POLICY IF EXISTS metricas_update_admin ON metricas;
CREATE POLICY metricas_update_admin ON metricas
  FOR UPDATE USING (get_tipo_actor() = 'admin')
          WITH CHECK (get_tipo_actor() = 'admin');

DROP POLICY IF EXISTS metricas_delete_admin ON metricas;
CREATE POLICY metricas_delete_admin ON metricas
  FOR DELETE USING (get_tipo_actor() = 'admin');

-- ── Las cinco iniciales ──────────────────────────────────────────────────────
-- Share of shelf y competencia quedan para después a propósito: las dos
-- necesitan un modelo de producto y competidor que todavía no existe.
INSERT INTO metricas (slug, nombre, descripcion, tipo_respuesta, fuentes, orden) VALUES
  ('presencia',      'Presencia',
   '¿El producto está en la góndola?',
   'binaria', ARRAY['respuestas', 'declaracion_foto'], 1),
  ('quiebre_stock',  'Quiebre de stock',
   '¿El producto está agotado en el punto de venta?',
   'binaria', ARRAY['respuestas'], 2),
  ('frentes',        'Frentes',
   'Cuántos frentes (facings) ocupa el producto en la góndola.',
   'numero',  ARRAY['respuestas'], 3),
  ('precio',         'Precio',
   'Precio del producto en el punto de venta.',
   'numero',  ARRAY['respuestas'], 4),
  ('exhibicion_pop', 'Exhibición / POP',
   '¿Hay material de punto de venta o exhibición adicional?',
   'binaria', ARRAY['respuestas'], 5)
ON CONFLICT (slug) DO NOTHING;

-- ── La columna en la pregunta ────────────────────────────────────────────────
-- NULL = "Sin métrica", que es el default y va a serlo para la mayoría: casi
-- ninguna pregunta mide algo comparable entre campañas.
--
-- RESTRICT y no CASCADE: borrar una métrica en uso no puede desclasificar
-- preguntas en silencio. Para retirar una, activa = false.
ALTER TABLE bloque_campos
  ADD COLUMN IF NOT EXISTS metrica_id uuid REFERENCES metricas(id) ON DELETE RESTRICT;

COMMENT ON COLUMN bloque_campos.metrica_id IS
  'Qué mide esta pregunta. NULL = sin métrica. Pasar de NULL a una métrica está siempre permitido, incluso con respuestas cargadas, porque no reinterpreta nada. Cambiarla o sacarla, solo sin respuestas.';

-- Índice parcial: la consulta del panel es "todas las preguntas que miden X".
-- Las no tipificadas son mayoría y no se buscan nunca por acá.
CREATE INDEX IF NOT EXISTS idx_bloque_campos_metrica
  ON bloque_campos (metrica_id) WHERE metrica_id IS NOT NULL;

-- ── La métrica fija el tipo ──────────────────────────────────────────────────
-- No se puede expresar como CHECK porque necesita mirar otra tabla.
--
-- Es barato y no rompe nada de lo que hay: hoy bloque_campos solo recibe
-- INSERT —ni un UPDATE ni un DELETE en todo el código— así que lo único que va
-- a ejercitar este trigger es lo que todavía no existe (el selector del
-- constructor y la pantalla de tipificar lo viejo). Si el tipo drifta, el panel
-- produce basura en silencio; mejor que falle acá y a la vista.
CREATE OR REPLACE FUNCTION public.bloque_campos_valida_metrica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _tipo_metrica text;
BEGIN
  IF NEW.metrica_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tipo_respuesta INTO _tipo_metrica FROM metricas WHERE id = NEW.metrica_id;

  IF _tipo_metrica IS DISTINCT FROM NEW.tipo THEN
    RAISE EXCEPTION
      'La métrica exige tipo de respuesta "%" y el campo es "%"',
      _tipo_metrica, NEW.tipo;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS bloque_campos_metrica_tipo ON bloque_campos;
CREATE TRIGGER bloque_campos_metrica_tipo
  BEFORE INSERT OR UPDATE OF metrica_id, tipo ON bloque_campos
  FOR EACH ROW EXECUTE FUNCTION public.bloque_campos_valida_metrica();

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Corre después del COMMIT y no escribe nada: solo avisa si algo no cuadra.
DO $verif$
DECLARE
  _metricas    int;
  _con_metrica int;
  _mal_tipo    int;
BEGIN
  SELECT count(*) INTO _metricas FROM metricas;
  IF _metricas < 5 THEN
    RAISE WARNING '[metricas] esperaba al menos 5 métricas y hay %', _metricas;
  END IF;

  SELECT count(*) INTO _con_metrica FROM bloque_campos WHERE metrica_id IS NOT NULL;
  IF _con_metrica <> 0 THEN
    RAISE WARNING '[metricas] la columna debería nacer vacía y hay % preguntas tipificadas', _con_metrica;
  END IF;

  -- El trigger solo mira filas nuevas. Esto confirma que tampoco hay viejas mal.
  SELECT count(*) INTO _mal_tipo
  FROM bloque_campos c JOIN metricas m ON m.id = c.metrica_id
  WHERE c.tipo IS DISTINCT FROM m.tipo_respuesta;
  IF _mal_tipo <> 0 THEN
    RAISE WARNING '[metricas] % preguntas con tipo distinto al de su métrica', _mal_tipo;
  END IF;

  RAISE NOTICE '[metricas] OK — % métricas, % preguntas tipificadas', _metricas, _con_metrica;
END
$verif$;
