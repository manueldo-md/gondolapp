/**
 * lib/marcar-notificacion.ts — marcar UNA notificación como leída, para
 * cualquier actor.
 *
 * ── POR QUÉ UNA SOLA REGLA ──────────────────────────────────────────────────
 * El lado del gondolero ya tenía `marcarUnaNotificacionLeida`, y estaba bien
 * resuelto: acotaba con `.eq('gondolero_id', user.id)`, así que una
 * notificación ajena simplemente no matchea y el update no escribe nada.
 *
 * Pero esa misma función **no sirve para una distri o una marca**: sus
 * notificaciones tienen `gondolero_id` en NULL y se identifican por
 * `actor_id` + `actor_tipo`. Copiarla y cambiarle el `.eq()` habría dejado
 * tres versiones del mismo permiso, que es como empiezan a separarse.
 *
 * Así que la regla vive acá una sola vez y lo único que cambia es **de dónde
 * sale el dueño**, que lo resuelve `lib/actor-sesion.ts`.
 *
 * ── EL PREDICADO ES EL PERMISO ──────────────────────────────────────────────
 * No se lee la fila para después comparar: se agrega el dueño al `WHERE` del
 * propio UPDATE. Una notificación de otro no matchea y no se escribe — sin
 * rama de error, sin un `if` que alguien pueda sacar. Es el mismo criterio que
 * "la lista ES el permiso" de `lib/campanas-de.ts`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/** Quién es el dueño de la notificación, según el panel que la muestra. */
export type DuenoNotificacion =
  /** Gondoleros y fixers: la fila lleva `gondolero_id`. */
  | { tipo: 'persona'; userId: string }
  /** Empresas: la fila lleva `actor_id` + `actor_tipo`. */
  | { tipo: 'distribuidora' | 'marca' | 'repositora'; actorId: string }

export async function marcarNotificacionLeida(
  notificacionId: string,
  dueno: DuenoNotificacion,
  admin: Admin,
): Promise<{ error: string | null }> {
  const base = admin.from('notificaciones').update({ leida: true }).eq('id', notificacionId)

  const { error } = dueno.tipo === 'persona'
    ? await base.eq('gondolero_id', dueno.userId)
    : await base.eq('actor_id', dueno.actorId).eq('actor_tipo', dueno.tipo)

  // supabase-js devuelve el error en `.error` y no lo lanza. Acá no se
  // propaga: la pantalla ya pintó la notificación como leída y volver atrás
  // por un fallo de contabilidad sería más confuso que el fallo. Pero se dice.
  if (error) {
    console.error('[notificaciones] no se pudo marcar como leída:', error.message,
      { notificacionId, dueno: dueno.tipo })
  }
  return { error: error?.message ?? null }
}
