'use server'

import { getAdmin } from '@/lib/admin-sesion'
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


export async function aprobarComercio(id: string) {
  // `getAdmin()` exige `tipo_actor = 'admin'`. Hasta el 25/9/2026 acá había un
  // `requerirSesion()` que solo miraba que hubiera alguien logueado: el único
  // que la protegía era el middleware. Ver lib/admin-sesion.ts.
  const admin = await getAdmin()

  const resultado = await validarComercioYCrearMision(id, admin)

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  revalidatePath('/admin/tablero')

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true, puntos: resultado.puntos ?? 0 }
}

export async function rechazarComercio(id: string, motivo?: string) {
  const admin = await getAdmin()

  const resultado = await rechazarComercioConMotivo(id, motivo, admin)

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
 * ── EL PERMISO, QUE YA NO ES PROPIO DE ESTA FUNCIÓN ─────────────────────────
 * Esta nació el 25/9/2026 mirando `tipo_actor` a mano, porque las otras dos de
 * este archivo se conformaban con `requerirSesion()` —que haya alguien
 * logueado— y lo único que las protegía era el middleware.
 *
 * Ese mismo día el chequeo se mudó a `getAdmin()` (lib/admin-sesion.ts), que
 * es el único camino al cliente de servicio del panel. Ahora lo tienen las 40
 * actions y no hay forma de saltearlo por olvido: no se puede conseguir el
 * cliente sin pasar por el chequeo.
 */
export async function asignarLocalidadAdmin(comercioId: string, localidadId: number) {
  // El chequeo de `tipo_actor` que esta función tenía escrito a mano vive ahora
  // en `getAdmin()`, y lo tienen las 40 actions del panel, no solo ésta.
  const admin = await getAdmin()

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
