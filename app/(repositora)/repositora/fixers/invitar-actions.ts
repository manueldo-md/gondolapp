'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { appUrl } from '@/lib/app-url'
import { revisarCodigo } from '@/lib/codigo-gondolero'
import { crearNotificacionActor } from '@/lib/notificaciones'
import { repositoraDeLaSesion } from '@/lib/actor-sesion'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacionFixer(
  repoId: string,
  repoNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const token = randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('fixer_invitacion_tokens').insert({
    token,
    tipo: 'repositora',
    actor_id: repoId,
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = appUrl()
  const link = `${baseUrl}/fixer-vinculacion?token=${token}`
  return { link }
}

export async function buscarFixerPorCodigo(
  codigo: string,
  repoId: string
): Promise<{ fixer?: { id: string; alias: string | null; nombre: string | null }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Se normaliza y se rechaza por PREFIJO antes de consultar. Ver
  // lib/codigo-gondolero.ts. La sugerencia no manda a otra sección porque el
  // panel de repositora no tiene gondoleros: mandarla ahí sería mandarla a una
  // pantalla que no existe.
  const revisado = revisarCodigo(codigo, 'fixer', 'Los fixers tienen códigos propios.')
  if (revisado.error) return { error: revisado.error }

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, alias, nombre, tipo_actor')
    .eq('codigo_gondolero', revisado.codigo)
    .maybeSingle()

  if (!perfil) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  if (perfil.tipo_actor !== 'fixer') {
    return { error: 'Código no encontrado. Verificá que sea correcto.' }
  }

  const fixer = perfil

  // Verificar si ya existe vínculo aprobado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existente } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .select('estado')
    .eq('fixer_id', fixer.id)
    .eq('repositora_id', repoId)
    .maybeSingle()

  if (existente?.estado === 'aprobada') {
    return { error: 'Este fixer ya está vinculado a tu repositora.' }
  }

  return { fixer: { id: fixer.id, alias: fixer.alias, nombre: fixer.nombre } }
}

export async function vincularFixerPorCodigo(
  fixerId: string,
  repoId: string,
  repoNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .upsert(
      { fixer_id: fixerId, repositora_id: repoId, estado: 'pendiente', updated_at: new Date().toISOString() },
      { onConflict: 'fixer_id,repositora_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Por el helper: chequea el error y lo loguea. Venía rebotando contra el
  // CHECK de `tipo`, sin que nadie lo mirara — ver lib/notificaciones.ts.
  await crearNotificacionActor(fixerId, true, {
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${repoNombre} quiere vincularte`,
    mensaje: `La repositora ${repoNombre} te invitó a unirte. Revisá tu perfil para aceptar o rechazar.`,
  })

  revalidatePath('/repositora/fixers')
  return {}
}

export async function aprobarSolicitudFixer(
  solicitudId: string,
  fixerId: string,
  repoId: string,
  repoNombre?: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: error.message }

  // ── EL VÍNCULO VIVE EN LA TABLA DE SOLICITUDES, NO EN ESTA COLUMNA ─────────
  //
  // `profiles.repositora_id` es "la repositora principal" del fixer, y hasta el
  // 24/9/2026 esta línea la PISABA sin condición. Un fixer vinculado a A que se
  // postulaba a B y era aprobado quedaba con B en el perfil: sin desvincularse
  // de A, sin cerrarle las participaciones, y sin que nadie se enterara.
  //
  // Un fixer puede estar vinculado a varias repositoras a la vez —lo dice el
  // array `misRepoIds` de lib/acceso-campana.ts y lo permite el UNIQUE por par—
  // así que el vínculo NUEVO ya quedó registrado arriba, en la tabla, que es la
  // fuente. La columna solo se llena si está vacía, que es el mismo criterio que
  // ya usaba el camino del link de invitación (`fixer-vinculacion/actions.ts`)
  // y con el que esta acción estaba en contradicción.
  const { data: perfil, error: perfilError } = await admin
    .from('profiles').select('repositora_id').eq('id', fixerId).single()
  if (perfilError) {
    console.error('[aprobarSolicitudFixer] no se pudo leer el perfil:', perfilError.message, { fixerId })
  } else if (!perfil?.repositora_id) {
    const { error: setError } = await admin
      .from('profiles').update({ repositora_id: repoId }).eq('id', fixerId)
    if (setError) {
      console.error('[aprobarSolicitudFixer] no se pudo setear repositora_id:', setError.message, { fixerId })
    }
  }

  // Esta notificación NO EXISTÍA. El fixer aprobado por una repositora no se
  // enteraba de nada: ni un aviso, ni un cambio visible hasta que entrara a
  // buscar. El camino equivalente de la distri sí la tenía (y rebotaba, ver la
  // migración 20260924100000).
  await crearNotificacionActor(fixerId, true, {
    tipo:    'solicitud_aprobada',
    titulo:  '¡Postulación aprobada!',
    mensaje: repoNombre
      ? `Ya sos parte de ${repoNombre}. Mirá las campañas disponibles.`
      : 'Tu postulación fue aprobada. Mirá las campañas disponibles.',
  })

  revalidatePath('/repositora/fixers')
  return {}
}

/**
 * El rechazo NO borra la fila: queda en `'rechazada'` con su `rechazada_at`, que
 * es lo que manda la ventana de 30 días para volver a postularse (etapa 6).
 *
 * `rechazada_at` propia y no `updated_at`: esa marca la mueve cualquier
 * escritura futura, y acá decide si alguien puede trabajar.
 */
export async function rechazarSolicitudFixer(
  solicitudId: string,
  fixerId?: string,
  repoNombre?: string,
  motivo?: string | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const ahora = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({
      estado:         'rechazada',
      motivo_rechazo: motivo ?? null,
      rechazada_at:   ahora,
      updated_at:     ahora,
    })
    .eq('id', solicitudId)

  if (error) return { error: error.message }

  // El fixer se entera, con el motivo si lo hubo. Sin aviso, la postulación se
  // quedaría en "enviada" para siempre desde su lado.
  if (fixerId) {
    await crearNotificacionActor(fixerId, true, {
      tipo:    'solicitud_rechazada',
      titulo:  'Tu postulación no fue aceptada',
      mensaje: motivo
        ? `${repoNombre ?? 'La repositora'} no aceptó tu postulación: ${motivo}`
        : `${repoNombre ?? 'La repositora'} no aceptó tu postulación por ahora.`,
    })
  }

  revalidatePath('/repositora/fixers')
  return {}
}

export async function desvincularFixer(
  fixerId: string,
  repoNombre: string
): Promise<{ error?: string }> {
  // ── Ésta era la peor de las cinco ─────────────────────────────────────────
  // Sus dos hermanas de distribuidora al menos comparaban el `distriId` del
  // cliente contra `perfil.distri_id`. **Ésta no chequeaba nada**: `getUser()`
  // y directo a escribir con el `repoId` que mandara el cliente. Cualquier
  // autenticado podía desvincular a cualquier fixer de cualquier repositora,
  // terminarle la solicitud y limpiarle el `repositora_id` del perfil.
  //
  // El middleware no la tapaba: chequea `startsWith('/repositora')`, no CUÁL
  // repositora.
  const admin = adminClient()
  const repoId = await repositoraDeLaSesion(admin)
  if (!repoId) redirect('/auth')

  const now = new Date().toISOString()

  const [solRes, profileRes] = await Promise.all([
    // Marcar solicitud como terminada
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .update({ estado: 'terminada', updated_at: now })
      .eq('fixer_id', fixerId)
      .eq('repositora_id', repoId)
      .eq('estado', 'aprobada'),

    // Limpiar repositora_id del profile si apunta a esta repositora
    admin
      .from('profiles')
      .update({ repositora_id: null })
      .eq('id', fixerId)
      .eq('repositora_id', repoId),
  ])

  if (solRes.error) return { error: 'No se pudo desvincular: ' + solRes.error.message }
  if (profileRes.error) return { error: 'No se pudo actualizar el perfil: ' + profileRes.error.message }

  // Notificación al fixer
  try {
    await admin.from('notificaciones').insert({
      gondolero_id: fixerId,
      actor_id:     fixerId,
      actor_tipo:   'fixer',
      tipo:         'desvinculacion_repositora',
      titulo:       'Fuiste desvinculado',
      mensaje:      `Tu relación con ${repoNombre} fue terminada.`,
      leida:        false,
    })
  } catch { /* ignorar si la notificación falla */ }

  revalidatePath('/repositora/fixers')
  return {}
}
