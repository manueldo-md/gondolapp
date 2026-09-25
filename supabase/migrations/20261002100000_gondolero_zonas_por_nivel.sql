-- ════════════════════════════════════════════════════════════════════════════
-- 20261002100000 — la zona del gondolero se guarda por NIVEL, no expandida
--
-- ETAPA 8 del tramo "localidad_id en el alta de comercio".
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────
-- Hoy `gondolero_localidades` guarda solo localidades, y el flag "todas las del
-- departamento" del selector **se pierde al persistir**: se expande a la lista
-- de localidades de ese momento. El día que el padrón sume una localidad, ese
-- gondolero no la cubre — y nadie se entera.
--
-- No es hipotético: hay **4 departamentos completos** guardados así en dev. Y
-- agregar "toda la provincia" —que es lo que se pidió— multiplicaría el mismo
-- problema por 8: Entre Ríos son 143 filas, Buenos Aires 252.
--
-- ── POR QUÉ AHORA, Y NO DESPUÉS ─────────────────────────────────────────────
-- **`gondolero_localidades` tiene CERO filas en producción.** No hay nada que
-- migrar. En dev son 42 filas de 2 gondoleros. Cualquier día posterior a que esa
-- tabla se llene, este mismo cambio pasa a ser una migración de datos con gente
-- real adentro. Esa ventana no se repite.
--
-- ── POR QUÉ COLUMNA Y NO TRES TABLAS ────────────────────────────────────────
-- Una tabla por nivel son tres tablas que hay que unir en CADA lectura, y cada
-- unión es una oportunidad de que alguien se olvide de una. Con `nivel`, leer es
-- una consulta y agregar un nivel es una fila más en un CHECK.
--
-- El costo es real y se paga abajo: **`ref_id` no puede tener FK**, porque
-- apunta a tres tablas distintas. Perder la FK sin reemplazo sería peor que las
-- tres tablas, así que se reemplaza ENTERA — la FK daba dos cosas y las dos se
-- reponen con triggers:
--
--   validar al escribir  →  `gondolero_zonas_validar_ref`
--   borrar en cascada    →  tres triggers en localidades/departamentos/provincias
--
-- Un trigger que solo valide repone la mitad, y la mitad que falta es la que ya
-- mordió: la migración `20260930100000` borró una localidad y el `ON DELETE
-- CASCADE` fue lo que impidió dejar filas huérfanas.
--
-- ── OJO CON EL TIPO DE `ref_id` ─────────────────────────────────────────────
-- Es `integer` porque `localidades.id`, `departamentos.id` y `provincias.id` son
-- los tres `integer`. **`zonas.id` es `uuid`** — la tabla vieja, 8 filas, otra
-- jerarquía. Si algún día se quisiera meter un nivel que referencie algo con
-- `uuid`, esto NO estira: habría que elegir entre un `text` que acepte los dos
-- (perdiendo la validación de tipo) o una segunda columna. Queda escrito porque
-- es exactamente el tipo de cosa que muerde dentro de un año, cuando nadie se
-- acuerde de por qué la columna es integer.
--
-- ── EL NOMBRE DE LA TABLA QUEDA VIEJO, A PROPÓSITO ──────────────────────────
-- `gondolero_localidades` pasa a guardar también provincias y departamentos, así
-- que el nombre miente un poco. Renombrarla toca las policies, los índices y
-- todos los `.from()`; no vale el riesgo en la misma migración que cambia el
-- modelo. Si se renombra algún día, `gondolero_zonas_geo` — y NO
-- `gondolero_zonas`, que ya existe y es la jerarquía vieja de `zonas`.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Las dos columnas ─────────────────────────────────────────────────────
ALTER TABLE gondolero_localidades
  ADD COLUMN IF NOT EXISTS nivel  text,
  ADD COLUMN IF NOT EXISTS ref_id integer;

-- Todo lo que había es de nivel localidad, por construcción.
--
-- Va con EXECUTE y no como UPDATE suelto porque en la SEGUNDA corrida
-- `localidad_id` ya no existe, y **Postgres parsea el statement entero aunque
-- el WHERE no matchee ninguna fila**: un UPDATE directo rompe la idempotencia
-- con "column localidad_id does not exist". Lo encontró el dry-run al correr la
-- migración dos veces, no la lectura.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'gondolero_localidades' AND column_name = 'localidad_id') THEN
    EXECUTE $q$
      UPDATE gondolero_localidades
         SET nivel  = coalesce(nivel, 'localidad'),
             ref_id = coalesce(ref_id, localidad_id)
       WHERE nivel IS NULL OR ref_id IS NULL
    $q$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'gondolero_localidades'
                AND column_name = 'nivel' AND is_nullable = 'YES') THEN
    ALTER TABLE gondolero_localidades ALTER COLUMN nivel  SET NOT NULL;
    ALTER TABLE gondolero_localidades ALTER COLUMN ref_id SET NOT NULL;
    ALTER TABLE gondolero_localidades ALTER COLUMN nivel  SET DEFAULT 'localidad';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gondolero_zonas_nivel_check') THEN
    ALTER TABLE gondolero_localidades ADD CONSTRAINT gondolero_zonas_nivel_check
      CHECK (nivel IN ('provincia', 'departamento', 'localidad'));
  END IF;
END $$;

-- ── 2. La PK pasa a incluir el nivel ────────────────────────────────────────
-- Sin esto, un gondolero no podría tener la provincia 3 y el departamento 3:
-- son dos cosas distintas que comparten el número.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'gondolero_localidades_pkey'
                AND pg_get_constraintdef(oid) = 'PRIMARY KEY (gondolero_id, localidad_id)') THEN
    ALTER TABLE gondolero_localidades DROP CONSTRAINT gondolero_localidades_pkey;
    ALTER TABLE gondolero_localidades
      ADD CONSTRAINT gondolero_localidades_pkey PRIMARY KEY (gondolero_id, nivel, ref_id);
  END IF;
END $$;

-- ── 3. Se va `localidad_id`, y con ella su FK ───────────────────────────────
-- Va en ESTA migración y no en una posterior: dejarla conviviendo con `ref_id`
-- serían dos columnas para el mismo dato, que es justo lo que este proyecto
-- persigue. Y el `NOT NULL` que tiene haría imposible insertar una provincia.
--
-- La ventana de deploy es inocua por una razón medida, no por optimismo: **la
-- tabla tiene cero filas en producción**, así que el peor síntoma posible
-- —"no tenés zonas configuradas"— es el estado que ya hay.
ALTER TABLE gondolero_localidades DROP COLUMN IF EXISTS localidad_id;

-- ── 4. La validación que reemplaza la mitad de la FK ────────────────────────
CREATE OR REPLACE FUNCTION gondolero_zonas_validar_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _existe boolean;
BEGIN
  -- Se compara con `=` y no con IN sobre una tabla elegida dinámicamente: tres
  -- ramas explícitas son más largas pero no dependen de SQL armado con strings.
  IF NEW.nivel = 'localidad' THEN
    SELECT EXISTS (SELECT 1 FROM localidades   WHERE id = NEW.ref_id) INTO _existe;
  ELSIF NEW.nivel = 'departamento' THEN
    SELECT EXISTS (SELECT 1 FROM departamentos WHERE id = NEW.ref_id) INTO _existe;
  ELSIF NEW.nivel = 'provincia' THEN
    SELECT EXISTS (SELECT 1 FROM provincias    WHERE id = NEW.ref_id) INTO _existe;
  ELSE
    RAISE EXCEPTION 'nivel desconocido: %', NEW.nivel;
  END IF;

  IF NOT _existe THEN
    RAISE EXCEPTION 'No existe % con id % (gondolero_localidades.ref_id)', NEW.nivel, NEW.ref_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gondolero_zonas_validar_ref ON gondolero_localidades;
CREATE TRIGGER gondolero_zonas_validar_ref
  BEFORE INSERT OR UPDATE OF nivel, ref_id ON gondolero_localidades
  FOR EACH ROW EXECUTE FUNCTION gondolero_zonas_validar_ref();

-- ── 5. La cascada, que es la OTRA mitad de la FK ────────────────────────────
-- Sin esto, borrar una localidad deja filas apuntando a un id que no existe. No
-- es teórico: `20260930100000` borró una y el CASCADE fue lo que evitó las
-- huérfanas — y esa migración tuvo que repuntar a mano justamente porque el
-- CASCADE es silencioso.
CREATE OR REPLACE FUNCTION gondolero_zonas_limpiar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- TG_ARGV[0] es el nivel que la tabla borrada representa.
  DELETE FROM gondolero_localidades WHERE nivel = TG_ARGV[0] AND ref_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS gondolero_zonas_limpiar_localidad ON localidades;
CREATE TRIGGER gondolero_zonas_limpiar_localidad
  AFTER DELETE ON localidades
  FOR EACH ROW EXECUTE FUNCTION gondolero_zonas_limpiar('localidad');

DROP TRIGGER IF EXISTS gondolero_zonas_limpiar_departamento ON departamentos;
CREATE TRIGGER gondolero_zonas_limpiar_departamento
  AFTER DELETE ON departamentos
  FOR EACH ROW EXECUTE FUNCTION gondolero_zonas_limpiar('departamento');

DROP TRIGGER IF EXISTS gondolero_zonas_limpiar_provincia ON provincias;
CREATE TRIGGER gondolero_zonas_limpiar_provincia
  AFTER DELETE ON provincias
  FOR EACH ROW EXECUTE FUNCTION gondolero_zonas_limpiar('provincia');

COMMENT ON COLUMN gondolero_localidades.nivel IS
  'provincia | departamento | localidad. La zona se guarda al nivel que eligió el gondolero: expandirla a localidades la deja vieja cuando el padrón crece.';
COMMENT ON COLUMN gondolero_localidades.ref_id IS
  'id en la tabla del nivel. SIN FK porque apunta a tres tablas: la validación y la cascada las hacen triggers. INTEGER porque las tres son integer — zonas.id es uuid y NO entra acá.';

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y el OK inalcanzable si algo falló.
DO $$
DECLARE _cols integer; _filas integer; _sinloc integer; _trg integer; _pk text;
BEGIN
  SELECT count(*) INTO _cols FROM information_schema.columns
   WHERE table_name = 'gondolero_localidades' AND column_name IN ('nivel', 'ref_id');
  IF _cols <> 2 THEN RAISE EXCEPTION '[zonas] Faltan columnas: hay % de 2.', _cols; END IF;

  -- La otra dirección: localidad_id se fue.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'gondolero_localidades' AND column_name = 'localidad_id') THEN
    RAISE EXCEPTION '[zonas] localidad_id sigue ahí.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _pk FROM pg_constraint
   WHERE conname = 'gondolero_localidades_pkey';
  IF _pk <> 'PRIMARY KEY (gondolero_id, nivel, ref_id)' THEN
    RAISE EXCEPTION '[zonas] La PK quedó en: %', _pk;
  END IF;

  -- Los cuatro triggers que reemplazan la FK.
  SELECT count(*) INTO _trg FROM pg_trigger
   WHERE NOT tgisinternal AND tgname LIKE 'gondolero_zonas_%';
  IF _trg <> 4 THEN RAISE EXCEPTION '[zonas] Hay % triggers de 4.', _trg; END IF;

  -- Y NO se perdió ni una fila: todas quedaron como nivel localidad.
  SELECT count(*) INTO _filas  FROM gondolero_localidades;
  SELECT count(*) INTO _sinloc FROM gondolero_localidades WHERE nivel <> 'localidad';
  IF _sinloc > 0 THEN
    RAISE EXCEPTION '[zonas] % filas migraron a un nivel que no es localidad.', _sinloc;
  END IF;

  RAISE NOTICE '[zonas] OK — nivel + ref_id, PK por nivel, 4 triggers, % filas intactas.', _filas;
END $$;

COMMIT;
