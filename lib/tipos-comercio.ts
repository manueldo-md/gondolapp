/**
 * Etiquetas de `comercios.tipo`, en singular y en plural.
 *
 * El plural existe porque la distribución de la cabecera de resultados se lee
 * como una frase —"42 kioscos, 18 almacenes, 9 dietéticas"— y "42 Kiosco" no es
 * una frase. Las pantallas que muestran el tipo de UN comercio usan el singular.
 *
 * Los seis valores son los del CHECK `comercios_tipo_check`, que es lo que la
 * base acepta. Si alguna vez se agrega uno, se agrega en el CHECK y acá.
 *
 * Este archivo nace con una sola pantalla usándolo. El mapa tipo → etiqueta está
 * escrito otras nueve veces en el repo, y dos de esas copias ya divergieron
 * (ver CLAUDE.md, "Pendiente — nueve copias del mapa de tipos de comercio").
 * Migrarlas es un tramo aparte; lo que este archivo evita es que sean diez.
 */
import type { TipoComercio } from '@/types'

/** Los seis valores del CHECK, en el orden en que conviene leerlos. */
export const TIPOS_COMERCIO: TipoComercio[] = [
  'kiosco',
  'almacen',
  'autoservicio',
  'dietetica',
  'mayorista',
  'otro',
]

const ETIQUETAS: Record<TipoComercio, { singular: string; plural: string }> = {
  kiosco:       { singular: 'Kiosco',       plural: 'kioscos' },
  almacen:      { singular: 'Almacén',      plural: 'almacenes' },
  autoservicio: { singular: 'Autoservicio', plural: 'autoservicios' },
  dietetica:    { singular: 'Dietética',    plural: 'dietéticas' },
  mayorista:    { singular: 'Mayorista',    plural: 'mayoristas' },
  otro:         { singular: 'Otro',         plural: 'otros' },
}

/** Etiqueta para un comercio. `null` incluido: se ve, no se esconde. */
export function etiquetaTipo(tipo: string | null | undefined): string {
  if (!tipo) return SIN_TIPO
  return ETIQUETAS[tipo as TipoComercio]?.singular ?? tipo
}

/**
 * Etiqueta para contar. Con `n === 1` devuelve el singular en minúscula, para
 * que "1 kiosco" no diga "1 kioscos".
 */
export function etiquetaTipoPlural(tipo: string | null | undefined, n: number): string {
  if (!tipo) return SIN_TIPO
  const e = ETIQUETAS[tipo as TipoComercio]
  if (!e) return tipo
  return n === 1 ? e.singular.toLowerCase() : e.plural
}

/**
 * Cómo se nombra un comercio sin clasificar.
 *
 * Aparece como una categoría más y no se filtra: una muestra donde un tercio de
 * los comercios no tiene tipo es un dato sobre la muestra, y esconderlo haría
 * que el resto de las barras parezcan más representativas de lo que son.
 */
export const SIN_TIPO = 'sin clasificar'
