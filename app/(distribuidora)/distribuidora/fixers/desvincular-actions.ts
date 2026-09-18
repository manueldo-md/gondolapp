'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cerrarVinculacion, previsualizarCierre, type ResumenCierre } from '@/lib/cerrar-vinculacion'

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
  distriId: string,
): Promise<ResumenCierre> {
  return previsualizarCierre({ gondoleroId: fixerId, distriId, admin: adminClient(), iniciadoPor: 'distri' })
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
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que el usuario pertenece a esta distribuidora
  const { data: perfil } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  if (perfil?.distri_id !== distriId) {
    return { error: 'No tenés permiso para desvincular este fixer.' }
  }

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
  try {
    await admin.from('notificaciones').insert({
      gondolero_id: fixerId,
      actor_id:     fixerId,
      actor_tipo:   'fixer',
      tipo:         'desvinculacion_distri',
      titulo:       'Fuiste desvinculado',
      mensaje:      `Tu relación con ${distriNombre} fue terminada. Podés solicitar vinculación a otra distribuidora desde tu perfil.`,
      leida:        false,
    })
  } catch { /* ignorar si la notificación falla */ }

  revalidatePath('/distribuidora/fixers')
  return {}
}
