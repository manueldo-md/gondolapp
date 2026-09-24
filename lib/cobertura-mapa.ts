/**
 * lib/cobertura-mapa.ts — el estado de cobertura de cada PDV, para pintarlo.
 *
 * ── POR QUÉ NO SE AMPLIÓ `panel_pdv` ────────────────────────────────────────
 * El RPC ya trae las visitas de TODA la campaña y la última medición, pero no
 * las de ESTA SEMANA. Agregarlas parecía lo directo y no lo es: **la semana
 * argentina está definida en `lib/fecha-ar.ts`**, y calcularla adentro del SQL
 * con un `date_trunc` sería una segunda definición de "la semana".
 *
 * Este proyecto ya pagó tres veces esa cuenta —`comercios_relevados`, la doble
 * lectura de `foto_respuestas`, el mapa de tipos de comercio— y acá la frontera
 * es la de las 21:00 del domingo, que es exactamente la que se equivoca sola.
 *
 * Así que la semana se queda en TypeScript: una consulta a `misiones` y el
 * mismo `calcularCobertura` que dibuja el dashboard. **La lógica no se
 * reescribe**, se llama.
 */
import { calcularCobertura, type VisitaMision, type EstadoCobertura } from './cobertura-seguimiento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** Lo que el mapa necesita saber de cada PDV para pintarlo y listarlo. */
export type CoberturaDePdv = {
  estado: EstadoCobertura
  /** Visitas de esta semana. Va a la lista del grupo, no al color. */
  visitas: number
}

/** Lo mínimo de la campaña. Sale de `campanasDe`. */
export type CampanaDeCobertura = {
  id: string
  modalidad?: string | null
  visitas_por_semana?: number | null
  fecha_inicio?: string | null
}

/** Una campaña de seguimiento con frecuencia declarada: sin eso no hay qué medir. */
export function mideCobertura(c: CampanaDeCobertura | null | undefined): boolean {
  return !!c && c.modalidad === 'seguimiento' && (c.visitas_por_semana ?? 0) > 0
}

/**
 * El estado de cobertura de cada comercio de esa campaña, por `comercio_id`.
 *
 * Devuelve un mapa vacío cuando la campaña no es de seguimiento: el modo no se
 * ofrece, y si alguien lo fuerza por la URL el mapa no tiene con qué pintar y
 * cae a presencia. La frecuencia es de la CAMPAÑA, así que sin una elegida no
 * hay cobertura que mostrar.
 *
 * ── UNA CONSULTA, Y LAS MISMAS FILAS QUE EL DASHBOARD ───────────────────────
 * Los cinco campos son los de `VisitaMision`. El dashboard pide además el alias
 * del gondolero porque los muestra; el mapa no, así que no lo trae.
 *
 * **Ojo con el techo de 1.000 filas de PostgREST**: esta consulta no tiene
 * `.limit()`, igual que la del dashboard. Con la campaña más grande de hoy —56
 * misiones— falta mucho, pero una de seguimiento de seis meses con 200
 * sucursales son ~10.000 y el corte sería silencioso. Está anotado como
 * pendiente propio en CLAUDE.md; no se arregla acá porque el arreglo es agregar
 * en la base, y eso reabre lo de la semana.
 */
export async function coberturaDeCampana(
  campana: CampanaDeCobertura | null | undefined,
  admin: Admin,
): Promise<Map<string, CoberturaDePdv>> {
  const vacio = new Map<string, CoberturaDePdv>()
  if (!mideCobertura(campana)) return vacio

  const { data, error } = await admin
    .from('misiones')
    .select('comercio_id, gondolero_id, estado, capturada_at, created_at')
    .eq('campana_id', campana!.id)

  if (error) {
    // Falla CERRADO: sin datos el mapa no pinta cobertura en vez de pintar a
    // todos "al día", que sería el color que más miente.
    console.error('[cobertura-mapa] misiones:', error.message)
    return vacio
  }

  const cob = calcularCobertura({
    misiones: (data ?? []) as VisitaMision[],
    // El mapa ya tiene los nombres: los pone `panel_pdv`. Acá solo importan los
    // estados, y `calcularCobertura` cae al id abreviado si falta el nombre.
    nombresComercio: new Map(),
    visitasPorSemana: campana!.visitas_por_semana ?? 0,
    fechaInicio: campana!.fecha_inicio ?? null,
  })

  return new Map(cob.comercios.map(c => [c.comercioId, { estado: c.estado, visitas: c.visitas }]))
}
