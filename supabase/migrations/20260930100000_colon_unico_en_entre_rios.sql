-- ════════════════════════════════════════════════════════════════════════════
-- 20260930100000 — Colón deja de estar dos veces en Entre Ríos
--
-- ETAPA 1 del tramo "localidad_id en el alta de comercio".
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────
-- `localidades` no tiene coordenadas, así que resolver una localidad desde un
-- GPS es un match POR NOMBRE. Y el padrón tiene el mismo nombre repetido 99
-- veces entre provincias y 64 veces DENTRO de una misma provincia, donde la
-- provincia ya no desambigua.
--
-- Medido el 25/9/2026 sobre los 19 comercios sin localidad que hay hoy: **0
-- resuelven exacto, 18 quedan ambiguos**. Los 18 están en Colón, y Colón existe
-- dos veces en Entre Ríos. O sea que este duplicado, él solo, es lo que hace
-- que el pueblo del piloto no se pueda resolver nunca.
--
-- ── POR QUÉ SOLO COLÓN, Y NO LOS 64 ─────────────────────────────────────────
-- Es el ÚNICO con evidencia dura de cuál de los dos es el bueno:
--
--     id   1  depto Colón     12 comercios · 3 campañas · 11 filas del CSV
--     id 126  depto Uruguay    0 · 0 · 0
--
-- Y hay una segunda señal independiente que coincide: el departamento se llama
-- igual que la localidad, patrón que se repite en 17 de los 64 pares.
--
-- Los otros 63 no tienen datos colgando en ninguna de las dos bases, así que
-- decidir cuál sobra sería adivinar geografía sin consultarla — que es la regla
-- que este proyecto ya pagó tres veces. Quedan como deuda del padrón.
--
-- **No bloquean**: `lib/geocoding.ts` (etapa 2) NO adivina ante ambigüedad, así
-- que un duplicado degrada a "lo confirma una persona en la bandeja", que es
-- seguro. Lo que no es seguro es lo contrario — elegir uno al azar.
--
-- ── LA PARTE DELICADA: EL CASCADE ───────────────────────────────────────────
-- De las tres FK que apuntan a `localidades`, dos son NO ACTION —`comercios` y
-- `campana_localidades`, que por eso hacen fallar un borrado con datos— pero
-- `gondolero_localidades` es **ON DELETE CASCADE**. Un DELETE pelado le borraría
-- la zona declarada a un gondolero **en silencio**.
--
-- En dev hay exactamente ese caso: un gondolero eligió las DOS variantes de
-- Colón, porque en pantalla se ven idénticas. Por eso acá se repunta explícito
-- antes de borrar, con ON CONFLICT DO NOTHING (la PK es (gondolero_id,
-- localidad_id) y ya tiene la buena, así que colisionaría).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  _queda    integer;
  _sobra    integer;
  _n        integer;
  _com      integer;
  _cam      integer;
  _movidos  integer;
BEGIN
  -- ── Resolver los dos ids por NOMBRE, no a mano ──────────────────────────
  -- Los ids son 1 y 126 en las dos bases, pero escribirlos acá ataría la
  -- migración a que el seed haya corrido igual en todos lados.
  SELECT count(*) INTO _n
    FROM localidades l
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias   p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón';

  IF _n = 1 THEN
    RAISE NOTICE '[colon] Ya estaba resuelto: una sola fila. Nada que hacer.';
    RETURN;
  ELSIF _n <> 2 THEN
    RAISE EXCEPTION '[colon] Se esperaban 2 filas de Colón en Entre Ríos y hay %. Revisar a mano.', _n;
  END IF;

  SELECT l.id INTO _queda
    FROM localidades l
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias   p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón' AND d.nombre = 'Colón';

  SELECT l.id INTO _sobra
    FROM localidades l
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias   p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón' AND d.nombre = 'Uruguay';

  IF _queda IS NULL OR _sobra IS NULL THEN
    RAISE EXCEPTION '[colon] No están las dos esperadas (depto Colón y depto Uruguay). queda=% sobra=%', _queda, _sobra;
  END IF;

  -- ── Precondición: el que se va NO puede tener datos ─────────────────────
  -- Las FK de comercios y campana_localidades son NO ACTION, así que el DELETE
  -- fallaría igual. Se chequea antes para que el mensaje diga QUÉ pasó en vez
  -- de un error de constraint.
  SELECT count(*) INTO _com FROM comercios           WHERE localidad_id = _sobra;
  SELECT count(*) INTO _cam FROM campana_localidades WHERE localidad_id = _sobra;
  IF _com > 0 OR _cam > 0 THEN
    RAISE EXCEPTION '[colon] La fila a borrar (id %) tiene % comercios y % campañas. NO se borra: hay que decidir a mano.', _sobra, _com, _cam;
  END IF;

  -- ── Y el que se queda TIENE que tener los datos del piloto ──────────────
  -- Verificar una sola dirección dejaría pasar el borrado del bueno.
  SELECT count(*) INTO _com FROM comercios WHERE localidad_id = _queda;
  IF _com = 0 THEN
    RAISE EXCEPTION '[colon] La fila que se queda (id %) no tiene ningún comercio. Algo no cuadra: abortar.', _queda;
  END IF;

  -- ── Repuntar las zonas declaradas ANTES de borrar ───────────────────────
  -- Sin esto, el ON DELETE CASCADE se las lleva sin dejar rastro.
  UPDATE gondolero_localidades g
     SET localidad_id = _queda
   WHERE g.localidad_id = _sobra
     AND NOT EXISTS (SELECT 1 FROM gondolero_localidades x
                      WHERE x.gondolero_id = g.gondolero_id AND x.localidad_id = _queda);
  GET DIAGNOSTICS _movidos = ROW_COUNT;

  -- Los que no se movieron son los que YA tenían la buena: se borran, porque
  -- si no el CASCADE los borraría igual y el conteo de abajo no cerraría.
  DELETE FROM gondolero_localidades WHERE localidad_id = _sobra;

  DELETE FROM localidades WHERE id = _sobra;

  RAISE NOTICE '[colon] queda id %, se borró id %. Zonas repuntadas: %.', _queda, _sobra, _movidos;
END $$;

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING: el 22/9/2026 un bloque de verificación emitía un
-- WARNING y dos líneas después un 'OK' sin condición, así que decía OK sobre un
-- DROP que no se había aplicado. Acá el OK es inalcanzable si algo falló.
DO $$
DECLARE
  _n integer; _com integer; _cam integer; _huerf integer;
BEGIN
  -- 1. Colón quedó único en Entre Ríos.
  SELECT count(*) INTO _n
    FROM localidades l
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias   p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón';
  IF _n <> 1 THEN
    RAISE EXCEPTION '[colon] Quedaron % filas de Colón en Entre Ríos, se esperaba 1.', _n;
  END IF;

  -- 2. Y el piloto sigue entero: los comercios y las campañas no se movieron.
  SELECT count(*) INTO _com FROM comercios co
    JOIN localidades l ON l.id = co.localidad_id
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón';
  SELECT count(*) INTO _cam FROM campana_localidades ca
    JOIN localidades l ON l.id = ca.localidad_id
    JOIN departamentos d ON d.id = l.departamento_id
    JOIN provincias p ON p.id = d.provincia_id
   WHERE p.nombre = 'Entre Ríos' AND l.nombre = 'Colón';
  IF _com = 0 OR _cam = 0 THEN
    RAISE EXCEPTION '[colon] Se perdió el piloto: % comercios, % campañas.', _com, _cam;
  END IF;

  -- 3. Nadie quedó apuntando a una localidad que ya no existe.
  SELECT count(*) INTO _huerf FROM gondolero_localidades g
   WHERE NOT EXISTS (SELECT 1 FROM localidades l WHERE l.id = g.localidad_id);
  IF _huerf > 0 THEN
    RAISE EXCEPTION '[colon] Quedaron % zonas huérfanas.', _huerf;
  END IF;

  RAISE NOTICE '[colon] OK — Colón único en Entre Ríos, % comercios y % campañas intactos.', _com, _cam;
END $$;

COMMIT;
