/**
 * lib/resultados-normalizar.ts
 *
 * RED DE SEGURIDAD, NO EL ARREGLO.
 *
 * Cada tipo de campo tiene un tipo JSON que le corresponde en
 * `mision_respuestas.valor` (jsonb):
 *
 *   binaria            → boolean      true
 *   numero             → number       2500
 *   seleccion_multiple → array        ["Arcor","Georgalos"]
 *   seleccion_unica    → string       "Arcor"
 *   texto              → string       "La góndola estaba..."
 *
 * Los dos únicos escritores de la tabla —`captura/actions.ts` y
 * `scripts/seed-demo-completo.ts`— escriben así desde el 14/9/2026, y lo
 * histórico se normalizó con UPDATE en dev y en producción ese mismo día.
 *
 * Entonces, ¿por qué existe este archivo? Porque un dato mal tipado que llega
 * a los agregados no se ve: se cuenta mal y el panel muestra un número
 * plausible. Antes del arreglo, `"si"` sin tilde caía en el else de la binaria
 * y se contaba como "No", y las selecciones múltiples serializadas dos veces
 * se descartaban enteras. Nadie lo notó durante meses.
 *
 * Estas funciones son el cinturón: si vuelve a aparecer un formato viejo —un
 * backup restaurado, un fixture, un script nuevo— el panel lo interpreta bien
 * igual. NO son el lugar donde se arregla un escritor nuevo que escriba mal:
 * eso se arregla en el escritor. Ver CLAUDE.md, "Formato de
 * mision_respuestas.valor".
 */

/** `true` solo para lo que representa un sí. Tolera "si", "sí", "true", "1". */
export function normalizarBinaria(valor: unknown): boolean {
  if (typeof valor === 'boolean') return valor
  if (typeof valor === 'number') return valor !== 0
  if (typeof valor === 'string') {
    return ['si', 'sí', 'true', '1'].includes(valor.trim().toLowerCase())
  }
  return false
}

/** Número, o `null` si el valor no es convertible (no se cuenta en los agregados). */
export function normalizarNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor === 'string') {
    const n = Number(valor.trim())
    return valor.trim() !== '' && Number.isFinite(n) ? n : null
  }
  return null
}

/**
 * Array de opciones elegidas.
 *
 * El caso raro que cubre: un string que CONTIENE un array JSON, producto de
 * `JSON.stringify(array)` sobre una columna jsonb — doble serialización. Así
 * escribía el seed hasta el 14/9/2026 y el panel descartaba esas filas enteras
 * porque `Array.isArray()` daba `false`.
 */
export function normalizarSeleccionMultiple(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(v => String(v))
  if (typeof valor === 'string') {
    const s = valor.trim()
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed.map(v => String(v))
      } catch {
        // No era JSON válido: se trata como una opción suelta.
      }
    }
    return s === '' ? [] : [s]
  }
  return []
}

/** Texto y selección única comparten forma: un string. */
export function normalizarTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor
  return String(valor)
}
