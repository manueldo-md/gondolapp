/**
 * components/campanas/modulos/tema.ts
 *
 * Un solo discriminador por panel, en vez de siete props sueltos.
 *
 * Antes cada page.tsx armaba a mano un objeto de configuración con colores,
 * etiquetas, `showAgent` y el denominador de la barra de avance. Eso ya había
 * divergido: los tres paneles de resultados pasaban `objetivo_comercios` como
 * denominador y el detalle de admin pasaba `tope ?? objetivo`, así que la misma
 * campaña mostraba avance en un panel y no en otro.
 *
 * Con la tabla acá, un panel no puede quedar con una combinación incoherente, y
 * el criterio se lee de un vistazo.
 */

export type Panel = 'marca' | 'distri' | 'repositora' | 'admin'

export interface Tema {
  /** Color del valor destacado del KPI del agente */
  acento: string
  /** Barra de avance de la campaña */
  barraAvance: string
  /** Barras de proporción dentro de los módulos */
  barraModulo: string
  /** Etiqueta del KPI de agentes */
  agenteLabel: string
  /** Encabezado de columna cuando se lista el agente */
  agenteHeader: string
  /**
   * Si el panel ve QUIÉN relevó.
   *
   * `false` en marca por la regla de walled garden: la marca ve el dato, no la
   * identidad del gondolero. No es cosmética — es privacidad. Ver CLAUDE.md §18,
   * "Privacidad y anonimato en el ecosistema".
   */
  verAgente: boolean
}

export const TEMAS: Record<Panel, Tema> = {
  marca: {
    acento:       'text-gondo-indigo-600',
    barraAvance:  'bg-gondo-indigo-600',
    barraModulo:  'bg-gondo-indigo-600',
    agenteLabel:  'Gondoleros',
    agenteHeader: 'Gondolero',
    verAgente:    false,
  },
  distri: {
    acento:       'text-gondo-amber-400',
    barraAvance:  'bg-gondo-amber-400',
    barraModulo:  'bg-gondo-amber-400',
    agenteLabel:  'Gondoleros',
    agenteHeader: 'Gondolero',
    verAgente:    true,
  },
  repositora: {
    acento:       'text-blue-600',
    barraAvance:  'bg-blue-500',
    barraModulo:  'bg-blue-400',
    agenteLabel:  'Fixers',
    agenteHeader: 'Fixer',
    verAgente:    true,
  },
  admin: {
    acento:       'text-gray-700',
    barraAvance:  'bg-gray-600',
    barraModulo:  'bg-gray-500',
    agenteLabel:  'Gondoleros',
    agenteHeader: 'Gondolero',
    verAgente:    true,
  },
}
