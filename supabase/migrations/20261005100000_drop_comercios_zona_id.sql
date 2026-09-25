-- ════════════════════════════════════════════════════════════════════════════
-- 20261005100000 — DROP COLUMN comercios.zona_id
--
-- ── EL ÚLTIMO PASO DE UN ORDEN QUE YA SE CUMPLIÓ ────────────────────────────
-- Un DROP va último, nunca primero:
--
--     código que deja de usarla → deploy → verificar en prod → DROP
--
-- Las tres primeras están hechas. La etapa 7 del tramo de `localidad_id` sacó
-- las dos escrituras —`crearComercioNuevo`, que hardcodeaba "Entre Ríos" con
-- fallback a la primera fila de `zonas`, y `crearComercioParaCaptura`, que
-- usaba un `.limit(1)` pelado— y el deploy está verificado en producción.
--
-- ── EL GREP, DESPUÉS DE ESCRIBIR EL CÓDIGO Y NO ANTES ───────────────────────
-- App, scripts y SQL del repo, el 25/9/2026. Los `zona_id` que quedan son
-- todos de OTRAS tablas (`campana_zonas`, `gondolero_zonas`), que NO se tocan.
-- Sobre `comercios` no queda ni una lectura ni una escritura.
--
-- El grep encontró dos cosas que la verificación anterior había dado por
-- limpias, y las dos van en este mismo commit:
--
--   · `supabase/seed.sql` insertaba `zona_id` en `comercios`. Escribía NULL
--     —el archivo nunca insertó en `zonas`, así que los cinco subselects no
--     matcheaban— pero después del DROP el statement sería un error duro y el
--     seed entero dejaría de correr en cualquier base nueva.
--   · `types/index.ts` declaraba `zona_id` en `Comercio`. Un campo que existe
--     en el tipo y no en la tabla es una invitación a escribirlo: TypeScript
--     lo acepta y PostgREST rechaza **la consulta entera**.
--
-- `types/database.ts` es generado: se regenera con `npm run db:types` DESPUÉS
-- de correr esta migración, no antes.
--
-- ── LO QUE EL DROP DESTRUYE, Y POR QUÉ IGUAL SE PUEDE ───────────────────────
-- `zona_id IS NOT NULL` es el **marcador exacto** de "este comercio entró por
-- el agujero del alta" — la correlación con `localidad_id IS NULL` era
-- perfecta y sin una sola excepción en las dos bases. Borrar la columna borra
-- el marcador.
--
-- Por eso la precondición no es que nadie la lea: es que **ya no quede nadie a
-- quien marcar**. La reparación (`reparar-localidades.mts`) corrió en las dos,
-- y medido el 25/9/2026 antes de escribir esto:
--
--     con zona, SIN localidad    dev 0    prod 0
--     con zona, con localidad    dev 14   prod 6
--
-- Si ese primer número no fuera cero, este archivo se niega a correr. No es
-- una formalidad: es el único momento en que el dato todavía existe.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  _comercios_antes  integer;
  _con_localidad    integer;
  _comercios_desp   integer;
  _con_localidad_d  integer;
  _huerfanos        integer;
  _deps             text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comercios'
                    AND column_name = 'zona_id') THEN
    RAISE NOTICE '[drop zona_id] La columna ya no está. Sin cambios.';
    RETURN;
  END IF;

  -- ── PRECONDICIÓN 0: la geografía nueva existe ─────────────────────────────
  -- Sin `localidad_id` no hay a dónde mirar, y la precondición 1 fallaría con
  -- un error de parseo en vez de decir lo que pasa.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comercios'
                    AND column_name = 'localidad_id') THEN
    RAISE EXCEPTION '[drop zona_id] No existe comercios.localidad_id. Falta el tramo que la reemplaza: no se dropea nada.';
  END IF;

  -- ── PRECONDICIÓN 1: nadie queda sin geografía ─────────────────────────────
  SELECT count(*) INTO _huerfanos
    FROM comercios WHERE zona_id IS NOT NULL AND localidad_id IS NULL;

  IF _huerfanos > 0 THEN
    RAISE EXCEPTION
      '[drop zona_id] % comercios tienen zona y NO tienen localidad. El DROP les borraría la única geografía que tienen, y de paso el marcador para encontrarlos. Correr primero scripts/reparar-localidades.mts.',
      _huerfanos;
  END IF;

  -- ── PRECONDICIÓN 2: nada más cuelga de la columna ─────────────────────────
  -- El `DROP COLUMN` sin CASCADE ya se negaría ante una vista, pero se llevaría
  -- un índice puesto sin decir nada. Acá se enumera todo lo que depende de la
  -- columna y se aborta nombrándolo, salvo su propia FK, que es lo único que
  -- SE ESPERA que se vaya con ella.
  SELECT string_agg(format('%s#%s', d.classid::regclass::text, d.objid), ', ')
    INTO _deps
    FROM pg_depend d
    JOIN pg_class     src ON src.oid = d.refobjid
    JOIN pg_attribute a   ON a.attrelid = src.oid AND a.attnum = d.refobjsubid
   WHERE src.oid = 'public.comercios'::regclass
     AND a.attname = 'zona_id'
     -- El coalesce importa: si la FK no estuviera, la comparación daría NULL y
     -- el NOT dejaría pasar la fila como si no existiera. Un filtro que se
     -- apaga solo justo cuando la base no es la esperada.
     AND NOT coalesce(
           d.classid = 'pg_constraint'::regclass AND d.objid = (
             SELECT oid FROM pg_constraint
               WHERE conrelid = 'public.comercios'::regclass
                 AND conname  = 'comercios_zona_id_fkey'),
           false);

  IF _deps IS NOT NULL THEN
    RAISE EXCEPTION '[drop zona_id] Hay objetos colgando de la columna además de su FK: %. Se aborta.', _deps;
  END IF;

  SELECT count(*), count(localidad_id) INTO _comercios_antes, _con_localidad FROM comercios;

  ALTER TABLE comercios DROP COLUMN zona_id;

  -- ── LA OTRA DIRECCIÓN: no se perdió ninguna fila ni ninguna localidad ──────
  SELECT count(*), count(localidad_id) INTO _comercios_desp, _con_localidad_d FROM comercios;

  IF _comercios_desp <> _comercios_antes THEN
    RAISE EXCEPTION '[drop zona_id] Había % comercios y quedaron %.', _comercios_antes, _comercios_desp;
  END IF;
  IF _con_localidad_d <> _con_localidad THEN
    RAISE EXCEPTION '[drop zona_id] Había % con localidad y quedaron %.', _con_localidad, _con_localidad_d;
  END IF;

  RAISE NOTICE '[drop zona_id] OK — columna borrada. % comercios intactos, % con localidad.',
    _comercios_desp, _con_localidad_d;
END $$;

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló. Corre
-- igual por el camino idempotente, donde también tiene que dar verde.
DO $$
DECLARE
  _falta text;
BEGIN
  -- 1. Se fue la columna.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'comercios'
                AND column_name = 'zona_id') THEN
    RAISE EXCEPTION '[drop zona_id] La columna sigue ahí.';
  END IF;

  -- 2. Y se fue con ella su FK, que no puede quedar apuntando a nada.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'public.comercios'::regclass
                AND conname  = 'comercios_zona_id_fkey') THEN
    RAISE EXCEPTION '[drop zona_id] Quedó comercios_zona_id_fkey sin columna.';
  END IF;

  -- 3. LA OTRA DIRECCIÓN, que es la que atrapa un DROP apuntado a la tabla
  --    equivocada: `zona_id` vive en tres tablas y solo se va de UNA. Las otras
  --    dos siguen en uso —el selector de zonas del gondolero y el alcance de la
  --    campaña— y `zonas` con ellas.
  FOR _falta IN
    SELECT x.q FROM (VALUES
      ('campana_zonas.zona_id'),
      ('gondolero_zonas.zona_id'),
      ('zonas.id')
    ) AS x(q)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
       WHERE c.table_schema = 'public'
         AND c.table_name   = split_part(x.q, '.', 1)
         AND c.column_name  = split_part(x.q, '.', 2))
  LOOP
    RAISE EXCEPTION '[drop zona_id] Se perdió % — el DROP se llevó algo que no era suyo.', _falta;
  END LOOP;

  -- 4. Y la tabla quedó entera.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'comercios'
                    AND column_name = 'localidad_id') THEN
    RAISE EXCEPTION '[drop zona_id] Desapareció comercios.localidad_id.';
  END IF;

  RAISE NOTICE '[drop zona_id] OK — comercios.zona_id y su FK no están; campana_zonas, gondolero_zonas y zonas siguen intactas.';
END $$;

COMMIT;
