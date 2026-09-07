-- =============================================================================
-- 052 — handle_new_user() con whitelist de tipo_actor
-- =============================================================================
-- QUÉ CUBRE: el trigger que crea el profile al insertarse un usuario en
-- auth.users.
--
-- POR QUÉ FALTABA: es uno de los cambios ejecutados a mano el 7/9/2026. El dump
-- de docs/schema-real-2026-09-pre-incidente.md se tomó ANTES de aplicarlo, por eso la sección
-- 5 de ese documento tenía la versión vieja.
--
-- POR QUÉ IMPORTA: raw_user_meta_data es literalmente lo que el cliente manda
-- en options.data del signUp(). La versión previa copiaba tipo_actor sin
-- validar, así que con la anon key cualquiera podía registrarse como
-- tipo_actor='admin' y quedarse con la plataforma entera: toda la RLS del
-- sistema se apoya en get_tipo_actor().
--
-- QUÉ HACE LA VERSIÓN ACTUAL, además de la whitelist de tipo_actor:
--   - valida que el distri_id de metadata exista realmente en distribuidoras,
--     y lo descarta si no (evita profiles apuntando a una distri inventada);
--   - envuelve el cast a uuid en un bloque EXCEPTION, así un distri_id
--     malformado deja el campo en NULL en vez de abortar el alta del usuario.
--
-- POR QUÉ ES SEGURO FORZAR 'gondolero':
-- El alta desde el panel admin usa auth.admin.createUser() y acto seguido pisa
-- el profile con un UPDATE que incluye tipo_actor
-- (app/(admin)/admin/usuarios/actions.ts:235-250, verificado). Forzar
-- 'gondolero' en el trigger no rompe el alta de marcas, distris ni
-- repositoras: el UPDATE posterior corre con service_role y les pone el tipo
-- correcto.
--
-- ORIGEN DEL SQL: copia literal de producción vía pg_get_functiondef().
-- Verificado el 7/9/2026.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _tipo      text;
  _distri_id uuid;
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
  INSERT INTO public.profiles (id, tipo_actor, nombre, alias, distri_id)
  VALUES (
    NEW.id,
    _tipo,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''), NEW.email),
    NEW.raw_user_meta_data->>'alias',
    _distri_id
  );
  RETURN NEW;
END;
$function$;
