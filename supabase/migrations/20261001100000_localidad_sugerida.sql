-- ════════════════════════════════════════════════════════════════════════════
-- 20261001100000 — la localidad que el servidor SUGIERE, y que confirma una persona
--
-- ETAPA 3 del tramo "localidad_id en el alta de comercio".
--
-- ── POR QUÉ UNA SUGERENCIA Y NO EL DATO ─────────────────────────────────────
-- Medido el 25/9/2026 contra verdad de referencia —los comercios que tienen
-- localidad asignada desde el CSV del piloto—, el reverse geocoding acierta 8
-- de 12 y **en 1 de 12 devuelve OTRA localidad**: un comercio de Gualeguaychú
-- resolvió a "Larroque".
--
-- Un dato malo que entra como bueno es peor que un hueco, porque el hueco se
-- ve. Un comercio con la localidad equivocada no cae en ninguna bandeja y
-- envenena el corte por provincia, que es para lo que existe todo esto. Por eso
-- el servidor escribe acá y `localidad_id` lo escribe una persona.
--
-- ── TRES COLUMNAS, Y CADA UNA CONTESTA UNA PREGUNTA DISTINTA ────────────────
-- `lib/geocoding.ts` tiene CUATRO salidas y la bandeja necesita otra cosa en
-- cada una, así que una sola columna no alcanza:
--
--   exacto    → hay un id. La bandeja lo precarga y se confirma con un clic.
--   ambiguo   → hay un nombre y varias localidades posibles. La bandeja las
--               muestra: NO se elige por el usuario.
--   fuera     → hay un nombre que el padrón no tiene. Eso es el pedido de alta
--               de localidad, y el texto es lo único que lo hace accionable.
--   sin_dato  → el proveedor no dijo nada. Cascader vacío.
--
--   `_id`      el qué, solo cuando es exacto
--   `_estado`  el cuál de los cuatro, para saber qué mostrar
--   `_texto`   lo que dijo el proveedor, que es lo que salva ambiguo y fuera
--
-- **`_estado IS NULL` significa "todavía no se intentó"**, que no es lo mismo
-- que `'sin_dato'` —se intentó y no dio nada—. Esa diferencia es la que
-- permite reprocesar solo lo que falta sin volver a gastar créditos, y es la
-- razón de que no haga falta una columna de fecha.
--
-- ── LO QUE NO LLEVA, A PROPÓSITO ────────────────────────────────────────────
-- No hay `_at` ni `_proveedor`. Para encontrar lo pendiente alcanza con
-- `_estado IS NULL`, y para reprocesar los que quedaron fuera del padrón
-- cuando alguien cargue la localidad que falta, con `_estado = 'fuera'`.
-- Cambiar de proveedor es un cambio de código que obliga a reprocesar igual.
--
-- ── Y LA SUGERENCIA NO SE BORRA AL CONFIRMAR ────────────────────────────────
-- Cuando una persona escribe `localidad_id`, esto se queda. Comparar las dos
-- columnas es la única forma de saber **con qué frecuencia el geocoding
-- acierta en la vida real**, que es el número que decidiría algún día si puede
-- escribir solo. Borrarla dejaría esa pregunta sin datos para siempre.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS localidad_sugerida_id     integer REFERENCES localidades(id),
  ADD COLUMN IF NOT EXISTS localidad_sugerida_estado text,
  ADD COLUMN IF NOT EXISTS localidad_sugerida_texto  text;

COMMENT ON COLUMN comercios.localidad_sugerida_id IS
  'Sugerencia del reverse geocoding. NO es el dato: lo confirma una persona en la bandeja de pendientes y recién ahí se escribe localidad_id. Ver lib/geocoding.ts.';
COMMENT ON COLUMN comercios.localidad_sugerida_estado IS
  'exacto | ambiguo | fuera | sin_dato | error. NULL = todavía no se intentó, que NO es lo mismo que sin_dato.';
COMMENT ON COLUMN comercios.localidad_sugerida_texto IS
  'El nombre que devolvió el proveedor. En estado=fuera es el pedido de alta de localidad: lo único que lo hace accionable.';

-- ── Los dos invariantes, en la base y no en el código ───────────────────────
-- El primero es el que importa: un id de sugerencia con estado 'ambiguo' sería
-- exactamente la decisión que este tramo NO quiere que tome una máquina.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercios_localidad_sugerida_estado_check') THEN
    ALTER TABLE comercios ADD CONSTRAINT comercios_localidad_sugerida_estado_check
      CHECK (localidad_sugerida_estado IS NULL
             OR localidad_sugerida_estado IN ('exacto','ambiguo','fuera','sin_dato','error'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comercios_sugerencia_solo_si_exacto') THEN
    -- `IS NOT DISTINCT FROM` y no `=`: con `=`, un id escrito mientras el
    -- estado está en NULL da `NULL OR NULL` → NULL, **y un CHECK que evalúa a
    -- NULL PASA**. O sea que la versión obvia dejaba entrar una sugerencia sin
    -- procedencia, justo el medio-estado que esto viene a impedir.
    --
    -- Es la misma lógica de tres valores que ya mordió con los `.neq()` de
    -- PostgREST sobre `comercios.estado`. Lo encontró el dry-run, no la lectura.
    ALTER TABLE comercios ADD CONSTRAINT comercios_sugerencia_solo_si_exacto
      CHECK (localidad_sugerida_id IS NULL
             OR localidad_sugerida_estado IS NOT DISTINCT FROM 'exacto');
  END IF;
END $$;

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING: el 22/9/2026 un bloque emitía un WARNING y dos
-- líneas después un 'OK' sin condición, así que decía OK sobre un DROP que no
-- se había aplicado. Acá el OK es inalcanzable si algo falló.
DO $$
DECLARE
  _cols integer; _chk integer; _com integer; _conloc integer;
BEGIN
  -- 1. Están las tres.
  SELECT count(*) INTO _cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'comercios'
     AND column_name IN ('localidad_sugerida_id','localidad_sugerida_estado','localidad_sugerida_texto');
  IF _cols <> 3 THEN
    RAISE EXCEPTION '[sugerida] Se crearon % de 3 columnas.', _cols;
  END IF;

  -- 2. Y los dos CHECK.
  SELECT count(*) INTO _chk FROM pg_constraint
   WHERE conname IN ('comercios_localidad_sugerida_estado_check','comercios_sugerencia_solo_si_exacto');
  IF _chk <> 2 THEN
    RAISE EXCEPTION '[sugerida] Faltan constraints: hay % de 2.', _chk;
  END IF;

  -- 3. LA OTRA DIRECCIÓN: no se tocó ni una fila existente. Una migración que
  --    solo verifica lo que agregó deja pasar el daño colateral.
  SELECT count(*) INTO _com FROM comercios;
  SELECT count(*) INTO _conloc FROM comercios WHERE localidad_id IS NOT NULL;
  IF _com = 0 THEN
    RAISE EXCEPTION '[sugerida] No hay comercios. Algo se llevó puesto.';
  END IF;
  IF EXISTS (SELECT 1 FROM comercios WHERE localidad_sugerida_estado IS NOT NULL) THEN
    RAISE EXCEPTION '[sugerida] Alguna fila nació con estado. Tenían que quedar todas en NULL.';
  END IF;

  RAISE NOTICE '[sugerida] OK — 3 columnas, 2 checks, % comercios intactos (% con localidad).', _com, _conloc;
END $$;

COMMIT;
