-- ─────────────────────────────────────────────────────────────────────────────
-- `campanas.updated_at` se mueve cuando cambian los BLOQUES, no solo la campaña
--
-- ── QUÉ HABILITA ─────────────────────────────────────────────────────────────
-- El caché de campañas del gondolero guarda los bloques y campos para poder
-- capturar sin señal. Para saber si ese caché quedó viejo hay dos opciones: un
-- TTL —que solo dice "hace rato que no mirás"— o una marca de cambio, que dice
-- "esto cambió". La segunda es la que evita bajar 20 KB de bloques anidados
-- cada vez que vence un plazo.
--
-- `campanas.updated_at` ya existía y ya se movía. Lo que NO estaba garantizado
-- es que se moviera cuando el cambio es en `bloques_foto` o `bloque_campos`,
-- que es justo lo que el gondolero cachea.
--
-- ── POR QUÉ NO ALCANZABA CON LA COSTUMBRE ────────────────────────────────────
-- Hoy funciona: los dos `republicarCampana` —el único camino de la app que
-- agrega bloques a una campaña que ya existe— hacen `update` sobre `campanas`
-- ANTES de insertar. Medido el 22/9/2026 buscando contraejemplos en dev: hay
-- dos campañas donde un campo es más nuevo que el `updated_at` de su campaña,
-- las dos por **1 segundo**, que es la secuencia de creación (campaña → bloque
-- → campos). Ninguna edición posterior se salteó la marca.
--
-- Pero eso es un invariante de costumbre, no de estructura. El primer camino
-- nuevo que toque bloques sin acordarse de tocar `campanas` deja a los
-- gondoleros capturando con el formulario viejo **y nadie se entera**: no falla,
-- no hay error, el dato llega incompleto y se descubre semanas después mirando
-- respuestas que faltan. Es el modo de falla silencioso que este proyecto viene
-- sacando de a uno.
--
-- ── FALSOS POSITIVOS SÍ, FALSOS NEGATIVOS NO ────────────────────────────────
-- El trigger dispara con cualquier cambio en un bloque o un campo, incluido
-- `bloque_campos.metrica_id`, que la pantalla de /admin/metricas escribe y que
-- el gondolero **no** cachea (no está en `CAMPANA_CACHE_SELECT`). Eso hace que
-- tipificar una pregunta invalide el caché de esa campaña sin necesidad.
--
-- Es a propósito. El costo de un falso positivo es un refetch de 20 KB la
-- próxima vez que haya señal. El de un falso negativo es un gondolero
-- capturando con el formulario equivocado. No son comparables.
--
-- ── now() ES LA HORA DE INICIO DE LA TRANSACCIÓN ────────────────────────────
-- No avanza dentro de una transacción, así que varios cambios en la misma
-- transacción —los diez campos de un bloque, por ejemplo— dejan UN solo
-- timestamp. Es exactamente lo que se quiere: el cliente detecta "esto cambió",
-- no cuántas veces.
--
-- Se usa `now()` y no `clock_timestamp()` a propósito, para no tener dos
-- semánticas distintas en la misma columna: `trigger_set_updated_at()`, que es
-- la que ya la escribe desde `campanas` y desde otras cinco tablas, usa `now()`.
--
-- Ojo al escribir una prueba: dentro de una transacción no se puede comprobar
-- que el timestamp "creció" entre pasos, porque no crece. Hay que plantar un
-- centinela viejo antes de cada paso. Ver scripts/probar-updated-at-bloques.mjs.
--
-- ── EL DELETE Y EL CASCADE ───────────────────────────────────────────────────
-- `bloques_foto.campana_id` y `bloque_campos.bloque_id` son `ON DELETE CASCADE`,
-- así que borrar una campaña dispara estos triggers sobre sus hijos. Para ese
-- momento la fila de `campanas` ya fue borrada por el mismo comando, así que el
-- `UPDATE` afecta cero filas y no pasa nada. No hace falta una guarda.
--
-- ── DE PASO: LOS DOS TRIGGERS DE updated_at DUPLICADOS ──────────────────────
-- `campanas` tenía DOS triggers que hacían exactamente lo mismo:
--
--   set_updated_at_campanas      → trigger_set_updated_at()       (genérica)
--   trigger_campanas_updated_at  → update_campanas_updated_at()   (copia)
--
-- Cuerpos idénticos —`NEW.updated_at = now()`— y la genérica la comparten
-- además `distribuidoras`, `marcas`, `profiles`, `comercios` y `fotos`. Se
-- queda la genérica; se van el trigger específico y su función, que no usa
-- ninguna otra tabla (verificado contra `pg_trigger` en las dos bases).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── La función ───────────────────────────────────────────────────────────────
-- Una sola para las dos tablas, despachando por `TG_TABLE_NAME`. Dos funciones
-- casi idénticas serían dos lugares donde arreglar el día que cambie la regla.
--
-- `SECURITY DEFINER` con `search_path` fijo, igual que el resto de las
-- funciones del proyecto: el `UPDATE` sobre `campanas` tiene que correr aunque
-- quien inserte el bloque no tenga permiso de escritura sobre esa tabla.
CREATE OR REPLACE FUNCTION public.tocar_campana_desde_bloque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _campana_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'bloques_foto' THEN
    _campana_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.campana_id ELSE NEW.campana_id END;
  ELSE
    SELECT bf.campana_id INTO _campana_id
      FROM bloques_foto bf
     WHERE bf.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.bloque_id ELSE NEW.bloque_id END;
  END IF;

  IF _campana_id IS NOT NULL THEN
    -- Si la campaña se está borrando en este mismo comando, esto afecta cero
    -- filas. Es el caso del cascade y no necesita tratamiento aparte.
    UPDATE campanas SET updated_at = now() WHERE id = _campana_id;
  END IF;

  RETURN NULL;   -- AFTER trigger: el valor de retorno se ignora.
END;
$fn$;

REVOKE ALL ON FUNCTION public.tocar_campana_desde_bloque() FROM public;
GRANT EXECUTE ON FUNCTION public.tocar_campana_desde_bloque() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.tocar_campana_desde_bloque() IS
  'Mueve campanas.updated_at cuando cambia un bloque o un campo. Es lo que deja al caché offline del gondolero detectar que su formulario quedó viejo sin bajar los bloques enteros.';

-- ── Los dos triggers ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS bloques_foto_tocan_campana ON bloques_foto;
CREATE TRIGGER bloques_foto_tocan_campana
  AFTER INSERT OR UPDATE OR DELETE ON bloques_foto
  FOR EACH ROW EXECUTE FUNCTION public.tocar_campana_desde_bloque();

DROP TRIGGER IF EXISTS bloque_campos_tocan_campana ON bloque_campos;
CREATE TRIGGER bloque_campos_tocan_campana
  AFTER INSERT OR UPDATE OR DELETE ON bloque_campos
  FOR EACH ROW EXECUTE FUNCTION public.tocar_campana_desde_bloque();

-- ── El duplicado que se va ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_campanas_updated_at ON campanas;
DROP FUNCTION IF EXISTS public.update_campanas_updated_at();

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Corre después del COMMIT, no escribe nada, y FALLA con EXCEPTION si algo no
-- cuadra. Un bloque que puede decir OK sin haber verificado no es una
-- verificación — ver CLAUDE.md.
DO $verif$
DECLARE
  _nuevos    int;
  _updated   int;
  _sobrante  int;
BEGIN
  SELECT count(*) INTO _nuevos
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('bloques_foto_tocan_campana', 'bloque_campos_tocan_campana');

  IF _nuevos <> 2 THEN
    RAISE EXCEPTION '[updated_at] FALLÓ: esperaba los 2 triggers nuevos y hay %', _nuevos;
  END IF;

  -- Exactamente UNO que toque updated_at en campanas. Si quedan dos, el DROP
  -- no corrió; si queda cero, se fue el que había que conservar.
  SELECT count(*) INTO _updated
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND t.tgrelid = 'campanas'::regclass
    AND p.proname IN ('trigger_set_updated_at', 'update_campanas_updated_at');

  IF _updated <> 1 THEN
    RAISE EXCEPTION '[updated_at] FALLÓ: campanas tiene % triggers de updated_at, esperaba 1', _updated;
  END IF;

  SELECT count(*) INTO _sobrante
  FROM pg_proc WHERE proname = 'update_campanas_updated_at' AND pronamespace = 'public'::regnamespace;

  IF _sobrante <> 0 THEN
    RAISE EXCEPTION '[updated_at] FALLÓ: la función duplicada sigue existiendo.';
  END IF;

  RAISE NOTICE '[updated_at] OK — 2 triggers nuevos, 1 solo trigger de updated_at en campanas, función duplicada borrada';
END
$verif$;
