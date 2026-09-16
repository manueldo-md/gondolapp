-- =============================================================================
-- codigo_gondolero: un generador único, código al registrarse, y backfill
-- =============================================================================
-- QUÉ ARREGLA
--
-- 1. Había TRES generadores que no coincidían entre sí:
--      - 20260404120258 (SQL):  UPPER(SUBSTRING(alias|nombre,1,4)) + '-' + 1000-9999
--      - 20260404140924 (SQL):  igual pero rango 0000-9998
--      - 20260408174732 (SQL):  'FIXR-' fijo + 1000-9999  (fixers)
--      - app/(admin)/admin/usuarios/actions.ts (TS): solo nombre, limpia [^a-zA-Z],
--        rango 0000-9998
--    Ninguno chequeaba colisión, aunque la columna es UNIQUE
--    (profiles_codigo_gondolero_key). Ahora la única implementación del formato
--    vive en generar_codigo_gondolero(); el TS deja de generar.
--
-- 2. handle_new_user() no asignaba código. Todo gondolero que se registraba por
--    /auth nacía sin código — y el registro público está ABIERTO (middleware.ts
--    lista /auth como ruta pública y el botón "Registrarme" no tiene condición).
--    De ahí los 24 sin código en dev y 24 en prod.
--
-- 3. handle_new_user() había perdido `celular` en la versión 052 del 7/9/2026.
--    El formulario de registro lo sigue mandando en metadata (app/auth/page.tsx)
--    y el perfil lo sigue leyendo, así que todo celular cargado desde esa fecha
--    se descartaba en silencio. Se restaura acá.
--
-- FORMATO NUEVO: GND-NNNN-NNNN con dígitos 2-9
--   - Prefijo fijo, NO derivado del nombre: derivarlo filtraba el nombre real de
--     la persona a cualquiera que tuviera el código, y producía prefijos de ancho
--     variable (el TS borra lo que no sea [a-zA-Z] ANTES de cortar a 4, así que
--     "Ñuñez" daba UEZ- de tres letras).
--   - Sin letras en la parte variable y sin 0 ni 1: el canal real es WhatsApp y
--     el código se dicta por teléfono. En castellano be/de/pe/te/ve/e riman, así
--     que sacar solo I y O no alcanzaba; los dígitos 2-9 no se confunden entre sí.
--   - Espacio: 8^8 = 16.777.216 combinaciones.
--   - Mismo prefijo para gondoleros y fixers: comparten la columna y el UNIQUE es
--     global. El prefijo nunca discriminó nada — las tres búsquedas por código
--     filtran por tipo_actor, no por prefijo — y de hecho ya estaba roto: los dos
--     fixers de prod tenían FIXE-, derivado de "Fixer", no el FIXR- de la
--     migración de abril.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. El generador único. Puro azar, sin tocar la base: la unicidad la resuelve
--    quien inserta, reintentando contra el UNIQUE. Así no hay ventana entre
--    "chequeé que estaba libre" y "lo escribí".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_codigo_gondolero()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _digitos constant text := '23456789';
  _cuerpo  text := '';
  _i       int;
BEGIN
  FOR _i IN 1..8 LOOP
    _cuerpo := _cuerpo || substr(_digitos, floor(random() * 8)::int + 1, 1);
  END LOOP;
  RETURN 'GND-' || substr(_cuerpo, 1, 4) || '-' || substr(_cuerpo, 5, 4);
END;
$fn$;

COMMENT ON FUNCTION public.generar_codigo_gondolero() IS
  'Única implementación del formato de codigo_gondolero: GND-NNNN-NNNN, dígitos 2-9. No chequea unicidad: quien inserta reintenta contra profiles_codigo_gondolero_key.';

-- ---------------------------------------------------------------------------
-- 2. handle_new_user(): crea el profile CON código, reintentando ante colisión.
--
--    Por qué el reintento va adentro de un bloque BEGIN/EXCEPTION: en plpgsql ese
--    bloque abre una subtransacción, así que capturar unique_violation ahí NO
--    aborta el alta del usuario. Sin eso, una colisión de código mataría el
--    registro entero.
--
--    Por qué se filtra por CONSTRAINT_NAME: unique_violation también se dispara
--    si el id ya existe en profiles. Reintentar eso sería un loop garantizado a
--    fallar 10 veces y a tragarse un error real, así que se re-lanza.
--
--    Si se agotan los 10 intentos: se inserta con codigo_gondolero NULL y el
--    usuario entra igual. Un código faltante lo repara el botón "Asignar códigos"
--    del panel admin; un registro abortado es una persona que no pudo entrar a la
--    app y no vuelve. Queda registrado con RAISE WARNING (logs de Postgres en
--    Supabase) y además queda visible en el panel, que cuenta los perfiles sin
--    código.
--
--    Se mantiene la whitelist de tipo_actor de la migración 052: con la anon key
--    cualquiera podría registrarse como admin y quedarse con la plataforma.
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
    _codigo := generar_codigo_gondolero();
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
-- 3. Backfill. Se expone como RPC para el botón "Asignar códigos" del panel
--    admin. Devuelve asignados y fallidos POR SEPARADO, con el detalle de
--    quiénes fallaron: un backfill que arregla la mitad y reporta solo los
--    éxitos es peor que uno que no corre, porque deja creer que terminó.
--
--    Alcance: gondoleros y fixers sin código, MÁS los que tengan un código con el
--    formato viejo. Así reescribe los 5 de prueba que hoy existen (GOND-4054,
--    FIXE-8990, etc.) y al mismo tiempo es idempotente: una segunda corrida no
--    toca nada, porque los códigos nuevos ya matchean el patrón.
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
    SELECT id, COALESCE(alias, nombre, id::text) AS etiqueta
    FROM profiles
    WHERE tipo_actor IN ('gondolero', 'fixer')
      AND (codigo_gondolero IS NULL
           OR codigo_gondolero !~ '^GND-[2-9]{4}-[2-9]{4}$')
    ORDER BY created_at NULLS LAST
  LOOP
    _ok := false;
    FOR _intento IN 1..10 LOOP
      _codigo := generar_codigo_gondolero();
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

-- La función reasigna códigos de identidad y corre como SECURITY DEFINER: solo
-- la llama el panel admin con la service_role key.
REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM anon;
REVOKE ALL ON FUNCTION public.backfill_codigos_gondolero() FROM authenticated;
