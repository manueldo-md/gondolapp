'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { crearNotificacionActor } from '@/lib/notificaciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: solicitudError } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (solicitudError) return { error: 'No se pudo aprobar. ' + solicitudError.message }

  // ── EL VÍNCULO VIVE EN LA TABLA, NO EN ESTA COLUMNA ───────────────────────
  //
  // Igual que en el camino de la repositora: `profiles.distri_id` es "la distri
  // principal", y pisarla movía de equipo a un fixer que ya trabajaba para otra,
  // sin desvincularlo ni cerrarle nada. Un fixer puede estar vinculado a varias
  // a la vez. El vínculo nuevo ya quedó arriba, en la tabla, que es la fuente
  // que lee `getDistrisDeActor`.
  //
  // Solo se llena si está vacía — el mismo criterio del link de invitación, con
  // el que esta acción estaba en contradicción.
  const { data: perfil, error: perfilError } = await admin
    .from('profiles').select('distri_id').eq('id', fixerId).single()
  if (perfilError) {
    console.error('[aprobarSolicitudFixer] no se pudo leer el perfil:', perfilError.message, { fixerId })
  } else if (!perfil?.distri_id) {
    const { error: setError } = await admin
      .from('profiles').update({ distri_id: distriId }).eq('id', fixerId)
    if (setError) {
      console.error('[aprobarSolicitudFixer] no se pudo setear distri_id:', setError.message, { fixerId })
    }
  }

  // Por el helper: chequea el error y lo loguea. Este aviso venía rebotando
  // entero —el CHECK de `actor_tipo` no aceptaba 'fixer' hasta el 24/9/2026—
  // aunque el `tipo` fuera válido. Un fixer nunca supo que lo habían aprobado.
  await crearNotificacionActor(fixerId, true, {
    tipo:    'solicitud_aprobada',
    titulo:  '¡Solicitud aprobada!',
    mensaje: `Ya sos parte de ${distriNombre}. ¡Bienvenido al equipo!`,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}

/**
 * El rechazo NO borra la fila: queda en `'rechazada'` con su `rechazada_at`, que
 * es lo que manda la ventana de 30 días para volver a postularse (etapa 6).
 */
export async function rechazarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  distriNombre: string,
  motivo?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const ahora = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .update({
      estado:         'rechazada',
      motivo_rechazo: motivo ?? null,
      rechazada_at:   ahora,
      updated_at:     ahora,
    })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo rechazar. ' + error.message }

  // Por el helper: chequea el error y lo loguea. Este aviso venía rebotando
  // entero —el CHECK de `actor_tipo` no aceptaba 'fixer' hasta el 24/9/2026—
  // aunque el `tipo` fuera válido.
  await crearNotificacionActor(fixerId, true, {
    tipo:    'solicitud_rechazada',
    titulo:  'Tu postulación no fue aceptada',
    mensaje: motivo
      ? `${distriNombre} no aceptó tu postulación: ${motivo}`
      : `${distriNombre} no aceptó tu postulación por ahora.`,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}
