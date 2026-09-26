-- ════════════════════════════════════════════════════════════════════════════
-- 20261006100000 — borrar las filas de gondolero_zonas
--
-- ── QUÉ SON ESAS FILAS ──────────────────────────────────────────────────────
-- Lo que dejó la pantalla de zonas del onboarding, sacada en el mismo commit
-- que esta migración. Esa pantalla ofrecía seis ciudades —la tabla legacy
-- `zonas` entera— y guardaba lo elegido en `gondolero_zonas`, que NO es la
-- tabla que lee el perfil: el perfil lee `gondolero_localidades`.
--
-- ── POR QUÉ NO ALCANZA CON SACAR LA PANTALLA ────────────────────────────────
-- Porque las filas que ya escribió siguen haciendo daño, y el daño no es que
-- no se vean: es que **apagan el aviso que las delataría**.
--
-- `gondolero/campanas/page.tsx` calcula `tieneZonas` mirando LAS DOS tablas.
-- Con estas filas puestas:
--
--   · el perfil se ve vacío, porque mira la otra tabla;
--   · el cartel amarillo "seleccioná tus localidades en tu Perfil" NO aparece,
--     porque para esa cuenta ya "hay zonas";
--   · y el filtro corre con esos `zona_id` contra `campana_zonas`, que tiene
--     CERO filas en las dos bases. El resultado es una lista recortada: se
--     caen las campañas que tienen localidades asignadas y quedan solo las
--     abiertas o las que no tienen ninguna zona.
--
-- O sea que el que pasó por la pantalla ve MENOS campañas que el que apretó
-- "Omitir por ahora". Medido el 25/9/2026: 5 filas en producción, todas de un
-- usuario real, todas del mismo día. Cero en dev.
--
-- ── VA DESPUÉS DEL DEPLOY, NO ANTES ─────────────────────────────────────────
-- Al revés que la migración de avisos, y por el mismo tipo de razón invertida:
-- acá el que escribe es el código VIEJO. Si esto corre primero, cualquier
-- gondolero que se registre en la ventana entre la migración y el deploy
-- vuelve a escribir las filas que se acaban de borrar.
--
--     deploy (la pantalla ya no existe) → esta migración
--
-- ── LA TABLA NO SE DROPEA ACÁ ───────────────────────────────────────────────
-- `gondolero_zonas` queda SIN escritores después de esto, pero todavía tiene
-- cinco lectores en la app (la lista de campañas, dos consultas de logros y el
-- panel de zonas del admin). Dropearla es otro tramo, con su propio orden:
-- sacar los lectores → deploy → verificar → DROP. Ver CLAUDE.md.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  _filas        integer;
  _gondoleros   integer;
  _loc_antes    integer;
  _loc_desp     integer;
  _quedan       integer;
BEGIN
  SELECT count(*), count(DISTINCT gondolero_id) INTO _filas, _gondoleros
    FROM gondolero_zonas;

  IF _filas = 0 THEN
    RAISE NOTICE '[gondolero_zonas] Ya estaba vacía. Sin cambios.';
  ELSE
    -- La OTRA tabla no se toca. Es la que tiene las zonas de verdad, y
    -- confundirlas es exactamente el bug que esto viene a limpiar.
    SELECT count(*) INTO _loc_antes FROM gondolero_localidades;

    DELETE FROM gondolero_zonas;

    SELECT count(*) INTO _loc_desp FROM gondolero_localidades;
    IF _loc_desp <> _loc_antes THEN
      RAISE EXCEPTION '[gondolero_zonas] Se tocó gondolero_localidades: había % y quedaron %.',
        _loc_antes, _loc_desp;
    END IF;

    RAISE NOTICE '[gondolero_zonas] Borradas % filas de % gondolero(s). gondolero_localidades intacta con % filas.',
      _filas, _gondoleros, _loc_desp;
  END IF;

  SELECT count(*) INTO _quedan FROM gondolero_zonas;
  IF _quedan <> 0 THEN
    RAISE EXCEPTION '[gondolero_zonas] Quedaron % filas.', _quedan;
  END IF;
END $$;

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló.
DO $$
DECLARE
  _n integer; _loc integer;
BEGIN
  -- 1. No quedó ninguna fila.
  SELECT count(*) INTO _n FROM gondolero_zonas;
  IF _n <> 0 THEN
    RAISE EXCEPTION '[gondolero_zonas] Todavía hay % filas.', _n;
  END IF;

  -- 2. LA OTRA DIRECCIÓN: la tabla SIGUE EXISTIENDO. Esta migración vacía, no
  --    dropea — los cinco lectores de la app la siguen consultando y un
  --    `to_regclass` en NULL les rompería la consulta entera.
  IF to_regclass('public.gondolero_zonas') IS NULL THEN
    RAISE EXCEPTION '[gondolero_zonas] La tabla desapareció. Esta migración vacía, no dropea.';
  END IF;

  -- 3. Y las zonas de verdad siguen donde estaban.
  IF to_regclass('public.gondolero_localidades') IS NULL THEN
    RAISE EXCEPTION '[gondolero_zonas] Desapareció gondolero_localidades.';
  END IF;
  SELECT count(*) INTO _loc FROM gondolero_localidades;

  RAISE NOTICE '[gondolero_zonas] OK — 0 filas, la tabla sigue, y gondolero_localidades conserva sus % filas.', _loc;
END $$;

COMMIT;
