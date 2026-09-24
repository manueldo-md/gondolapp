-- ─────────────────────────────────────────────────────────────────────────────
-- DROP de panel_marca_series / panel_marca_visitas / panel_marca_pdv
--
-- Las reemplazó `20260928100000`, que las volvió a escribir recibiendo una
-- LISTA DE CAMPAÑAS en vez de un `marca_id`, para que el mismo SQL sirva al
-- panel de marca y al de distribuidora.
--
-- ── POR QUÉ RECIÉN AHORA ─────────────────────────────────────────────────────
-- Es el orden que este proyecto ya usó para `profiles.nivel`: código que deja
-- de usarlas → deploy → verificar en producción → DROP. Al revés, el deploy
-- anterior se queda llamando funciones que no existen, y PostgREST no devuelve
-- la fila sin esa función: no devuelve nada.
--
-- Las tres condiciones están cumplidas al 24/9/2026: el código nuevo está en
-- `main`, los dos paneles se verificaron en producción, y el grep POSTERIOR
-- —`git grep` sobre el repo entero— da CERO llamadas por `rpc(`. Las únicas
-- menciones que quedan son comentarios y tres dry-runs históricos.
--
-- ── POR QUÉ NO ALCANZABA CON DEJARLAS ────────────────────────────────────────
-- Una función que todavía compila es la que alguien va a llamar. Mientras las
-- tres existan hay DOS PUERTAS al mismo dato, y la vieja se saltea
-- `lib/campanas-de.ts`, que es el único lugar que sabe qué campañas puede ver
-- cada actor. Es el mismo argumento que borró `unirseACampana`,
-- `cambiar-rol-btn.tsx` y los dos formateadores sin zona de `lib/utils.ts`.
--
-- ── LAS FIRMAS SON EXACTAS, Y ESO IMPORTA ────────────────────────────────────
-- `panel_marca_pdv` es `(uuid, uuid)` desde `20260927100000`, no `(uuid)`: esa
-- migración dropeó la de un argumento y creó la de dos. Un `DROP` con la firma
-- equivocada no falla de forma visible si se usa `IF EXISTS` — simplemente no
-- borra nada. Por eso abajo se cuenta por NOMBRE, que no depende de que yo haya
-- escrito bien la firma.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Precondición: que las nuevas estén ───────────────────────────────────────
-- Si esta migración corriera sobre una base sin las funciones nuevas, dejaría
-- al panel sin ninguna de las dos familias. Se verifica ANTES de borrar.
DO $pre$
DECLARE _nuevas int;
BEGIN
  SELECT count(*) INTO _nuevas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('panel_series', 'panel_visitas', 'panel_pdv');
  IF _nuevas <> 3 THEN
    RAISE EXCEPTION
      '[drop panel_marca] faltan las funciones nuevas: se esperaban 3 y hay %. Corré 20260928100000 primero.',
      _nuevas;
  END IF;
END
$pre$;

DROP FUNCTION IF EXISTS public.panel_marca_series(uuid);
DROP FUNCTION IF EXISTS public.panel_marca_visitas(uuid);
DROP FUNCTION IF EXISTS public.panel_marca_pdv(uuid, uuid);

-- Por si en algún ambiente sobrevivió la firma de un solo argumento, anterior a
-- 20260927100000. En dev y prod no existe; el conteo por nombre de abajo es el
-- que lo comprueba de verdad.
DROP FUNCTION IF EXISTS public.panel_marca_pdv(uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN — LAS DOS DIRECCIONES
--
-- Que se hayan ido las que tenían que irse **y** que sigan las que tenían que
-- quedarse. Chequear una sola deja pasar un DROP de más, que es el error caro.
--
-- Y falla con RAISE EXCEPTION, no con WARNING: un WARNING se pierde entre el
-- ruido del SQL Editor y lo que se lee es la última línea. Ya escribí un bloque
-- así una vez y decía OK con las tres columnas todavía puestas.
-- ─────────────────────────────────────────────────────────────────────────────
DO $verif$
DECLARE
  _viejas int;
  _nuevas int;
BEGIN
  -- Por NOMBRE, no por firma: así una sobrecarga que yo no haya previsto
  -- también se cuenta, en vez de sobrevivir en silencio.
  SELECT count(*) INTO _viejas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'panel\_marca\_%';

  IF _viejas <> 0 THEN
    RAISE EXCEPTION '[drop panel_marca] quedaron % función(es) panel_marca_*', _viejas;
  END IF;

  SELECT count(*) INTO _nuevas
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('panel_series', 'panel_visitas', 'panel_pdv');

  IF _nuevas <> 3 THEN
    RAISE EXCEPTION
      '[drop panel_marca] el DROP se llevó de más: quedan % de las 3 funciones nuevas', _nuevas;
  END IF;

  -- Que además sigan SIRVIENDO. Que el nombre exista no prueba que devuelva
  -- filas: un DROP CASCADE mal puesto podría haberse llevado algo del que
  -- dependen. Se ejercitan con la marca que tiene datos.
  PERFORM 1 FROM public.panel_series(
    COALESCE((SELECT array_agg(id) FROM campanas WHERE marca_id IS NOT NULL), ARRAY[]::uuid[]));
  PERFORM 1 FROM public.panel_visitas(ARRAY[]::uuid[]);
  PERFORM 1 FROM public.panel_pdv(ARRAY[]::uuid[]);

  RAISE NOTICE '[drop panel_marca] OK — 0 funciones panel_marca_*, las 3 nuevas responden';
END
$verif$;

COMMIT;
