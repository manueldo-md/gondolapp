'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cerrarVinculacion, previsualizarCierre, type ResumenCierre } from '@/lib/cerrar-vinculacion'
import { distriDeLaSesion } from '@/lib/actor-sesion'
import { mensajeDesvinculacion } from '@/lib/mensaje-desvinculacion'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Qué se va a cerrar si se desvincula. **Ya no bloquea.**
 *
 * Hasta el 18/9/2026 esta función se llamaba `verificarDesvincularGondolero` y
 * devolvía `campanasBloqueantes`: con una participación activa, la
 * desvinculación era imposible y el botón pedía que el gondolero "se diera de
 * baja de la campaña primero".
 *
 * Eso quedó al revés del Walled Garden. Para cambiar de distribuidora hay que
 * desvincularse, y si desvincular está bloqueado por el trabajo en curso, el
 * gondolero queda atrapado — o peor, usa el camino del perfil, que no tenía
 * ningún guard, y deja todo colgado igual.
 *
 * Ahora el trabajo en curso **se cierra**, y esto sirve para contarlo antes.
 * Ver lib/cerrar-vinculacion.ts.
 */
export async function previsualizarDesvincularGondolero(
  gondoleroId: string,
): Promise<ResumenCierre> {
  // `distriId` SALIÓ DE LA FIRMA. Hasta el 25/9/2026 llegaba por parámetro y
  // esta función no llamaba a `getUser()` ni una vez: cualquiera —logueado o
  // no— podía pedir el resumen de cierre de cualquier gondolero para cualquier
  // distribuidora, y eso devuelve los nombres de sus campañas en curso y los
  // puntos que tiene retenidos.
  //
  // No alcanzaba con agregar el `getUser()`: eso autentica y no autoriza. Con
  // la sesión chequeada pero el `distriId` todavía viniendo del cliente,
  // cualquier autenticado seguía leyendo lo de cualquier otra. El arreglo es
  // que el id no se pueda elegir.
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  return previsualizarCierre({ gondoleroId, distriId, admin, iniciadoPor: 'distri' })
}

/**
 * Desvincula al gondolero de la distribuidora:
 * - Marca la solicitud como 'terminada'
 * - Limpia distri_id del profile si apunta a esta distri
 * - Envía notificación al gondolero
 */
export async function desvincularGondolero(
  gondoleroId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  // `distriId` también salió de la firma. Acá SÍ había un chequeo —comparaba
  // el parámetro contra `perfil.distri_id`— así que no era un agujero. Pero un
  // id que hay que verificar es un id que alguien se puede olvidar de
  // verificar: derivarlo hace que la comparación sobre.
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const now = new Date().toISOString()

  // Cerrar el trabajo en curso ANTES de cortar el vínculo.
  //
  // El orden importa: si el vínculo se corta primero y esto falla, queda un
  // gondolero desvinculado con participaciones activas y bounties retenidos que
  // ya nadie va a liberar — exactamente el estado que este tramo vino a evitar.
  // Al revés, un fallo deja el vínculo intacto y se puede reintentar.
  const cierre = await cerrarVinculacion({ gondoleroId, distriId, admin, iniciadoPor: 'distri' })
  if (!cierre.ok) return { error: cierre.error }

  const [solRes, profileRes] = await Promise.all([
    // Terminar la solicitud en gondolero_distri_solicitudes
    admin
      .from('gondolero_distri_solicitudes')
      .update({ estado: 'terminada', updated_at: now })
      .eq('gondolero_id', gondoleroId)
      .eq('distri_id', distriId)
      .eq('estado', 'aprobada'),

    // Limpiar distri_id del profile del gondolero solo si apunta a esta distri
    admin
      .from('profiles')
      .update({ distri_id: null })
      .eq('id', gondoleroId)
      .eq('distri_id', distriId),
  ])

  if (solRes.error) return { error: 'No se pudo desvincular: ' + solRes.error.message }
  if (profileRes.error) return { error: 'No se pudo actualizar el perfil: ' + profileRes.error.message }

  // Notificación al gondolero (fire-and-forget, no bloqueante)
  try {
    await admin.from('notificaciones').insert({
      gondolero_id: gondoleroId,
      actor_id:     gondoleroId,
      actor_tipo:   'gondolero',
      tipo:         'desvinculacion_distri',
      titulo:       'Fuiste desvinculado',
      mensaje:      mensajeDesvinculacion(distriNombre, cierre.resumen),
      leida:        false,
    })
  } catch { /* ignorar si la notificación falla */ }

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
