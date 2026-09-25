'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  validarComercioYCrearMision,
  rechazarComercioConMotivo,
} from '@/lib/validacion-comercio'

/**
 * Validación de comercios — panel de admin.
 *
 * La lógica vive entera en `lib/validacion-comercio.ts`: acá solo está el
 * permiso y el revalidate. Antes estaba duplicada entre este archivo y el de la
 * distribuidora, y las dos copias ya se habían separado — la de acá leía
 * `puntos_otorgados` de la foto y no lo usaba, las dos leían `puntos_por_foto`
 * sin el fallback a `puntos_por_mision`, y ninguna creaba la misión del alta.
 */

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requerirSesion() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
}

export async function aprobarComercio(id: string) {
  await requerirSesion()

  const resultado = await validarComercioYCrearMision(id, adminClient())

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  revalidatePath('/admin/tablero')

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true, puntos: resultado.puntos ?? 0 }
}

export async function rechazarComercio(id: string, motivo?: string) {
  await requerirSesion()

  const resultado = await rechazarComercioConMotivo(id, motivo, adminClient())

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  revalidatePath('/admin/tablero')

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true }
}

/**
 * Escribe la localidad DEFINITIVA del comercio — panel de admin.
 *
 * Gemela de `asignarLocalidadDistri`. La regla es la misma y el componente
 * también (`SelectorLocalidad`); lo único propio es el permiso.
 *
 * El geocoding acierta 8 de cada 9 veces que resuelve, pero **la novena apunta
 * a otra localidad** y ese caso no lo detecta ninguna lógica: la respuesta es
 * internamente consistente. Por eso el servidor escribe `localidad_sugerida_*`
 * y esto escribe `localidad_id`.
 *
 * La sugerencia NO se borra: comparar las dos columnas es la única forma de
 * medir con qué frecuencia el geocoding acierta en la vida real.
 *
 * ── EL PERMISO SE CHEQUEA ACÁ, Y NO SOLO EN EL MIDDLEWARE ───────────────────
 * Las otras dos actions de este archivo se conforman con `requerirSesion()`:
 * que haya alguien logueado. Lo que las protege de verdad es el middleware, que
 * matchea `/admin` y rebota a cualquiera cuyo `tipo_actor` no lo incluya — y
 * una server action postea a la ruta de su propia página, así que pasa por ahí.
 *
 * Funciona, pero es **una sola capa**: el día que alguien toque el matcher o
 * mueva la pantalla de ruta, estas actions quedan abiertas a cualquier
 * autenticado sin que nada falle visiblemente. La de distri no depende de eso
 * —`puedeTocar` chequea el vínculo— así que acá se hace lo mismo.
 */
export async function asignarLocalidadAdmin(comercioId: string, localidadId: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const { data: perfil } = await admin
    .from('profiles').select('tipo_actor').eq('id', user.id).maybeSingle()
  if (perfil?.tipo_actor !== 'admin') {
    return { error: 'No tenés permiso para editar este comercio.' }
  }

  // No se confía en el id que llega del cliente: tiene que existir. Sin esto,
  // un número cualquiera lo rebotaría la FK con un error ilegible.
  const { data: loc } = await admin
    .from('localidades').select('id').eq('id', localidadId).maybeSingle()
  if (!loc) return { error: 'Esa localidad no existe.' }

  // supabase-js devuelve el error en .error y no lo lanza: sin este chequeo,
  // una asignación que falla se vería igual que una que anduvo.
  const { error } = await admin
    .from('comercios').update({ localidad_id: localidadId }).eq('id', comercioId)
  if (error) {
    console.error('[localidad] No se pudo asignar (admin):', error.message)
    return { error: 'No se pudo guardar la localidad.' }
  }

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  return { ok: true }
}
