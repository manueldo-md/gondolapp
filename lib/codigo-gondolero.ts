/**
 * Formato del código personal de gondoleros y fixers.
 *
 * La GENERACIÓN vive en un solo lugar y no es este: es la función SQL
 * `generar_codigo_gondolero(_tipo)` (migraciones 20260916180000 y
 * 20260923100000), a la que llaman el trigger `handle_new_user()` al
 * registrarse, el trigger `profiles_sincronizar_codigo()` al cambiar el tipo, y
 * el backfill del panel admin. Antes había tres generadores en SQL más uno en
 * TypeScript, todos con reglas distintas, y ninguno chequeaba colisiones contra
 * la columna UNIQUE.
 *
 * Lo que vive acá es el RECONOCIMIENTO del formato y la NORMALIZACIÓN de lo que
 * alguien tipea.
 *
 * ── EL FORMATO ESTÁ ESCRITO DOS VECES, EN DOS LENGUAJES ─────────────────────
 * El regex de abajo y el de `backfill_codigos_gondolero()` describen lo mismo.
 * **Si cambia uno, cambia el otro**, y el modo de falla no es que algo explote:
 * es que el contador de "códigos pendientes" de /admin/usuarios nunca llegue a
 * cero mientras el botón "Asignar códigos" dice que ya está todo. El COMMENT de
 * la función SQL apunta a este archivo para que quien lea desde la base también
 * lo vea.
 *
 * ── DOS PREFIJOS, Y POR QUÉ ─────────────────────────────────────────────────
 * Hasta el 23/9/2026 el prefijo era `GND` para los dos. El argumento era que las
 * tres búsquedas por código filtran por `tipo_actor` y no por prefijo, y era
 * cierto: el prefijo no discriminaba nada en el código. Pero discrimina para la
 * PERSONA — el código se dicta por teléfono, y la distribuidora que lo anota no
 * tenía forma de saber si está invitando a un gondolero o a un fixer, que no
 * hacen lo mismo.
 *
 * `GND-NNNN-NNNN` y `FXR-NNNN-NNNN`, con dígitos 2-9. Sin letras en la parte
 * variable y sin 0 ni 1 porque el código se dicta en voz alta y en castellano
 * be/de/pe/te/ve/e riman entre sí.
 */

/** Los tipos de actor que llevan código. Las empresas no tienen. */
export type TipoConCodigo = 'gondolero' | 'fixer'

export const PREFIJO_CODIGO: Record<TipoConCodigo, string> = {
  gondolero: 'GND',
  fixer:     'FXR',
}

/** Etiqueta para los mensajes de error de las búsquedas. */
export const ETIQUETA_TIPO_CODIGO: Record<TipoConCodigo, string> = {
  gondolero: 'Gondolero',
  fixer:     'Fixer',
}

/** Ejemplos válidos, para placeholders. No son códigos reales. */
export const EJEMPLO_CODIGO: Record<TipoConCodigo, string> = {
  gondolero: 'GND-4728-5936',
  fixer:     'FXR-3852-6479',
}

const CUERPO = '[2-9]{4}-[2-9]{4}'

/** El formato que le corresponde a un tipo. */
export function formatoCodigo(tipo: TipoConCodigo): RegExp {
  return new RegExp(`^${PREFIJO_CODIGO[tipo]}-${CUERPO}$`)
}

/** Cualquiera de los dos prefijos. Para reconocer, no para validar por tipo. */
export const FORMATO_CODIGO_CUALQUIERA = new RegExp(`^(GND|FXR)-${CUERPO}$`)

/**
 * `false` para los códigos que no le corresponden a ese tipo, para los del
 * formato viejo (GOND-4054, FIXE-8990) y para los que faltan. Son exactamente
 * los que levanta el backfill.
 *
 * **El tipo es obligatorio.** Con un default, un llamador que se lo olvide da
 * por bueno el GND de un fixer, que es justo lo que este tramo vino a cerrar —
 * el mismo criterio que el parámetro de `generar_codigo_gondolero`.
 */
export function tieneCodigoVigente(
  codigo: string | null | undefined,
  tipo: TipoConCodigo,
): boolean {
  if (!codigo) return false
  return formatoCodigo(tipo).test(codigo)
}

/** De qué tipo es un código, por su prefijo. `null` si no tiene formato válido. */
export function tipoDeCodigo(codigo: string): TipoConCodigo | null {
  const normalizado = normalizarCodigo(codigo)
  if (!FORMATO_CODIGO_CUALQUIERA.test(normalizado)) return null
  return normalizado.startsWith('FXR') ? 'fixer' : 'gondolero'
}

/**
 * Deja un código tipeado en la forma canónica `PPP-NNNN-NNNN`.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Las tres búsquedas hacían `.eq('codigo_gondolero', codigo.toUpperCase())`, o
 * sea match exacto sobre lo que la persona escribió. **Un código dictado por
 * teléfono se tipea como viene**: sin guiones, con espacios en el medio, en
 * minúscula, con un espacio pegado al final de un copiar-pegar. Cualquiera de
 * esas cuatro daba "Código no encontrado. Verificá que sea correcto." — que es
 * el peor mensaje posible, porque el código SÍ era correcto y manda a la distri
 * a buscar un error que no está.
 *
 * Se quita todo lo que no sea letra o dígito y se rearma con los guiones. Así
 * `fxr 3852 6479`, `FXR38526479` y `fxr-3852-6479 ` entran todos igual.
 *
 * Lo que NO hace es adivinar: un texto que no tenga tres letras y ocho dígitos
 * sale como se pueda y lo rechaza el validador de más arriba. Normalizar no es
 * corregir.
 */
export function normalizarCodigo(texto: string): string {
  const limpio = texto.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const m = limpio.match(/^([A-Z]{3})(\d{4})(\d{4})$/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : limpio
}

export interface CodigoRevisado {
  /** La forma canónica, para consultar la base. */
  codigo: string
  /** Presente si el código no sirve para buscar un actor de ese tipo. */
  error?: string
}

/**
 * Normaliza y rechaza ANTES de ir a la base.
 *
 * Lo que agrega el prefijo no es el mensaje cruzado —las tres búsquedas ya
 * decían "este código pertenece a un Gondolero"— sino **cuándo se puede dar**.
 * Ese mensaje salía solo si el código EXISTÍA en la base; un código de gondolero
 * mal tipeado, o de otro ambiente, caía en "no encontrado", indistinguible de un
 * typo. Con el prefijo se puede decir la verdad sin consultar nada.
 *
 * `sugerencia` la pone cada pantalla porque **no es la misma**: el panel de
 * distribuidora tiene las dos secciones y puede mandar a la otra; el de
 * repositora solo tiene fixers, así que mandarla a "la sección Gondoleros" sería
 * mandarla a una pantalla que no existe.
 */
export function revisarCodigo(
  texto: string,
  esperado: TipoConCodigo,
  sugerencia?: string,
): CodigoRevisado {
  const codigo = normalizarCodigo(texto)

  if (!FORMATO_CODIGO_CUALQUIERA.test(codigo)) {
    return {
      codigo,
      error: `Ese código no tiene el formato correcto. Tiene que ser como ${EJEMPLO_CODIGO[esperado]}.`,
    }
  }

  const tipo = tipoDeCodigo(codigo)
  if (tipo !== esperado) {
    const otro = ETIQUETA_TIPO_CODIGO[tipo as TipoConCodigo]
    const base = `Ese código es de un ${otro}, no de un ${ETIQUETA_TIPO_CODIGO[esperado]}.`
    return { codigo, error: sugerencia ? `${base} ${sugerencia}` : base }
  }

  return { codigo }
}
