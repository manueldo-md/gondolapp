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
 *
 * ── EL DÍA ES EL ARGENTINO, NO EL DEL SERVIDOR ──────────────────────────────
 * Vercel corre en UTC y Argentina es UTC−3. Hasta el 22/9/2026 el `diaDe()` de
 * este archivo armaba la fecha con `getFullYear/getMonth/getDate`, o sea la hora
 * local del PROCESO: entre las 21:00 y la medianoche argentina el servidor ya
 * estaba en el día siguiente.
 *
 * Efecto concreto: una campaña con `fecha_fin = 30` dejaba de aceptar misiones
 * **a las 21:00 del 29** hora argentina. El gondolero que relevaba a las 22:00
 * del 29 veía su misión rechazada por vencimiento un día antes de lo que dice la
 * campaña, y eso es plata que no cobra por trabajo hecho en plazo.
 *
 * El cambio solo puede DEVOLVER esas tres horas, nunca quitarlas: Argentina va
 * atrás de UTC, así que `diaAR(hoy) ≤ diaUTC(hoy)` siempre, y el gate
 * `dia > fechaFin` se vuelve menos frecuente, nunca más. Es una garantía de la
 * aritmética, no una observación sobre los datos de hoy.
 */

import { diaAR } from '@/lib/fecha-ar'

/** Campañas de seguimiento no vencen: no tienen fecha_fin por definición. */
export function estaVencida(
  fechaFin: string | null | undefined,
  referencia: Date = new Date(),
): boolean {
  if (!fechaFin) return false
  return diaAR(referencia) > fechaFin
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

  if (diaAR(referencia) > fechaFin) return { ok: false, motivo: 'vencida' }
  return { ok: true }
}

/**
 * ¿Cerró la inscripción?
 *
 * `fecha_limite_inscripcion` es una columna `date` y es INCLUSIVA, igual que
 * `fecha_fin`: el último día vale entero.
 *
 * Las dos pantallas que lo chequeaban hacían `new Date(limite) < new Date()`, y
 * eso es peor que el corrimiento de tres horas del resto del archivo:
 * `new Date('2026-09-30')` se parsea como medianoche **UTC**, así que la
 * inscripción cerraba a las 21:00 del 29 hora argentina — **27 horas antes** de
 * lo que dice la fecha. Acá también el cambio solo abre, nunca cierra antes.
 *
 * Vive en este archivo y no en cada pantalla porque estaba escrito dos veces y
 * las dos tenían el mismo error.
 */
export function inscripcionCerrada(
  fechaLimite: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!fechaLimite) return false
  return diaAR(ahora) > fechaLimite.slice(0, 10)
}

// ── Cuánto falta, y cómo se dice ──────────────────────────────────────────────

/**
 * Días calendario hasta `fechaFin`. **Puede ser negativo**: -140 es una campaña
 * que terminó hace 140 días.
 *
 * Reemplaza al `Math.max(0, …)` de `diasRestantes`, que aplastaba a 0 cualquier
 * fecha pasada. Con ese clamp, las 17 pantallas que lo leían mostraban "Último
 * día" / "Hoy" / "vence en 0 días" para una campaña vencida en abril, y varias
 * la pintaban de rojo urgente. El dato estaba mal en la función, no en cada
 * pantalla.
 *
 * Compara DÍAS CALENDARIO ARGENTINOS, no milisegundos, y es el mismo criterio
 * que `estaVencida` acá arriba. Antes mezclaba `new Date('2026-04-30')`
 * —medianoche UTC— con `new Date(hoy.getFullYear(), …)` —hora local del
 * proceso—, y esa mezcla corría el límite tres horas: el último día empezaba a
 * las 21:00 del anterior.
 */
export function diasHastaFin(
  fechaFin: string,
  ahora: Date = new Date(),
): number {
  // Los dos lados son ETIQUETAS DE DÍA, no instantes: se convierten a
  // medianoche UTC solo para poder restarlas. Construirlos con `new Date(y, m, d)`
  // —hora local del proceso— era lo que metía la zona horaria en una cuenta que
  // no la necesita.
  const fin = Date.parse(`${fechaFin.slice(0, 10)}T00:00:00.000Z`)
  const hoy = Date.parse(`${diaAR(ahora)}T00:00:00.000Z`)
  if (!Number.isFinite(fin) || !Number.isFinite(hoy)) return 0
  return Math.round((fin - hoy) / 86_400_000)
}

export interface EtiquetaVigencia {
  /** Texto listo para mostrar. */
  texto: string
  vencida: boolean
  /** Días calendario hasta el fin. Negativo si ya terminó. */
  dias: number
}

/**
 * El texto de vigencia de una campaña, en un solo lugar.
 *
 * La condición `dias === 0 ? 'Último día' : …` estaba copiada en cinco archivos
 * y ninguna de las copias contemplaba una fecha pasada — con el clamp a 0, una
 * campaña de abril decía "Último día" en septiembre. Que el texto salga de acá
 * es lo que impide que la sexta copia vuelva a olvidarse del caso.
 *
 * `corto` es para los chips donde no entra una frase: "140d" en vez de "Terminada
 * hace 140 días".
 */
export function etiquetaVigencia(
  fechaFin: string | null | undefined,
  opciones: { corto?: boolean; ahora?: Date } = {},
): EtiquetaVigencia | null {
  if (!fechaFin) return null
  const dias = diasHastaFin(fechaFin, opciones.ahora)
  const corto = opciones.corto ?? false

  if (dias < 0) {
    const d = Math.abs(dias)
    return {
      vencida: true,
      dias,
      texto: corto
        ? 'Terminada'
        : d === 1 ? 'Terminada ayer' : `Terminada hace ${d} días`,
    }
  }
  if (dias === 0) return { vencida: false, dias, texto: 'Último día' }
  if (corto)      return { vencida: false, dias, texto: `${dias}d` }
  return { vencida: false, dias, texto: dias === 1 ? '1 día' : `${dias} días` }
}
