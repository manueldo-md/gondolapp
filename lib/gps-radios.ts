/**
 * lib/gps-radios.ts
 * Los radios de GPS, en un solo lugar.
 *
 * POR QUÉ EXISTE: hasta el 15/9/2026 el tope de bloqueo estaba escrito DOS veces
 * —`RADIO_BLOQUEO_METROS` en captura/actions.ts y `RADIO_BLOQUEO_M` en
 * captura/page.tsx— y la Parte C de la corrección de ubicación iba a necesitar
 * una tercera copia en el panel de la distribuidora.
 *
 * Tres copias de un número que TIENE que coincidir sí o sí. Y el desalineamiento
 * acá no es cosmético: si el panel resuelve reportes con un radio distinto del
 * que usa el bloqueo, un reporte se marcaría como resuelto mientras el gondolero
 * sigue rebotando en la puerta del comercio. La falla sería invisible desde los
 * dos lados.
 *
 * Es el patrón de CLAUDE.md §20, el mismo que ya mordió con comercios_cache, las
 * respuestas de retake y la búsqueda de comercios.
 */

/**
 * Tope duro: más allá de esto la misión no se registra, y es el radio con el que
 * se considera resuelto un reporte de ubicación.
 *
 * No es el mismo número que el aviso blando de 50 m, a propósito: entre 50 y 200
 * el gondolero ve "acercate" y puede seguir, porque un GPS urbano impreciso se va
 * decenas de metros y bloquear eso castiga a gente honesta. Más allá de 200 no
 * hay error de GPS que lo explique.
 *
 * El override por env var existe para poder ajustarlo sin deploy si el piloto
 * muestra que 200 es poco o mucho. Se lee del mismo NEXT_PUBLIC_* en cliente y
 * servidor para que no puedan divergir.
 */
export const RADIO_BLOQUEO_METROS =
  Number(process.env.NEXT_PUBLIC_GPS_BLOQUEO_METROS ?? 200) || 200

/**
 * Radio del aviso blando: dentro de esto el gondolero "está en el lugar".
 * Fuera, ve una advertencia pero puede continuar hasta RADIO_BLOQUEO_METROS.
 */
export const RADIO_AVISO_METROS =
  Number(process.env.NEXT_PUBLIC_GPS_RADIO_METROS ?? 50) || 50
