/**
 * lib/error-infra.ts
 * Traduce un error de infraestructura a algo que el gondolero pueda leer.
 *
 * QUÉ PROBLEMA RESUELVE: cuando un Server Action lanza una excepción, Next.js
 * **redacta el mensaje en producción** y al cliente le llega
 *
 *   "An error occurred in the Server Components render. The specific message is
 *    omitted in production builds to avoid leaking sensitive details."
 *
 * Si eso se muestra tal cual, el gondolero ve un párrafo en inglés sobre
 * componentes de servidor después de sacar cinco fotos. Y peor: en la cola
 * offline ese texto se guarda como motivo de rechazo y tiene que decidir entre
 * Reintentar y Descartar leyéndolo.
 *
 * Los rechazos de NEGOCIO ya no pasan por acá — desde el 17/9/2026
 * `registrarMision` los devuelve en vez de lanzarlos, y un valor devuelto no se
 * redacta. Lo que llega acá es infraestructura de verdad: un 500, un timeout, un
 * deploy en el medio. O sea algo transitorio, y el mensaje lo dice.
 */

/** Lo que Next pone en lugar del mensaje real en producción. */
const REDACCION_NEXT = 'An error occurred in the Server Components render'

/**
 * `guardadaEnCola` cambia la promesa del mensaje: si la misión está en IDB se
 * reintenta sola, y decirlo evita que el gondolero rehaga un trabajo que no
 * perdió. Si no está, el trabajo sí se perdió y hay que pedirle que reintente.
 */
export function mensajeErrorInfra(mensajeCrudo: string, guardadaEnCola: boolean): string {
  const esRedaccionNext = mensajeCrudo.includes(REDACCION_NEXT)
  const esJsonInfra     = mensajeCrudo.startsWith('{') || mensajeCrudo.startsWith('[')
  const esIlegible      = esRedaccionNext || esJsonInfra || mensajeCrudo.trim() === ''

  if (guardadaEnCola) {
    return esIlegible
      ? 'Hubo un problema al enviar. Tu misión quedó guardada y se va a reintentar sola.'
      : `${mensajeCrudo} Tu misión quedó guardada y se va a reintentar sola.`
  }
  return esIlegible
    ? 'Hubo un problema al enviar la misión. Revisá tu conexión e intentá de nuevo.'
    : mensajeCrudo
}
