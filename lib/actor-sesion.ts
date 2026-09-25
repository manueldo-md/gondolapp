/**
 * lib/actor-sesion.ts — el único lugar que convierte una SESIÓN en un actor.
 *
 * Existe separado de `lib/alcance-revision.ts` por una razón de prueba y una de
 * diseño, y son la misma:
 *
 *  · **Prueba.** Este archivo importa `next/headers` (vía
 *    `@/lib/supabase/server`), que solo funciona dentro de un request. Si la
 *    decisión de permiso viviera acá, no habría forma de correr un control que
 *    intente aprobar una foto ajena sin levantar el server. Con el corte acá,
 *    `probar-alcance-revision.mts` prueba la decisión entera con actores y
 *    fotos reales de las dos bases.
 *
 *  · **Diseño.** Lo que este archivo hace es una línea: leer quién es. Todo lo
 *    demás —qué puede tocar— no depende de Next, y no debería.
 *
 * Lo que queda de este lado es exactamente lo que el control NO puede probar, y
 * por eso el control lo cubre por otra vía: un chequeo de CABLEADO que verifica
 * que ninguna action escriba `fotos.estado` sin pasar por el guard. *El
 * cableado es lo que falla, no la función* — van cuatro casos en este proyecto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { actorRevisorDePerfil, type ActorRevisor } from '@/lib/alcance-revision'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

type PerfilDeSesion = {
  tipo_actor: string | null
  distri_id: string | null
  marca_id: string | null
  repositora_id: string | null
}

/** La fila de `profiles` del que está del otro lado. Privada a propósito. */
async function perfilDeLaSesion(admin: Admin): Promise<PerfilDeSesion | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await admin
    .from('profiles')
    .select('tipo_actor, distri_id, marca_id, repositora_id')
    .eq('id', user.id)
    .maybeSingle()

  // supabase-js devuelve el error de Postgres en `.error` y no lo lanza. Sin
  // este chequeo, un fallo de lectura sería indistinguible de "no tiene
  // perfil" — deniega igual, pero conviene que quede dicho en el log.
  if (error) {
    console.error('[actor-sesion] no se pudo leer el perfil:', error.message)
    return null
  }
  return (data ?? null) as PerfilDeSesion | null
}

/**
 * Quién está del otro lado, según la cookie. **Nunca según un parámetro.**
 *
 * Devuelve `null` si no hay sesión, si no hay perfil, o si el tipo de actor no
 * revisa fotos (gondolero, fixer).
 */
export async function actorRevisorDeLaSesion(admin: Admin): Promise<ActorRevisor | null> {
  return actorRevisorDePerfil(await perfilDeLaSesion(admin))
}

/**
 * La distribuidora del que llama. **Reemplaza al `distriId: string` que las
 * actions de desvinculación recibían por parámetro.**
 *
 * Exige `tipo_actor = 'distribuidora'` y no solo que `distri_id` esté cargado:
 * un gondolero también tiene esa columna —es su distri principal— así que sin
 * el chequeo de tipo, esto le devolvería un id que no le pertenece como dueño.
 *
 * Un admin da `null`: no tiene `distri_id`. Eso ya pasaba antes —el chequeo
 * viejo comparaba contra `perfil.distri_id`, que para un admin es null— así
 * que no le saca nada a nadie.
 */
export async function distriDeLaSesion(admin: Admin): Promise<string | null> {
  const p = await perfilDeLaSesion(admin)
  if (!p || p.tipo_actor !== 'distribuidora') return null
  return p.distri_id
}

/** La repositora del que llama. Mismo criterio que `distriDeLaSesion`. */
export async function repositoraDeLaSesion(admin: Admin): Promise<string | null> {
  const p = await perfilDeLaSesion(admin)
  if (!p || p.tipo_actor !== 'repositora') return null
  return p.repositora_id
}
