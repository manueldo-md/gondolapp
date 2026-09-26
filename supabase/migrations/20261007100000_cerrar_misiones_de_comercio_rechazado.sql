-- ════════════════════════════════════════════════════════════════════════════
-- 20261007100000 — cerrar las misiones cuyo comercio se rechazó, SIN tocar la plata
--
-- ── LA FILA QUE ESTO ARREGLA ────────────────────────────────────────────────
-- Medido el 26/9/2026. En producción, una sola:
--
--   misión   estado 'aprobada'    bounty 'acreditado'   200 pts
--   foto     estado 'rechazada'   bounty 'anulado'      "Mal ubicado en el mapa"
--
-- La secuencia, por los timestamps: el comercio se validó, la misión se aprobó
-- y los 200 puntos se pagaron el 17/9 a las 11:17. A las 15:58 del MISMO día
-- alguien rechazó el comercio; la foto se anuló y la misión no se tocó, porque
-- `rechazarComercio` llevaba un `.neq('estado','aprobada')` sin comentario.
--
-- En dev: cero filas. El comercio rechazado de prod es el único de las dos bases.
--
-- ── QUÉ SE HACE, Y QUÉ NO ───────────────────────────────────────────────────
-- Se cierra la misión (`estado = 'descartada'`) y **el bounty no se toca**.
--
-- No se revierte el pago, y es una decisión tomada, no una omisión: **el
-- gondolero no hizo nada mal**. Le pagamos y después rechazamos el comercio.
-- Además la plata ya está en el saldo y puede estar canjeada, así que revertir
-- exigiría un tipo `debito` que hoy no existe y podría dejarlo en negativo.
--
-- Ponerle `bounty_estado = 'anulado'` sería peor que no hacer nada: diría que
-- no se pagó, y se pagó.
--
-- ── POR QUÉ `descartada` + `acreditado` Y NO UN ESTADO PROPIO ───────────────
-- Un estado nuevo se lee mejor en la fila y **falla ABIERTO en quince
-- lectores**: los tres `panel_*` (6 filtros SQL) contarían el comercio
-- rechazado como cobertura, el índice `misiones_campana_comercio_uniq` lo
-- bloquearía para siempre, la guarda de `actualizarEstadoMision` lo reabriría
-- y volvería a pagar, y `captura/page.tsx` volvería a pedir fotos. Todos están
-- escritos como "todo menos descartada", así que el modo de falla del olvido
-- es INCLUIR. La medición completa está en CLAUDE.md.
--
-- La combinación no la lee mal nadie: los tres caminos de pago exigen
-- `estado = 'aprobada'`, y ésta no entra en ninguno.
--
-- ── VA DESPUÉS DEL DEPLOY ───────────────────────────────────────────────────
-- El código nuevo cierra estas misiones solo. Esta migración arregla la fila
-- que quedó de antes, así que el orden no la afecta — pero el commit trae
-- además la guarda de idempotencia nueva en `validarComercioYCrearMision`, y
-- **sin ella cerrar la misión abriría un segundo pago**: al dejar de haber
-- misión viva, revalidar el comercio crearía otra y pagaría de nuevo.
--
--     deploy (la guarda mira "ya se pagó") → esta migración
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  _afectadas   integer;
  _puntos      integer;
  _mov_antes   integer;
  _mov_desp    integer;
  _saldo_antes bigint;
  _saldo_desp  bigint;
BEGIN
  SELECT count(*), coalesce(sum(coalesce(m.puntos_total, 0)), 0)
    INTO _afectadas, _puntos
    FROM misiones m JOIN comercios co ON co.id = m.comercio_id
   WHERE co.estado = 'rechazado'
     AND m.estado IS DISTINCT FROM 'descartada';

  IF _afectadas = 0 THEN
    RAISE NOTICE '[comercio rechazado] No hay misiones abiertas de comercios rechazados. Sin cambios.';
  ELSE
    -- La contabilidad, ANTES. Es lo que esta migración promete no tocar.
    SELECT count(*), coalesce(sum(monto), 0) INTO _mov_antes, _saldo_antes
      FROM movimientos_puntos;

    UPDATE misiones m
       SET estado = 'descartada'
      FROM comercios co
     WHERE co.id = m.comercio_id
       AND co.estado = 'rechazado'
       AND m.estado IS DISTINCT FROM 'descartada';

    -- ── LA OTRA DIRECCIÓN: no se movió un peso ──────────────────────────────
    -- Es LA verificación de esta migración. Todo lo demás es contabilidad de
    -- estados; esto es la plata, y es lo único que no se puede deshacer.
    SELECT count(*), coalesce(sum(monto), 0) INTO _mov_desp, _saldo_desp
      FROM movimientos_puntos;

    IF _mov_desp <> _mov_antes THEN
      RAISE EXCEPTION '[comercio rechazado] Cambió la cantidad de movimientos: % → %.',
        _mov_antes, _mov_desp;
    END IF;
    IF _saldo_desp <> _saldo_antes THEN
      RAISE EXCEPTION '[comercio rechazado] Cambió el total de puntos movidos: % → %.',
        _saldo_antes, _saldo_desp;
    END IF;

    RAISE NOTICE '[comercio rechazado] % misión(es) cerradas, % pts que siguen acreditados. Contabilidad intacta: % movimientos.',
      _afectadas, _puntos, _mov_desp;
  END IF;
END $$;

-- ── Que la combinación se pueda LEER desde la base ──────────────────────────
-- Un estado propio habría dicho solo lo que pasó; la combinación hay que ir a
-- deducirla. Esto es lo que compensa: cualquiera que haga `\d+ misiones` —o
-- mire information_schema— encuentra la explicación al lado de la columna, sin
-- tener que dar con el commit.
COMMENT ON COLUMN misiones.bounty_estado IS
  'acreditado | retenido | anulado. OJO con la combinación estado=''descartada'' + '
  'bounty_estado=''acreditado'': NO es una inconsistencia. Es una misión que se '
  'pagó y cuyo comercio se rechazó DESPUÉS (ver rechazarComercio en '
  'lib/validacion-comercio.ts). El pago no se revierte — el gondolero no hizo '
  'nada mal — y la misión se cierra para que no cuente como cobertura ni ocupe '
  'el comercio. No se paga dos veces: la guarda de validarComercioYCrearMision '
  'mira si ya hay un bounty acreditado, no si hay una misión viva.';

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló.
DO $$
DECLARE
  _abiertas integer;
  _pagadas  integer;
BEGIN
  -- 1. No quedó ninguna misión abierta de un comercio rechazado.
  SELECT count(*) INTO _abiertas
    FROM misiones m JOIN comercios co ON co.id = m.comercio_id
   WHERE co.estado = 'rechazado' AND m.estado IS DISTINCT FROM 'descartada';

  IF _abiertas > 0 THEN
    RAISE EXCEPTION '[comercio rechazado] Quedaron % misiones abiertas.', _abiertas;
  END IF;

  -- 2. LA OTRA DIRECCIÓN, y es la que importa: el bounty de las que YA se
  --    habían pagado sigue diciendo 'acreditado'. Si esta migración hubiera
  --    arrastrado el `bounty_estado = 'anulado'` del camino normal, acá daría
  --    cero y la fila estaría diciendo que nunca se pagó.
  SELECT count(*) INTO _pagadas
    FROM misiones m JOIN comercios co ON co.id = m.comercio_id
   WHERE co.estado = 'rechazado' AND m.bounty_estado = 'acreditado';

  -- 3. Y el comentario quedó puesto, que es la mitad legible de la decisión.
  IF col_description('public.misiones'::regclass,
       (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.misiones'::regclass AND attname = 'bounty_estado')) IS NULL THEN
    RAISE EXCEPTION '[comercio rechazado] Falta el COMMENT en misiones.bounty_estado.';
  END IF;

  RAISE NOTICE '[comercio rechazado] OK — 0 misiones abiertas, % siguen acreditadas, comentario puesto.',
    _pagadas;
END $$;

COMMIT;
