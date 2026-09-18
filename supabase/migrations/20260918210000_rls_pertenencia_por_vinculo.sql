-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: la pertenencia de una persona sale del vínculo, no de profiles.distri_id
--
-- ── QUÉ ARREGLA ──────────────────────────────────────────────────────────────
-- Dos políticas preguntaban "¿esta persona es de mi distribuidora?" comparando
-- `profiles.distri_id`, que tiene lugar para UNA sola. El gondolero que trabaja
-- para dos figuraba en una y era invisible para la otra — el mismo bug que se
-- corrigió en las pantallas, escrito acá en SQL.
--
--   profiles.profiles_select_distri          ← la que se busca
--   comercios.comercios_update_distri_admin  ← la que NO se buscaba y tenía lo mismo
--
-- Las otras once políticas que usan get_distri_id() NO se tocan: preguntan
-- IDENTIDAD —qué distribuidora ES este usuario, de quién es esta campaña— y ahí
-- la columna es correcta y es la única fuente.
--
-- ── POR QUÉ UNA FUNCIÓN Y NO UN EXISTS INLINE ────────────────────────────────
-- Escribir el EXISTS dentro de la policy NO funciona. Medido:
--
--   ERROR 42P17: infinite recursion detected in policy for relation "profiles"
--
-- Leer `profiles` evalúa esta policy, que lee `gondolero_distri_solicitudes`,
-- cuya policy `solicitudes_distri` lee `profiles`, y vuelve a empezar.
--
-- `SECURITY DEFINER` corta el ciclo porque adentro corre como el dueño de las
-- tablas, que no pasa por RLS (ninguna de las tres tiene FORCE ROW LEVEL
-- SECURITY). Es exactamente el patrón de `get_distri_id()` y `get_tipo_actor()`,
-- que leen `profiles` desde las policies de `profiles` sin recursión.
--
-- `search_path` fijo por la misma razón que las otras tres: una función DEFINER
-- sin search_path es escalable por un esquema puesto adelante.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── La función ───────────────────────────────────────────────────────────────
-- Mira las DOS tablas porque `profiles` no distingue: la política se aplica
-- igual a un gondolero que a un fixer, y cada uno tiene la suya. Hasta el
-- backfill del 18/9/2026 `fixer_distri_solicitudes` estaba vacía, así que sin
-- ese paso previo esta función habría dejado invisibles a los fixers.
CREATE OR REPLACE FUNCTION public.es_actor_de_mi_distri(_actor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM gondolero_distri_solicitudes s
    WHERE s.gondolero_id = _actor_id
      AND s.distri_id    = get_distri_id()
      AND s.estado       = 'aprobada'
  ) OR EXISTS (
    SELECT 1 FROM fixer_distri_solicitudes f
    WHERE f.fixer_id  = _actor_id
      AND f.distri_id = get_distri_id()
      AND f.estado    = 'aprobada'
  );
$$;

REVOKE ALL ON FUNCTION public.es_actor_de_mi_distri(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.es_actor_de_mi_distri(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.es_actor_de_mi_distri(uuid) IS
  'True si el actor tiene vínculo APROBADO con la distribuidora del usuario actual. Fuente: gondolero_distri_solicitudes / fixer_distri_solicitudes, NO profiles.distri_id.';

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Solo cambia la segunda mitad del AND. La primera —que el que mira sea una
-- distribuidora— queda igual.
DROP POLICY IF EXISTS profiles_select_distri ON profiles;
CREATE POLICY profiles_select_distri ON profiles
  FOR SELECT
  USING (
    get_tipo_actor() = 'distribuidora'
    AND es_actor_de_mi_distri(profiles.id)
  );

-- ── comercios ────────────────────────────────────────────────────────────────
-- "Puedo editar un comercio que registró alguien de mi equipo". Es el gemelo en
-- SQL del `puedeValidar` de distribuidora/comercios, que ya se corrigió.
-- La rama de admin queda intacta.
DROP POLICY IF EXISTS comercios_update_distri_admin ON comercios;
CREATE POLICY comercios_update_distri_admin ON comercios
  FOR UPDATE
  USING (
    get_tipo_actor() = 'admin'
    OR (
      get_tipo_actor() = 'distribuidora'
      AND comercios.registrado_por IS NOT NULL
      AND es_actor_de_mi_distri(comercios.registrado_por)
    )
  );

COMMIT;
