-- ════════════════════════════════════════════════════════════════════════════
-- 20261004100000 — dos tipos de notificación para el camino de vuelta
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────
-- Todas las escrituras del vínculo van de la distri hacia el gondolero y
-- ninguna vuelve. La distri invita, aprueba, rechaza y desvincula, y las cuatro
-- avisan. El gondolero acepta, rechaza o se va, y **las tres son mudas** — no
-- porque los inserts reboten (ése fue el caso del 22/9/2026) sino porque **no
-- existen**: cero inserts de notificación en las seis actions de vinculación.
--
-- ── DOS TIPOS, NO CUATRO ────────────────────────────────────────────────────
-- Medido contra el CHECK real de las dos bases antes de escribir esto:
--
--   aceptó     → `vinculacion_nueva`        YA ESTÁ. Cero filas: alguien lo
--                                           previó y no lo cableó.
--   rechazó    → no hay tipo                se agrega `vinculacion_rechazada`
--   se fue     → no hay tipo PROPIO         se agrega `desvinculacion_gondolero`
--
-- `desvinculacion_distri` existe y **ya lo usa la dirección contraria** (3
-- filas en dev): significa "la distri te desvinculó". Reusarlo para el camino
-- inverso dejaría los dos hechos indistinguibles en la bandeja, que es
-- exactamente lo que este tramo viene a arreglar. Por eso va uno propio.
--
-- ── VA ANTES DEL DEPLOY ─────────────────────────────────────────────────────
-- Al revés que un DROP: el código nuevo escribe un `tipo` que la base todavía
-- rechaza. La falla sería blanda —`crearNotificacionDistri` chequea el error y
-- loguea, así que no voltea la vinculación— pero el aviso no llegaría, o sea
-- exactamente el bug que se está arreglando, con el arreglo ya deployado.
--
-- ── CÓMO SE AGREGAN LOS VALORES, QUE ES LO DELICADO ─────────────────────────
-- Un CHECK con lista no se "extiende": hay que dropearlo y recrearlo con la
-- lista entera. Retipear 34 strings a mano es la forma más fácil de perder uno
-- **sin que nada falle hasta que alguien intente usarlo meses después**.
--
-- Así que la lista NO se retipea: se LEE del constraint actual y se le agregan
-- los dos. Y después se verifica que todos los valores viejos sigan adentro.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  _def       text;
  _viejos    text[];
  _nuevos    text[] := ARRAY['vinculacion_rechazada', 'desvinculacion_gondolero'];
  _final     text[];
  _falta     text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint WHERE conname = 'notificaciones_tipo_check';

  IF _def IS NULL THEN
    RAISE EXCEPTION '[avisos] No existe notificaciones_tipo_check. Nada que extender.';
  END IF;

  -- Los valores actuales, leídos del propio constraint.
  SELECT array_agg(m[1]) INTO _viejos
    FROM regexp_matches(_def, '''([a-z_]+)''::text', 'g') m;

  IF _viejos IS NULL OR array_length(_viejos, 1) < 10 THEN
    RAISE EXCEPTION '[avisos] Se leyeron % valores del CHECK: el parseo falló. No se toca nada.',
      coalesce(array_length(_viejos, 1), 0);
  END IF;

  -- Idempotente: si los dos ya están, no hay nada que hacer.
  IF _viejos @> _nuevos THEN
    RAISE NOTICE '[avisos] Los dos tipos ya estaban. Sin cambios.';
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT v) INTO _final
    FROM unnest(_viejos || _nuevos) v;

  -- ── La lista se reconstruye con cada valor CITADO POR SEPARADO ────────────
  -- `format('%L', _final)` sobre un text[] rinde `'{a,b,c}'`: un solo literal
  -- de array. Funciona —Postgres lo coacciona— pero deja un `pg_get_constraintdef`
  -- que no se parece en nada al original, y eso rompe dos cosas a la vez: la
  -- verificación de más abajo, que busca cada valor en el texto, y la lectura
  -- humana el día que alguien compare los dos constraints.
  --
  -- Lo encontró el dry-run, no la lectura: la migración "andaba" y la
  -- verificación gritaba que se había perdido un tipo que no se había perdido.
  EXECUTE 'ALTER TABLE notificaciones DROP CONSTRAINT notificaciones_tipo_check';
  EXECUTE format(
    'ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check CHECK (tipo = ANY (ARRAY[%s]))',
    (SELECT string_agg(quote_literal(v) || '::text', ', ' ORDER BY v) FROM unnest(_final) v));

  -- ── Ningún valor viejo se perdió en el camino ─────────────────────────────
  -- Es LA verificación de esta migración: un tipo que desaparece de la lista no
  -- rompe nada hoy —las filas existentes no se revalidan— y explota el día que
  -- alguien intente escribirlo. Meses después, y sin relación aparente.
  FOREACH _falta IN ARRAY _viejos LOOP
    IF NOT (_final @> ARRAY[_falta]) THEN
      RAISE EXCEPTION '[avisos] Se perdió el tipo % al recrear el CHECK.', _falta;
    END IF;
  END LOOP;

  RAISE NOTICE '[avisos] OK — % tipos (eran %, se agregaron 2).',
    array_length(_final, 1), array_length(_viejos, 1);
END $$;

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló.
DO $$
DECLARE
  _def text; _filas integer; _tipo text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint WHERE conname = 'notificaciones_tipo_check';

  -- 1. Los dos nuevos entraron.
  IF _def NOT LIKE '%vinculacion_rechazada%' THEN
    RAISE EXCEPTION '[avisos] Falta vinculacion_rechazada en el CHECK.';
  END IF;
  IF _def NOT LIKE '%desvinculacion_gondolero%' THEN
    RAISE EXCEPTION '[avisos] Falta desvinculacion_gondolero en el CHECK.';
  END IF;

  -- 2. Y los que ya se usan siguen. Se chequean contra los DATOS, no contra
  --    una lista escrita a mano: lo que está en la tabla es lo que no se puede
  --    perder.
  FOR _tipo IN SELECT DISTINCT tipo FROM notificaciones WHERE tipo IS NOT NULL LOOP
    IF _def NOT LIKE '%''' || _tipo || '''%' THEN
      RAISE EXCEPTION '[avisos] El tipo % tiene filas y quedó fuera del CHECK.', _tipo;
    END IF;
  END LOOP;

  -- 3. LA OTRA DIRECCIÓN: no se tocó ni una fila.
  SELECT count(*) INTO _filas FROM notificaciones;
  RAISE NOTICE '[avisos] OK — el CHECK acepta los dos nuevos y todos los tipos con datos. % notificaciones intactas.', _filas;
END $$;

COMMIT;
