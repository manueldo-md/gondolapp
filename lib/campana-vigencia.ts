/**
 * lib/campana-vigencia.ts
 * Si una campaña venció, derivado.
 *
 * DERIVADO, NO GUARDADO — la misma decisión que lib/campana-avance.ts, por el
 * mismo motivo. Una campaña cuya `fecha_fin` ya pasó ES vencida: escribir
 * `estado='cerrada'` no agrega información, agrega una copia del dato que hay
 * que mantener sincronizada. Y el precedente está a la vista en esta base:
 * `comercios_relevados` se guardó, se desincronizó y tuvo una alerta rota
 * durante meses.
 *
 * Se evaluaron las tres formas de cerrar automáticamente y se descartaron:
 *
 *   · Al registrar misión — solo dispara si alguien trabaja, y las vencidas son
 *     justamente las que no tienen actividad.
 *   · Al leer — escribir en un GET. Con Server Components las lecturas son
 *     constantes: serían N campañas × M paneles de escrituras.
 *   · pg_cron — correcto, pero es una dependencia operativa nueva (el proyecto
 *     no usa ninguno) y un cron que falla es invisible.
 *
 * Y con el gate de registrarMision puesto, la regla de negocio ya está cubierta:
 * las misiones se rechazan por fecha, cierre o no cierre. Lo que quedaba del
 * auto-cierre era cosmética.
 *
 * `campanas.estado` queda para lo ADMINISTRATIVO: borrador, activa, pausada,
 * cerrada a mano, cancelada. La vigencia es otra dimensión y no se mezcla.
 */

/** Campañas de seguimiento no vencen: no tienen fecha_fin por definición. */
export function estaVencida(
  fechaFin: string | null | undefined,
  referencia: Date = new Date(),
): boolean {
  if (!fechaFin) return false
  return diaDe(referencia) > fechaFin
}

/**
 * Días de gracia para las misiones que llegan de la cola offline.
 *
 * El gate juzga por el momento de CAPTURA, no por el de llegada — un gondolero
 * que capturó el último día válido y sincronizó dos días después hizo el trabajo
 * en plazo. Pero el timestamp de captura lo manda el cliente, y con una campaña
 * vencida el incentivo para falsearlo es directo: plata.
 *
 * El tope es el TTL de la cola (lib/mision-queue.ts borra a los 7 días): una
 * misión legítima nunca puede haber esperado más que eso, así que un timestamp
 * de abril no sirve para revivir nada.
 */
export const DIAS_GRACIA_COLA = 7

/**
 * ¿Se puede registrar una misión para esta campaña?
 *
 * `capturadoAt` es cuándo el gondolero hizo el trabajo (epoch ms). Para envíos
 * en vivo es ahora; para los de la cola, el momento en que se guardó en IDB.
 */
export function puedeRegistrarMision(params: {
  fechaFin: string | null | undefined
  capturadoAt: number | null | undefined
  ahora?: Date
}): { ok: true } | { ok: false; motivo: 'vencida' | 'captura_muy_vieja' } {
  const { fechaFin } = params
  if (!fechaFin) return { ok: true }   // sin fecha no vence (seguimiento, o legacy sin migrar)

  const ahora = params.ahora ?? new Date()

  // Sin timestamp de captura confiable se juzga por el momento actual. Es el
  // caso de un payload viejo que todavía no manda capturadoAt.
  const capturadoAt = typeof params.capturadoAt === 'number' && Number.isFinite(params.capturadoAt)
    ? new Date(params.capturadoAt)
    : ahora

  // Tope anti-falseo: no se acepta reclamar una captura más vieja que el TTL de
  // la cola, aunque caiga dentro del plazo de la campaña.
  const diasDesdeCaptura = Math.floor((ahora.getTime() - capturadoAt.getTime()) / 86_400_000)
  if (diasDesdeCaptura > DIAS_GRACIA_COLA) {
    return { ok: false, motivo: 'captura_muy_vieja' }
  }

  // Un capturadoAt en el futuro no da ventaja: se juzga con el menor de los dos.
  const referencia = capturadoAt.getTime() > ahora.getTime() ? ahora : capturadoAt

  if (diaDe(referencia) > fechaFin) return { ok: false, motivo: 'vencida' }
  return { ok: true }
}

/** `fecha_fin` es una columna `date`, así que se compara YYYY-MM-DD como texto. */
function diaDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
