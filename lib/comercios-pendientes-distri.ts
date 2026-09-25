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

/**
 * ¿Esta distri puede tocar este comercio? **El permiso ES la lista.**
 *
 * Vive acá, al lado de `gondolerosParaPendientes`, y no adentro de la action,
 * por dos razones que son la misma:
 *
 *  · **Para que no se separe de la lista.** Si el criterio del permiso viviera
 *    en el archivo de actions, sería una segunda definición de lo que esta
 *    misma función ya contesta, y el día que una se corrija la otra queda
 *    vieja. Es el patrón exacto que dejó el badge y la bandeja de acuerdo por
 *    casualidad, las dos mal.
 *  · **Para poder probarlo.** Una función privada de un archivo `'use server'`
 *    no se puede llamar desde un script, y exportarla la convertiría en un
 *    endpoint más. `probar-pendientes-distri.mts` verifica contra datos reales
 *    que esto diga que sí **exactamente** sobre lo que la lista muestra.
 *
 * ── LO QUE REEMPLAZA ────────────────────────────────────────────────────────
 * El `puedeTocar` viejo miraba la CAMPAÑA del comercio y empezaba con
 * `if (!comercio?.campana_id) return true`. Como el alta oportunista no
 * escribe `campana_id` a propósito, ese `return true` se comía **6 de 6
 * pendientes en producción y 5 de 5 en dev**: toda distribuidora podía validar
 * el padrón pendiente entero, incluido el trabajo de gondoleros de otra.
 *
 * Medido antes de cambiarlo: los comercios de una campaña de la distri
 * cargados por un gondolero que NO es suyo son **cero en las dos bases**, así
 * que el criterio nuevo no le saca ningún caso legítimo a nadie.
 */
export async function distriPuedeTocarComercio(
  comercioId: string,
  distriId: string,
  admin: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await admin
    .from('comercios')
    .select('registrado_por')
    .eq('id', comercioId)
    .maybeSingle()

  // supabase-js devuelve el error de Postgres en `.error` y no lo lanza. Sin
  // el chequeo, un fallo de lectura sería indistinguible de "no existe" —
  // deniega igual, pero el silencio haría que un permiso roto se vea como un
  // comercio ajeno, que es el diagnóstico equivocado.
  if (error) {
    console.error('[pendientes] no se pudo leer el comercio:', error.message)
    return false
  }

  const registradoPor = (data as { registrado_por: string | null } | null)?.registrado_por
  // Un comercio sin quien lo cargó no le pertenece a ninguna distri: lo valida
  // el admin, cuya bandeja no filtra por nada. Ante la duda, no.
  if (!registradoPor) return false

  return (await gondolerosParaPendientes(distriId, admin)).includes(registradoPor)
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
