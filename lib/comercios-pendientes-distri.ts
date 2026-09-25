/**
 * lib/comercios-pendientes-distri.ts — qué comercios pendientes le tocan a una
 * distribuidora.
 *
 * ── EL BUG QUE ESTO CIERRA ──────────────────────────────────────────────────
 * La bandeja filtraba por LAS CAMPAÑAS de la distri:
 *
 *     .eq('estado', 'pendiente_validacion').in('campana_id', campanaIds)
 *
 * Y `campana_id` solo lo escribe `crearComercioNuevo`, el alta de una campaña
 * de altas. **El alta oportunista —el camino normal, dar de alta un comercio
 * para poder hacerle la misión— no lo escribe a propósito**: si lo hiciera, la
 * fachada se cobraría como una unidad de pago (ver `fotoEsUnidadDePago`).
 *
 * Resultado medido el 25/9/2026, en las dos bases:
 *
 *     pendiente_validacion   los veía la distri   INVISIBLES
 *     dev            7               0                 7
 *     producción     8               0                 8
 *
 * **Cero.** La bandeja de la distribuidora no mostró un solo comercio desde que
 * existe. El admin sí los ve —su consulta no filtra por campaña— así que el
 * trabajo llegaba a alguien, pero no a quien el flujo dice que tiene que
 * validarlo.
 *
 * Y el permiso ya decía que sí: `puedeTocar` tiene un `if (!campana_id) return
 * true` con el comentario "lo cargó un gondolero desde la captura normal".
 * Alguien previó este caso **para la acción** y no para la lista.
 *
 * ── EL CRITERIO: POR GONDOLERO ──────────────────────────────────────────────
 * Son los comercios cargados por gondoleros vinculados a esa distri. Es el
 * vínculo que ya existe, es el que `puedeTocar` insinuaba, y **no depende de
 * datos que puedan faltar** — a diferencia de la geografía, que recién desde el
 * tramo de `localidad_id` está completa y todavía no tiene rodaje.
 *
 * Sacar el filtro sin reemplazarlo dejaría a toda distri viendo el padrón
 * pendiente entero, que es el problema ya anotado en CLAUDE.md ("Toda
 * distribuidora ve todos los comercios del sistema").
 *
 * ── UN GONDOLERO DE DOS DISTRIS APARECE EN LAS DOS BANDEJAS ─────────────────
 * Y está bien: un gondolero puede estar vinculado a varias a la vez —el Walled
 * Garden protege los datos de cada ejecutor, no la exclusividad de la persona—
 * y cualquiera de las dos puede validar ese comercio. La idempotencia de
 * `validarComercioYCrearMision` ya cubre que las dos lo aprueben.
 *
 * ── UNA SOLA DEFINICIÓN, PORQUE ERAN DOS ────────────────────────────────────
 * La consulta estaba copiada en la página y en el badge del sidebar
 * (`layout.tsx`). Estaban de acuerdo por casualidad —las dos mal— pero dos
 * copias de un criterio es garantizar que el día que se corrija una, la otra
 * quede vieja: un badge que dice 8 sobre una lista vacía es peor que el bug.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getGondolerosDeDistri } from './utils-distri'

/** Lo que las dos superficies necesitan saber antes de consultar comercios. */
export async function gondolerosParaPendientes(
  distriId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<string[]> {
  // `incluyeHistorico = true`: un comercio cargado por alguien que ya se
  // desvinculó sigue siendo trabajo que esta distri tiene que revisar. Si se
  // excluyera, desvincular a un gondolero escondería sus altas pendientes —
  // el mismo hueco silencioso, por otra puerta.
  return getGondolerosDeDistri(distriId, admin, true)
}

/** Cuántos comercios pendientes tiene para revisar. Para el badge. */
export async function contarComerciosPendientesDistri(
  distriId: string,
  admin: SupabaseClient,
): Promise<number> {
  const gondoleroIds = await gondolerosParaPendientes(distriId, admin)
  if (gondoleroIds.length === 0) return 0

  const { count, error } = await admin
    .from('comercios')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pendiente_validacion')
    .in('registrado_por', gondoleroIds)

  if (error) {
    // El badge es un número: si falla, no se inventa. Pero se dice, porque
    // "cero pendientes" y "no se pudo contar" se ven exactamente igual.
    console.error('[pendientes] No se pudo contar:', error.message)
    return 0
  }
  return count ?? 0
}
