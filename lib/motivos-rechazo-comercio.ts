/**
 * lib/motivos-rechazo-comercio.ts
 * Los motivos por los que se rechaza el alta de un comercio, y qué le decimos
 * al gondolero que haga con cada uno.
 *
 * ── POR QUÉ TIPIFICADOS Y NO TEXTO LIBRE ────────────────────────────────────
 * Porque **cada motivo lo manda a hacer algo distinto**. El molde del rechazo de
 * foto no sirve tal cual: una foto rechazada se rehace, y el mensaje le dice
 * "podés rehacerla". Un alta duplicada NO se rehace — decirle que lo intente de
 * nuevo lo manda a repetir un trabajo que va a volver a rechazarse.
 *
 * ── POR QUÉ ESTE ARCHIVO ESTÁ SEPARADO ──────────────────────────────────────
 * Lo lee el panel de revisión, que es un componente de CLIENTE, y lo lee
 * `lib/validacion-comercio.ts` para armar la notificación, que es de servidor y
 * levanta el service role. Si la constante viviera allá, el import del cliente
 * arrastraría el módulo entero al bundle del browser. Un archivo sin
 * dependencias es la forma barata de que las dos mitades usen el mismo texto.
 */

export const MOTIVOS_RECHAZO_COMERCIO = [
  'Ya estaba cargado',
  'Datos incorrectos',
  'Mal ubicado en el mapa',
  'No existe o está cerrado',
  'Fuera de la zona de la campaña',
] as const

/**
 * La segunda mitad del mensaje: qué puede hacer ahora.
 *
 * Un motivo tipificado sin esto sigue siendo un "no" sin salida. Con "Ya estaba
 * cargado" el gondolero no perdió la campaña: puede hacer la misión sobre el
 * comercio que ya existe, y eso es lo único que le importa saber.
 *
 * Un motivo escrito a mano ("Otro") no tiene entrada acá y el mensaje se queda
 * solo con el texto del revisor. Es la razón por la que vale la pena que los
 * cinco de arriba cubran los casos frecuentes.
 */
export const QUE_HACER_TRAS_RECHAZO: Record<string, string> = {
  'Ya estaba cargado':
    'Buscalo en la lista de comercios: podés hacer la misión sobre el que ya está cargado.',
  'Datos incorrectos':
    'Revisá el nombre, la dirección y el tipo, y volvé a cargarlo.',
  'Mal ubicado en el mapa':
    'Volvé al comercio y cargalo de nuevo parado en la puerta.',
  'No existe o está cerrado':
    'No hace falta que vuelvas.',
  'Fuera de la zona de la campaña':
    'Fijate en el mapa de la campaña antes de cargar otro de esa zona.',
}
