-- ════════════════════════════════════════════════════════════════════════════
-- 20261003100000 — un crédito por foto, y que lo diga la base
--
-- Punto 5 de la sesión de seguridad, segunda mitad.
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────
-- Nada impedía pagar dos veces la misma foto. El filtro de estado que se puso
-- el 25/9/2026 cierra la reaprobación directa, pero **no la puerta de al lado**:
-- el admin puede mandar una foto de 'aprobada' a 'rechazada' o a 'pendiente' y
-- volver a aprobarla, y `rechazarFotoAdmin` NO revierte el movimiento — solo
-- pone `puntos_otorgados: 0`, que es un número de pantalla.
--
-- Eso no lo cierra ningún filtro del lado del código, porque el camino es
-- legítimo: corregir un rechazo equivocado es trabajo de admin. Lo cierra el
-- invariante, y el invariante vive acá.
--
-- ── LA CLAVE ES (foto_id, tipo), NO foto_id SOLO ────────────────────────────
-- Hoy ningún débito lleva `foto_id` —verificado: 0 en las dos bases— pero si
-- algún día se revierte un crédito con un débito, la clave más angosta lo
-- bloquearía. Con `tipo` adentro, la reversión entra y el segundo crédito no.
--
-- ── Y ES PARCIAL, CON EL WHERE EXPLÍCITO ────────────────────────────────────
-- Postgres ya trata los NULL como distintos, así que las filas sin `foto_id`
-- no colisionarían igual. El `WHERE` va de todos modos por dos razones: dice
-- la intención sin que haya que saberse la regla de los NULL, y mantiene el
-- índice chico — al 25/9/2026 **44 de 44 movimientos en dev y 24 de 25 en
-- producción tienen `foto_id` en NULL**, porque el camino principal de pago
-- (`aprobarMisionCore`) acredita por misión y escribe `campana_id`.
--
-- Eso último importa para no sobrevender lo que esto hace: **el índice guarda
-- el camino chico.** En el camino grande el invariante ya existe y es de
-- estado — `aprobarMisionCore` filtra por `bounty_estado = 'retenido'`, así que
-- la segunda pasada paga 0.
--
-- ── NO VA SOLO ──────────────────────────────────────────────────────────────
-- Los seis inserts de crédito por foto NO chequeaban `.error`. Con el índice
-- puesto y sin el chequeo, el duplicado deja de pagar dos veces y pasa a **no
-- pagar nada, en silencio**: un bug mudo por otro, y el segundo es peor.
-- El chequeo vive en `lib/credito-foto.ts` y entra en el mismo deploy.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PRECONDICIÓN ────────────────────────────────────────────────────────────
-- Un índice único es una afirmación sobre TODOS los datos. Si los de hoy ya la
-- violan, la creación falla con un mensaje de Postgres que no dice cuáles son.
-- Esto lo dice antes, y nombra las filas.
DO $$
DECLARE
  _dups integer;
  _detalle text;
BEGIN
  SELECT count(*) INTO _dups FROM (
    SELECT foto_id, tipo FROM movimientos_puntos
     WHERE foto_id IS NOT NULL
     GROUP BY foto_id, tipo HAVING count(*) > 1
  ) x;

  IF _dups > 0 THEN
    SELECT string_agg(format('%s (%s×%s)', foto_id, n, tipo), ', ')
      INTO _detalle
      FROM (
        SELECT foto_id, tipo, count(*) n FROM movimientos_puntos
         WHERE foto_id IS NOT NULL
         GROUP BY foto_id, tipo HAVING count(*) > 1
      ) y;
    RAISE EXCEPTION
      '[credito-unico] Hay % par(es) (foto_id, tipo) con más de un movimiento. '
      'Resolver a mano cuál sobra ANTES de crear el índice: %', _dups, _detalle;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_puntos_credito_unico_por_foto
  ON movimientos_puntos (foto_id, tipo)
  WHERE foto_id IS NOT NULL;

COMMENT ON INDEX movimientos_puntos_credito_unico_por_foto IS
  'Una foto no se paga dos veces. La clave lleva `tipo` para que una reversión con débito siga siendo posible. Ver lib/credito-foto.ts, que traduce el 23505 a "ya estaba pago".';

-- ── VERIFICACIÓN, EN LAS DOS DIRECCIONES ────────────────────────────────────
-- Con EXCEPTION y no WARNING, y con el OK inalcanzable si algo falló: el
-- 22/9/2026 un bloque emitía un WARNING y dos líneas después un 'OK' sin
-- condición, así que decía OK sobre un DROP que no se había aplicado.
DO $$
DECLARE
  _idx integer; _movs integer; _conFoto integer; _creditos integer;
BEGIN
  -- 1. Está, y es único y parcial. Que exista un índice con ese nombre no
  --    prueba que sea el que se quiso crear.
  SELECT count(*) INTO _idx FROM pg_indexes
   WHERE tablename = 'movimientos_puntos'
     AND indexname = 'movimientos_puntos_credito_unico_por_foto'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ILIKE '%foto_id%'
     AND indexdef ILIKE '%tipo%'
     AND indexdef ILIKE '%WHERE%';
  IF _idx <> 1 THEN
    RAISE EXCEPTION '[credito-unico] El índice no quedó como se esperaba (encontrados: %).', _idx;
  END IF;

  -- 2. LA OTRA DIRECCIÓN: no se tocó ni una fila. Una migración que solo
  --    verifica lo que agregó deja pasar el daño colateral.
  SELECT count(*) INTO _movs     FROM movimientos_puntos;
  SELECT count(*) INTO _conFoto  FROM movimientos_puntos WHERE foto_id IS NOT NULL;
  SELECT count(*) INTO _creditos FROM movimientos_puntos WHERE tipo = 'credito';
  IF _movs = 0 THEN
    RAISE EXCEPTION '[credito-unico] No quedaron movimientos. Algo se llevó puesto.';
  END IF;

  RAISE NOTICE '[credito-unico] OK — índice creado · % movimientos intactos (% con foto_id, % créditos).',
    _movs, _conFoto, _creditos;
END $$;

COMMIT;
