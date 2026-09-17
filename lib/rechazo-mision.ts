/**
 * lib/rechazo-mision.ts
 * Por qué el servidor rechazó una misión, en un código y no en un texto.
 *
 * ── POR QUÉ UN CÓDIGO ───────────────────────────────────────────────────────
 * `ResultadoMision` devolvía solo `{ ok: false, motivo: string }`. La cola
 * offline, que tiene que decidir si ofrecer el botón "Reintentar", no tenía con
 * qué: mostraba los dos botones siempre. Con una campaña vencida, Reintentar
 * vuelve a subir todas las fotos para recibir el mismo rechazo, y el gondolero
 * queda en un bucle con su trabajo adentro.
 *
 * La alternativa era que el cliente mirara el texto del motivo. No se hizo por
 * la razón de siempre: **la regla quedaría escrita dos veces y una de las dos
 * se rompería en silencio**. Alguien mejora el mensaje —"Esta campaña terminó
 * el 30/04" pasa a "Esta campaña ya cerró"— y el botón de Reintentar reaparece
 * donde no debe, sin que nada falle visiblemente ni ningún test se ponga rojo.
 * Se descubre tres semanas después, cuando un gondolero reporta que reintentó
 * quince veces.
 *
 * Este archivo no importa nada: lo usan el Server Action y la cola del cliente.
 */

export type CodigoRechazoMision =
  /** La campaña no existe (borrada, o id inventado). */
  | 'campana_inexistente'
  /** `campanas.estado` no es 'activa' — pausada, cerrada, cancelada. */
  | 'campana_no_activa'
  /** `fecha_fin` ya pasó al momento de la captura. */
  | 'campana_vencida'
  /** La captura quedó sin enviar más que el TTL de la cola. */
  | 'captura_muy_vieja'
  /** Ya tiene el máximo de comercios propios en esta campaña. */
  | 'cupo_propio_lleno'
  /** Envío EN VIVO fuera del radio. Desde la cola no se rechaza, se marca. */
  | 'fuera_de_radio'
  /** Otro gondolero registró una misión viva sobre ese par (campaña, comercio). */
  | 'comercio_duplicado'

/**
 * ¿Reintentar este rechazo puede terminar distinto alguna vez?
 *
 * Definitivo = no. La campaña no va a volver a existir, la fecha no va a
 * retroceder y el comercio que otro tomó no se libera. Ofrecer "Reintentar" ahí
 * es prometer algo que no puede pasar.
 *
 * Los dos que NO son definitivos, y por qué:
 *
 *   · `cupo_propio_lleno` — si descarta otra misión de la misma campaña se
 *     libera un lugar y el reintento entra. Es el único caso donde el gondolero
 *     tiene una acción que cambia el resultado.
 *   · `fuera_de_radio` — solo se rechaza en el envío EN VIVO; desde la cola la
 *     misión entra marcada. O sea que nunca llega a la cola con este código, y
 *     si llegara, moverse unos metros lo resuelve.
 *
 * **`undefined` devuelve `false` a propósito.** Las entradas que ya están
 * rechazadas en el IDB de alguien —guardadas antes de que existiera el código—
 * no lo tienen. Ante la duda se muestran los dos botones, que es el
 * comportamiento de siempre: esconder "Reintentar" por un campo ausente le
 * sacaría la única salida a alguien cuyo rechazo sí era transitorio.
 */
export function rechazoEsDefinitivo(
  codigo: CodigoRechazoMision | null | undefined,
): boolean {
  switch (codigo) {
    case 'campana_inexistente':
    case 'campana_no_activa':
    case 'campana_vencida':
    case 'captura_muy_vieja':
    case 'comercio_duplicado':
      return true
    case 'cupo_propio_lleno':
    case 'fuera_de_radio':
      return false
    default:
      return false
  }
}
