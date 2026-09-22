-- =============================================================================
-- codigo_gondolero: prefijo FXR para los fixers, y la base lo hace cumplir
-- =============================================================================
-- POR QUÉ
--
-- Al unificar el generador el 16/9/2026 el prefijo quedó FIJO en 'GND' para
-- gondoleros y fixers, con el argumento de que las tres búsquedas por código
-- filtran por `tipo_actor` y no por prefijo. El argumento era cierto y era
-- insuficiente: el código se dicta por teléfono —hay un botón de WhatsApp en el
-- perfil— y **la distribuidora que lo recibe no tiene forma de saber a quién
-- está invitando**. Un fixer toca la góndola, arma exhibidores y repone producto
-- ajeno; no es lo mismo.
--
-- ── EL PROBLEMA NO ES EL PREFIJO: ES QUE NADIE MANTIENE LA CORRESPONDENCIA ──
--
-- Ningún fixer NACE fixer. El registro público de /auth ofrece solo gondolero,
-- distribuidora y marca, y `handle_new_user()` fuerza tipo_actor='gondolero'
-- para cualquier alta —es la whitelist que impide registrarse como admin con la
-- anon key—. O sea que los 14 fixers que existen llegaron a serlo por un UPDATE
-- del panel admin, y hay DOS caminos que lo hacen:
--
--   crearUsuario      (usuarios/actions.ts) — corrige tipo_actor después del alta
--   cambiarTipoActor  (usuarios/actions.ts) — cambia el tipo de uno ya creado
--
-- El primero limpia el código cuando el nuevo tipo es una empresa. **El segundo
-- no toca el código nunca**, así que un gondolero convertido en marca se queda
-- con su GND y sigue apareciendo en las búsquedas por código de los paneles de
-- vinculación. Ese bug ya está hoy, sin prefijos de por medio.
--
-- Por eso la regla vive en un TRIGGER y no en cada escritor:
--
--     el prefijo coincide con el tipo_actor, y las empresas no tienen código
--
-- Acordarse en cada escritor es exactamente lo que falló. Un trigger cubre los
-- dos caminos de arriba y los que todavía no existen.
--
-- ── POR QUÉ EL DROP ─────────────────────────────────────────────────────────
--
-- `CREATE OR REPLACE` con un parámetro nuevo NO reemplaza la función: crea una
-- SOBRECARGA. Las dos quedan vivas. Qué pasa después depende de un detalle, y
-- las dos ramas se midieron contra dev con ROLLBACK:
--
--   CON `DEFAULT 'gondolero'` en el parámetro
--     SELECT generar_codigo_gondolero()
--       → 42725: function generar_codigo_gondolero() is not unique
--     Esa llamada de cero argumentos vivía adentro de `handle_new_user()`, que
--     es un trigger sobre auth.users: el registro público se rompería entero.
--
--   SIN DEFAULT, que es como quedó
--     No hay ambigüedad: `f()` resuelve a la vieja y `f(text)` a la nueva. Nada
--     falla. **Y eso es peor**: sobrevive un generador que devuelve GND pase lo
--     que pase, listo para que alguien lo llame y le ponga prefijo de gondolero
--     a un fixer sin que nada avise.
--
-- O sea que el DROP no está para evitar una rotura ruidosa —con el parámetro
-- obligatorio no la hay— sino para no dejar un generador muerto que contradice
-- la regla. Es lo mismo que se hizo con `unirseACampana` y con `formatearFecha`:
-- lo que todavía compila es lo que alguien va a usar.
--
-- El bloque de verificación del punto 6 cuenta las firmas por eso, y probado sin
-- el DROP levanta `[fxr] quedaron 2 firmas`. El DROP funciona sin CASCADE porque
-- plpgsql resuelve los nombres en tiempo de ejecución y Postgres no registra la
-- dependencia.
--
-- ── EL PARÁMETRO NO TIENE DEFAULT, A PROPÓSITO ──────────────────────────────
--
-- Con `DEFAULT 'gondolero'` un llamador nuevo que se olvide del tipo se lleva un
-- GND en silencio, que es el modo de falla que este archivo viene a cerrar.
-- Obligatorio, el que se olvida no corre. Mismo criterio que el `codigo` de
-- lib/rechazo-mision.ts.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. El generador, ahora por tipo.
--
--    Sigue sin chequear unicidad: es azar puro. Quien escribe decide cómo se
--    protege — `handle_new_user` reintentando contra el UNIQUE, el trigger de
--    más abajo con un WHILE EXISTS.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.generar_codigo_gondolero();

CREATE OR REPLACE FUNCTION public.generar_codigo_gondolero(_tipo text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _digitos constant text := '23456789';
  _prefijo text;
  _cuerpo  text := '';
  _i       int;
BEGIN
  _prefijo := CASE _tipo
                WHEN 'fixer'     THEN 'FXR'
                WHEN 'gondolero' THEN 'GND'
              END;

  -- Una empresa no tiene código. Pedirle uno es un error del llamador, no un
  -- caso a tolerar: devolver GND por defecto es justamente cómo los fixers
  -- terminaron con prefijo de gondolero.
  IF _prefijo IS NULL THEN
    RAISE EXCEPTION 'generar_codigo_gondolero: tipo_actor % no lleva codigo (solo gondolero y fixer)', _tipo
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR _i IN 1..8 LOOP
    _cuerpo := _cuerpo || substr(_digitos, floor(random() * 8)::int + 1, 1);
  END LOOP;

  RETURN _prefijo || '-' || substr(_cuerpo, 1, 4) || '-' || substr(_cuerpo, 5, 4);
END;
$fn$;

COMMENT ON FUNCTION public.generar_codigo_gondolero(text) IS
  'Única implementación del formato de codigo_gondolero: GND-NNNN-NNNN para gondoleros, FXR-NNNN-NNNN para fixers, dígitos 2-9. No chequea unicidad: quien inserta se protege. EL FORMATO ESTÁ ESCRITO TAMBIÉN EN lib/codigo-gondolero.ts (regex de TypeScript, alimenta el contador de códigos pendientes de /admin/usuarios): si cambia acá, cambia allá, o el contador nunca llega a cero y el botón "Asignar códigos" no hace nada.';

-- ---------------------------------------------------------------------------
-- 2. El trigger que mantiene la correspondencia.
--
--    ── POR QUÉ SOLO EN UPDATE, Y NO TAMBIÉN EN INSERT ────────────────────────
--    El único camino que INSERTA un profile es `handle_new_user()`, que ya pone
--    el código con su propio reintento contra el UNIQUE — un mecanismo probado
--    cuyo fallo significa que una persona no puede entrar a la app y no vuelve.
--    Meterle un trigger más a ese camino agrega una pieza móvil donde menos
--    conviene. Y no hace falta: al registrarse nadie es fixer.
--
--    Un INSERT directo de un fixer (un seed nuevo, por ejemplo) quedaría sin
--    código. Eso lo levanta el backfill del punto 4 y lo cuenta el panel admin,
--    así que falla visible, no en silencio.
--
--    ── POR QUÉ NO ROTA UN CÓDIGO QUE YA ESTÁ BIEN ────────────────────────────
--    `UPDATE OF tipo_actor` se dispara cuando la columna está en el SET, AUNQUE
--    EL VALOR NO CAMBIE. Sin la guarda de "ya tiene el prefijo que le
--    corresponde", un cambio de tipo que no cambia nada le rotaría el código a
--    alguien que ya lo dictó por teléfono.
--
--    La guarda se escribe sobre el prefijo esperado y no sobre "cambió el tipo",
--    y eso es lo que además REPARA lo que ya está mal: una marca con un GND
--    heredado de cuando era gondolera queda en NULL la próxima vez que alguien
--    toque su tipo.
--
--    ── EL WHILE EXISTS TIENE VENTANA, Y SE ACEPTA ───────────────────────────
--    El reintento de `handle_new_user` no la tiene: pide, choca contra el
--    UNIQUE, reintenta. En un BEFORE UPDATE eso no se puede hacer, porque la
--    violación se levanta después del trigger. Queda chequear antes de asignar.
--
--    Con 8^8 = 16.777.216 combinaciones y 29 perfiles con código, la ventana es
--    irrelevante; y si alguna vez se colara un duplicado, el UNIQUE hace fallar
--    el UPDATE de forma ruidosa en vez de escribirlo. Se prefiere eso a no tener
--    la regla.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_sincronizar_codigo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _prefijo  text;
  _candidato text;
  _intento  int;
BEGIN
  _prefijo := CASE NEW.tipo_actor
                WHEN 'fixer'     THEN 'FXR'
                WHEN 'gondolero' THEN 'GND'
              END;

  -- Las empresas no tienen código.
  IF _prefijo IS NULL THEN
    NEW.codigo_gondolero := NULL;
    RETURN NEW;
  END IF;

  -- Ya tiene el que le corresponde: no se toca. Ver el comentario de arriba.
  IF NEW.codigo_gondolero ~ ('^' || _prefijo || '-[2-9]{4}-[2-9]{4}$') THEN
    RETURN NEW;
  END IF;

  FOR _intento IN 1..50 LOOP
    _candidato := generar_codigo_gondolero(NEW.tipo_actor);
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE codigo_gondolero = _candidato) THEN
      NEW.codigo_gondolero := _candidato;
      RETURN NEW;
    END IF;
  END LOOP;

  -- Falla ruidoso. A diferencia del alta —donde abortar significa que alguien no
  -- puede entrar a la app— acá el que pierde es un admin apretando un botón, que
  -- puede reintentar. Con 16.777.216 combinaciones, 50 colisiones seguidas no es
  -- mala suerte: es que algo más está roto.
  RAISE EXCEPTION 'profiles_sincronizar_codigo: 50 colisiones seguidas generando codigo % para %', _prefijo, NEW.id
    USING ERRCODE = 'unique_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_sincronizar_codigo ON public.profiles;

CREATE TRIGGER profiles_sincronizar_codigo
  BEFORE UPDATE OF tipo_actor ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_sincronizar_codigo();

-- ---------------------------------------------------------------------------
-- 3. handle_new_user(): igual que antes, con la firma nueva.
--
--    `_tipo` siempre termina en 'gondolero' por la whitelist, así que el código
--    del alta siempre es GND. Se pasa la variable igual, y no el literal, para
--    que el día que la whitelist cambie no haya que acordarse de esta línea.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _tipo        text;
  _distri_id   uuid;
  _nombre      text;
  _alias       text;
  _celular     text;
  _codigo      text;
  _restriccion text;
  _intento     int;
  _listo       boolean := false;
BEGIN
  _tipo := NEW.raw_user_meta_data->>'tipo_actor';
  IF _tipo IS DISTINCT FROM 'gondolero' THEN
    _tipo := 'gondolero';
  END IF;

  BEGIN
    _distri_id := (NEW.raw_user_meta_data->>'distri_id')::uuid;
    IF _distri_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM distribuidoras WHERE id = _distri_id) THEN
      _distri_id := NULL;
    END IF;
  EXCEPTION WHEN others THEN
    _distri_id := NULL;
  END;

  _nombre  := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''), NEW.email);
  _alias   := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'alias', '')), '');
  _celular := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'celular', '')), '');

  FOR _intento IN 1..10 LOOP
    _codigo := generar_codigo_gondolero(_tipo);
    BEGIN
      INSERT INTO public.profiles (id, tipo_actor, nombre, alias, celular, distri_id, codigo_gondolero)
      VALUES (NEW.id, _tipo, _nombre, _alias, _celular, _distri_id, _codigo);
      _listo := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS _restriccion = CONSTRAINT_NAME;
      IF _restriccion IS DISTINCT FROM 'profiles_codigo_gondolero_key' THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  IF NOT _listo THEN
    RAISE WARNING '[handle_new_user] codigo_gondolero: 10 colisiones seguidas para el usuario % (%). Se crea el profile SIN codigo; usar "Asignar codigos" en /admin/usuarios.',
      NEW.id, NEW.email;
    INSERT INTO public.profiles (id, tipo_actor, nombre, alias, celular, distri_id, codigo_gondolero)
    VALUES (NEW.id, _tipo, _nombre, _alias, _celular, _distri_id, NULL);
  END IF;

  RETURN NEW;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. El backfill, ahora SENSIBLE AL TIPO.
--
--    ── POR QUÉ NO ALCANZA CON '^(GND|FXR)-...' ──────────────────────────────
--    Con ese patrón, un fixer que hoy tiene GND MATCHEA y queda excluido del
--    backfill para siempre — o sea que la función que tiene que migrar a los 14
--    fixers existentes no los vería. La condición tiene que ser "el prefijo que
--    le corresponde a SU tipo_actor", y eso es lo que al mismo tiempo la deja
--    idempotente: una segunda corrida no toca nada.
--
--    Sigue sin levantar a las empresas: si una quedó con un GND heredado, eso lo
--    limpia el trigger del punto 2 la próxima vez que alguien toque su tipo.
--    Meterlas acá haría que el botón "Asignar códigos" le asigne código a una
--    marca, que es lo contrario de lo que se busca.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_codigos_gondolero()
RETURNS TABLE (asignados int, fallidos int, detalle_fallidos text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _perfil      record;
  _codigo      text;
  _restriccion text;
  _intento     int;
  _ok          boolean;
BEGIN
  asignados        := 0;
  fallidos         := 0;
  detalle_fallidos := ARRAY[]::text[];

  FOR _perfil IN
    SELECT id, tipo_actor, COALESCE(alias, nombre, id::text) AS etiqueta
    FROM profiles
    WHERE tipo_actor IN ('gondolero', 'fixer')
      AND (codigo_gondolero IS NULL
           OR codigo_gondolero !~ ('^'
                || CASE tipo_actor WHEN 'fixer' THEN 'FXR' ELSE 'GND' END
                || '-[2-9]{4}-[2-9]{4}$'))
    ORDER BY created_at NULLS LAST
  LOOP
    _ok := false;
    FOR _intento IN 1..10 LOOP
      _codigo := generar_codigo_gondolero(_perfil.tipo_actor);
      BEGIN
        UPDATE profiles SET codigo_gondolero = _codigo WHERE id = _perfil.id;
        _ok := true;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS _restriccion = CONSTRAINT_NAME;
        IF _restriccion IS DISTINCT FROM 'profiles_codigo_gondolero_key' THEN
          RAISE;
        END IF;
      END;
    END LOOP;

    IF _ok THEN
      asignados := asignados + 1;
    ELSE
      fallidos         := fallidos + 1;
      detalle_fallidos := detalle_fallidos || _perfil.etiqueta;
      RAISE WARNING '[backfill_codigos_gondolero] 10 colisiones seguidas para % (%). Queda sin codigo.',
        _perfil.etiqueta, _perfil.id;
    END IF;
  END LOOP;

  RETURN NEXT;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM anon;
REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Migrar los fixers que ya existen.
--
--    Se REGENERAN, no conviven. Medido el 22/9/2026 en las dos bases:
--
--                              DEV   PROD
--      fixers                    6      8
--      con formato GND           6      8
--      fixer_invitacion_tokens   0      0   ← total, nunca se creó ninguno
--
--    O sea que ningún código de fixer fue dictado ni compartido jamás: los
--    vínculos que existen los escribió el seed directamente. El riesgo de
--    regenerar es cero hoy y sube con cada fixer real que entre.
--
--    Y convivir no resolvería nada: si GND puede ser cualquiera de los dos, el
--    prefijo deja de ser información y la distribuidora sigue sin saber a quién
--    invita, que es exactamente lo que este archivo viene a arreglar.
-- ---------------------------------------------------------------------------
SELECT * FROM public.backfill_codigos_gondolero();

-- ---------------------------------------------------------------------------
-- 6. Verificación. Falla con EXCEPTION, no con WARNING.
--
--    Un RAISE WARNING se pierde entre el ruido del SQL Editor y lo que se lee es
--    la última línea. Ya pasó con el bloque del DROP de columnas del 22/9: decía
--    OK sobre una verificación que había fallado. Y se chequean LAS DOS
--    direcciones — que los fixers tengan FXR y que los gondoleros sigan con GND—
--    porque mirar una sola deja pasar el error caro.
-- ---------------------------------------------------------------------------
DO $verif$
DECLARE
  _fixers_mal     int;
  _gondoleros_mal int;
  _empresas_con   int;
  _firmas         int;
BEGIN
  SELECT count(*) INTO _fixers_mal FROM profiles
   WHERE tipo_actor = 'fixer' AND codigo_gondolero IS DISTINCT FROM NULL
     AND codigo_gondolero !~ '^FXR-[2-9]{4}-[2-9]{4}$';

  SELECT count(*) INTO _gondoleros_mal FROM profiles
   WHERE tipo_actor = 'gondolero' AND codigo_gondolero IS DISTINCT FROM NULL
     AND codigo_gondolero !~ '^GND-[2-9]{4}-[2-9]{4}$';

  SELECT count(*) INTO _empresas_con FROM profiles
   WHERE tipo_actor NOT IN ('gondolero', 'fixer') AND codigo_gondolero IS NOT NULL;

  SELECT count(*) INTO _firmas FROM pg_proc WHERE proname = 'generar_codigo_gondolero';

  IF _firmas <> 1 THEN
    RAISE EXCEPTION '[fxr] quedaron % firmas de generar_codigo_gondolero; tiene que quedar UNA (la de un argumento)', _firmas;
  END IF;
  IF _fixers_mal <> 0 THEN
    RAISE EXCEPTION '[fxr] % fixers sin prefijo FXR', _fixers_mal;
  END IF;
  IF _gondoleros_mal <> 0 THEN
    RAISE EXCEPTION '[fxr] % gondoleros perdieron su prefijo GND', _gondoleros_mal;
  END IF;
  IF _empresas_con <> 0 THEN
    RAISE EXCEPTION '[fxr] % empresas quedaron con codigo', _empresas_con;
  END IF;

  RAISE NOTICE '[fxr] OK — una sola firma, fixers en FXR, gondoleros en GND, empresas sin codigo';
END;
$verif$;

COMMIT;
