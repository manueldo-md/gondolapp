/**
 * lib/misiones-trabadas.ts
 *
 * Detecta y repara las misiones survey-only que quedaron sin aprobar.
 *
 * EL CASO: una campaña sin campos de foto se aprueba en el acto, al registrarse
 * (`resolverMisionDirecta`). Si esa aprobación falla, la misión queda en
 * 'pendiente' + 'retenido' sin ninguna foto, y **nada vuelve a tocarla**:
 * `actualizarEstadoMision` se dispara desde la revisión de una foto, y acá no
 * hay fotos que revisar. Quedan 3 así en dev (16/9/2026).
 *
 * POR QUÉ IMPORTA AHORA: hasta el 16/9/2026 la barrida de pago liberaba TODA
 * misión en 'retenido' sin mirar el estado, así que estas cobraban de arriba
 * cuando el gondolero cruzaba el mínimo con otra misión. Al cerrar ese agujero
 * —la barrida ahora exige estado='aprobada'— se les sacó esa red: ya no cobran
 * nunca. El agujero del pago era el que las estaba tapando.
 *
 * ES UN REINTENTO, NO UNA REPARACIÓN A MANO: se vuelve a llamar a la misma
 * `aprobarMisionCore` que falló. Si la causa era transitoria, funciona; si es
 * permanente, ahora tira con el motivo y el panel lo muestra, en vez de
 * quedarse callada como la primera vez.
 */

import { aprobarMisionCore } from './misiones'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export interface MisionTrabada {
  id: string
  campanaId: string
  campanaNombre: string
  gondoleroId: string
  gondoleroAlias: string | null
  minParaCobrar: number
}

/**
 * Las misiones survey-only trabadas. Tres condiciones, y las tres hacen falta:
 *
 *   1. estado='pendiente' + bounty_estado='retenido' → no se aprobó ni se pagó
 *   2. sin ninguna fila en `fotos`                   → no hay nada que revisar
 *   3. su campaña no tiene NINGÚN campo tipo='foto'  → es survey-only de verdad
 *
 * La 3 es la que lo hace seguro. Sin ella entrarían también las misiones de una
 * campaña CON fotos cuyo insert de fotos falló — y esas no hay que aprobarlas,
 * porque ahí falta el trabajo, no el trámite. Son otro caso y necesitan otra
 * decisión.
 */
export async function listarMisionesTrabadas(admin: Admin): Promise<MisionTrabada[]> {
  const { data: candidatas, error } = await admin
    .from('misiones')
    .select('id, campana_id, gondolero_id, campana:campanas(nombre, min_comercios_para_cobrar), gondolero:profiles(alias)')
    .eq('estado', 'pendiente')
    .eq('bounty_estado', 'retenido')

  if (error) {
    console.error('[misiones-trabadas] error leyendo misiones:', error.message)
    return []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filas = (candidatas ?? []) as any[]
  if (filas.length === 0) return []

  // Condición 2 — sin fotos. Se pregunta por las misiones candidatas y no por
  // toda la tabla: son pocas.
  const ids = filas.map(m => m.id as string)
  const { data: fotosData, error: errFotos } = await admin
    .from('fotos')
    .select('mision_id')
    .in('mision_id', ids)

  if (errFotos) {
    console.error('[misiones-trabadas] error leyendo fotos:', errFotos.message)
    return []
  }
  const conFotos = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fotosData ?? []) as any[]).map(f => f.mision_id as string)
  )

  const sinFotos = filas.filter(m => !conFotos.has(m.id))
  if (sinFotos.length === 0) return []

  // Condición 3 — la campaña no tiene ningún campo de foto configurado.
  const campanaIds = [...new Set(sinFotos.map(m => m.campana_id as string).filter(Boolean))]
  const { data: bloquesData, error: errBloques } = await admin
    .from('bloques_foto')
    .select('campana_id, bloque_campos(tipo)')
    .in('campana_id', campanaIds)

  if (errBloques) {
    console.error('[misiones-trabadas] error leyendo bloques:', errBloques.message)
    return []
  }
  const campanasConFoto = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of ((bloquesData ?? []) as any[])) {
    const campos = Array.isArray(b.bloque_campos) ? b.bloque_campos : []
    if (campos.some((c: { tipo: string }) => c.tipo === 'foto')) {
      campanasConFoto.add(b.campana_id as string)
    }
  }

  return sinFotos
    .filter(m => !campanasConFoto.has(m.campana_id))
    .map(m => {
      const campana   = Array.isArray(m.campana)   ? m.campana[0]   : m.campana
      const gondolero = Array.isArray(m.gondolero) ? m.gondolero[0] : m.gondolero
      return {
        id:             m.id as string,
        campanaId:      m.campana_id as string,
        campanaNombre:  campana?.nombre ?? '(campaña sin nombre)',
        gondoleroId:    m.gondolero_id as string,
        gondoleroAlias: gondolero?.alias ?? null,
        minParaCobrar:  campana?.min_comercios_para_cobrar ?? 1,
      }
    })
}

/**
 * Reintenta la aprobación de cada misión trabada.
 *
 * Reporta resueltas y fallidas POR SEPARADO, con el detalle de cuáles fallaron:
 * este flujo ya se quedó callado una vez y por eso las misiones llevan días
 * trabadas. Un reintento que arregla la mitad y reporta solo los éxitos sería
 * el mismo error otra vez.
 */
export async function destrabarMisiones(admin: Admin): Promise<{
  resueltas: number
  fallidas: number
  detalle: string[]
}> {
  const trabadas = await listarMisionesTrabadas(admin)

  let resueltas = 0
  const detalle: string[] = []

  // Secuencial: cada aprobación recuenta las misiones aprobadas del gondolero
  // para decidir si libera el bounty. En paralelo, dos misiones del mismo
  // gondolero leerían el mismo conteo viejo.
  for (const m of trabadas) {
    const etiqueta = `${m.gondoleroAlias ?? m.gondoleroId} · ${m.campanaNombre}`
    try {
      await aprobarMisionCore({
        misionId:      m.id,
        gondoleroId:   m.gondoleroId,
        campanaId:     m.campanaId,
        minParaCobrar: m.minParaCobrar,
        admin,
      })
      resueltas++
    } catch (err) {
      detalle.push(etiqueta)
      console.error(
        '[destrabarMisiones] no se pudo destrabar %s (misión %s): %s',
        etiqueta, m.id, err instanceof Error ? err.message : String(err)
      )
    }
  }

  return { resueltas, fallidas: detalle.length, detalle }
}
