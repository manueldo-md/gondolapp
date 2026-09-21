-- ─────────────────────────────────────────────────────────────────────────────
-- misiones.capturada_at — cuándo FUE la visita, no cuándo llegó a la base
--
-- ── POR QUÉ ──────────────────────────────────────────────────────────────────
-- `created_at` es el momento del INSERT. Para una misión capturada sin señal,
-- eso es cuando el gondolero recuperó conexión, que puede ser días después.
--
-- Mientras el único consumidor era el pago daba igual. Deja de dar igual con el
-- dashboard de cobertura de las campañas de seguimiento, que mide por SEMANA:
-- una visita hecha el viernes y sincronizada el lunes cae en la semana
-- siguiente. La semana real queda sin visita y la otra con dos, y el gondolero
-- aparece en rojo por haber trabajado sin señal. Es el mismo castigo tardío que
-- sacamos del vencimiento y de la distancia, esta vez dentro del reporte que la
-- distribuidora usa para juzgarlo.
--
-- El dato YA VIAJA: `registrarMision` recibe `capturadoAt` en el payload, lo usa
-- para el gate de vencimiento y después lo tira. Esto le da dónde guardarse.
--
-- ── POR QUÉ `DEFAULT now()` Y NO NULL ────────────────────────────────────────
-- Hay TRES caminos que insertan misiones y solo uno conoce el momento de
-- captura:
--
--   · registrarMision          → params.capturadoAt (lo escribe explícito)
--   · registrarDescarte        → misión 'descartada', no cuenta como visita
--   · validarComercio (altas)  → la visita fue cuando registró el comercio
--
-- Para una misión registrada online, `now()` ES el momento de la visita: el
-- default no tapa nada, dice la verdad. Y deja la columna sin NULLs, que es lo
-- que permite que el dashboard no tenga que andar cayendo a `created_at`.
--
-- ── EL BACKFILL ──────────────────────────────────────────────────────────────
-- `fotos.timestamp_dispositivo` es la única huella de la captura que existe
-- hoy, y solo para las misiones CON fotos: las de solo preguntas (28 en dev) no
-- tienen ninguna. Para ésas queda `created_at`, que es lo mejor disponible.
--
-- El `LEAST` no es decorativo: `timestamp_dispositivo` lo manda el cliente y el
-- reloj del teléfono puede estar adelantado. Una captura POSTERIOR a su propio
-- INSERT es imposible, así que se recorta. Es la misma guarda que ya tiene
-- `puedeRegistrarMision` en lib/campana-vigencia.ts.
--
-- Idempotente: solo toca las filas que quedaron en NULL.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── SIN default todavía ──────────────────────────────────────────────────────
-- `ADD COLUMN ... DEFAULT now()` **rellena las filas existentes en el acto**
-- (Postgres 11+), así que el backfill de abajo no encontraría un solo NULL y
-- las 207 misiones de dev quedarían "capturadas" el día de la migración. El
-- default se pone DESPUÉS del backfill, cuando ya no puede pisar nada.
-- Lo agarró el bloque de verificación del final en el dry-run.
ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS capturada_at timestamptz;

COMMENT ON COLUMN misiones.capturada_at IS
  'Cuándo el gondolero hizo la visita, no cuándo llegó a la base. Para las misiones de la cola offline difiere de created_at. Es la fecha que usa el dashboard de cobertura.';

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- 1. Las que tienen fotos: el timestamp del dispositivo más viejo de la misión.
UPDATE misiones m
SET capturada_at = LEAST(f.primera, m.created_at)
FROM (
  SELECT mision_id, min(timestamp_dispositivo) AS primera
  FROM fotos
  WHERE mision_id IS NOT NULL AND timestamp_dispositivo IS NOT NULL
  GROUP BY mision_id
) f
WHERE f.mision_id = m.id
  AND m.capturada_at IS NULL;

-- 2. El resto —las de solo preguntas y las altas— con created_at.
UPDATE misiones
SET capturada_at = created_at
WHERE capturada_at IS NULL;

-- ── Recién ahora el default ──────────────────────────────────────────────────
-- Vale solo para las filas NUEVAS. Una misión registrada online se captura y se
-- inserta en el mismo acto, así que `now()` es la verdad y no un relleno.
ALTER TABLE misiones
  ALTER COLUMN capturada_at SET DEFAULT now();

-- ── Verificación ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  _nulos int;
  _futuras int;
BEGIN
  SELECT count(*) INTO _nulos   FROM misiones WHERE capturada_at IS NULL;
  SELECT count(*) INTO _futuras FROM misiones WHERE capturada_at > created_at;

  IF _nulos > 0 THEN
    RAISE EXCEPTION '[capturada_at] quedaron % misiones sin fecha de captura.', _nulos;
  END IF;
  IF _futuras > 0 THEN
    RAISE EXCEPTION '[capturada_at] % misiones dicen haberse capturado DESPUÉS de registrarse.', _futuras;
  END IF;

  RAISE NOTICE '[capturada_at] ok: % misiones, ninguna sin fecha ni con fecha futura.',
    (SELECT count(*) FROM misiones);
END $$;

COMMIT;
