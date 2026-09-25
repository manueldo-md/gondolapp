'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cerrarVinculacion, previsualizarCierre, type ResumenCierre } from '@/lib/cerrar-vinculacion'
import { crearNotificacionActor } from '@/lib/notificaciones'
import { distriDeLaSesion } from '@/lib/actor-sesion'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Verifica si el fixer puede ser desvinculado de la distribuidora.
 * Bloquea si tiene participaciones activas en campañas de esa distri con actor_campana='fixer'.
 */
// Ya no bloquea: el trabajo en curso se cierra. Misma decisión y mismo helper
// que el lado gondolero — ver lib/cerrar-vinculacion.ts. El nombre viejo queda
// para no tocar el botón en este tramo; lo que cambió es que nadie lo usa para
// impedir nada.
export async function previsualizarDesvincularFixer(
  fixerId: string,
): Promise<ResumenCierre> {
  // Mismo caso que la de gondoleros: no llamaba a `getUser()` y el `distriId`
  // venía del cliente. Ver el comentario largo allá.
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  return previsualizarCierre({ gondoleroId: fixerId, distriId, admin, iniciadoPor: 'distri' })
}

// `verificarDesvincularFixer` se borró el 18/9/2026. Bloqueaba la desvinculación
// cuando el fixer tenía participaciones activas, que es lo contrario de lo que
// hace el sistema ahora: el trabajo en curso SE CIERRA. Su reemplazo es
// `previsualizarDesvincularFixer`, acá arriba, que cuenta lo mismo para avisarlo.
//
// Quedó sin llamadores entre el commit que cableó `cerrarVinculacion` y el que
// arregló el botón — o sea que durante ese rato la action cerraba el trabajo y el
// botón seguía bloqueando. Se borra para que no vuelva a enchufarse por error.

/**
 * Desvincula al fixer de la distribuidora:
 * - Marca la solicitud como 'terminada'
 * - Limpia distri_id del profile si apunta a esta distri
 * - Envía notificación al fixer
 */
export async function desvincularFixer(
  fixerId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  // El chequeo contra `perfil.distri_id` que había acá ya no hace falta: el id
  // ahora ES el de la sesión, así que no hay nada contra qué compararlo.
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const now = new Date().toISOString()

  // Cerrar el trabajo en curso antes de cortar el vínculo, igual que del lado
  // gondolero. Un fixer participa de campañas con la misma tabla y las mismas
  // columnas: el helper es el mismo. Ver lib/cerrar-vinculacion.ts.
  const cierre = await cerrarVinculacion({ gondoleroId: fixerId, distriId, admin, iniciadoPor: 'distri' })
  if (!cierre.ok) return { error: cierre.error }

  const [solRes, profileRes] = await Promise.all([
    // Terminar la solicitud en fixer_distri_solicitudes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_distri_solicitudes')
      .update({ estado: 'terminada', updated_at: now })
      .eq('fixer_id', fixerId)
      .eq('distri_id', distriId)
      .eq('estado', 'aprobada'),

    // Limpiar distri_id del profile del fixer solo si apunta a esta distri
    admin
      .from('profiles')
      .update({ distri_id: null })
      .eq('id', fixerId)
      .eq('distri_id', distriId),
  ])

  if (solRes.error) return { error: 'No se pudo desvincular: ' + solRes.error.message }
  if (profileRes.error) return { error: 'No se pudo actualizar el perfil: ' + profileRes.error.message }

  // Notificación al fixer (fire-and-forget)
  // El try/catch se fue: supabase-js NO lanza ante un error de Postgres, lo
  // devuelve en `.error`, así que ese catch no atrapaba nada y el fallo era
  // invisible igual. El helper lo chequea y lo loguea, y sigue sin cortar el
  // flujo — que era la intención del fire-and-forget y se mantiene.
  //
  // Este aviso venía rebotando: el CHECK de `actor_tipo` no aceptaba 'fixer'.
  await crearNotificacionActor(fixerId, true, {
    tipo:    'desvinculacion_distri',
    titulo:  'Fuiste desvinculado',
    mensaje: `Tu relación con ${distriNombre} fue terminada. Podés solicitar vinculación a otra distribuidora desde tu perfil.`,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}
