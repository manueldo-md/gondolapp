/**
 * Formato del código personal de gondoleros y fixers.
 *
 * La GENERACIÓN vive en un solo lugar y no es este: es la función SQL
 * `generar_codigo_gondolero()` (migración 20260916180000), a la que llaman el
 * trigger `handle_new_user()` al registrarse y el backfill del panel admin.
 * Antes había tres generadores en SQL más uno en TypeScript, todos con reglas
 * distintas, y ninguno chequeaba colisiones contra la columna UNIQUE.
 *
 * Lo que vive acá es solo el RECONOCIMIENTO del formato, para las pantallas: el
 * ejemplo del placeholder y el conteo de perfiles con código viejo o sin código.
 * Si alguna vez cambia el formato en SQL, este archivo tiene que cambiar con él.
 *
 * GND-NNNN-NNNN con dígitos 2-9. Sin letras en la parte variable y sin 0 ni 1
 * porque el código se dicta por teléfono (hay un botón de WhatsApp en el perfil
 * del gondolero) y en castellano be/de/pe/te/ve/e riman entre sí.
 */
export const FORMATO_CODIGO_GONDOLERO = /^GND-[2-9]{4}-[2-9]{4}$/

/** Ejemplo válido, para placeholders. No es un código real. */
export const EJEMPLO_CODIGO_GONDOLERO = 'GND-4728-5936'

/**
 * `false` para los códigos del formato viejo (GOND-4054, FIXE-8990) y para los
 * que faltan. Son exactamente los que levanta el backfill.
 */
export function tieneCodigoVigente(codigo: string | null | undefined): boolean {
  if (!codigo) return false
  return FORMATO_CODIGO_GONDOLERO.test(codigo)
}
