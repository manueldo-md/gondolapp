'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { getConfig } from '@/lib/config'
import { nivelPorMisiones } from '@/lib/nivel-mensual'
import { mejorMesDeMisiones } from '@/lib/nivel-maximo'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { appUrl } from '@/lib/app-url'
import { revisarCodigo } from '@/lib/codigo-gondolero'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacion(
  distriId: string,
  distriNombre: string
): Promise<{ link?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()
  const token = randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('vinculacion_tokens').insert({
    token,
    distri_id: distriId,
    tipo: 'distri_invita',
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = appUrl()
  const link = `${baseUrl}/vinculacion?token=${token}`
  return { link }
}

export async function vincularPorCodigo(
  codigoGondolero: string,
  distriId: string,
  distriNombre: string
): Promise<{ gondolero?: { id: string; alias: string | null; nombre: string | null; nivel: string | null; tipo_actor: string }; error?: string; vinculado?: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Se normaliza y se rechaza por PREFIJO antes de consultar. Ver
  // lib/codigo-gondolero.ts.
  const revisado = revisarCodigo(codigoGondolero, 'gondolero',
    'Para vincularlo andá a la sección Fixers de tu panel.')
  if (revisado.error) return { error: revisado.error }

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, alias, nombre, tipo_actor')
    .eq('codigo_gondolero', revisado.codigo)
    .maybeSingle()

  if (!perfil) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  if (perfil.tipo_actor !== 'gondolero') {
    return { error: 'Código no encontrado. Verificá que sea correcto.' }
  }

  const gondolero = perfil

  // Verificar si ya existe una solicitud aprobada para este par gondolero+distri
  const { data: solicitudExistente } = await admin
    .from('gondolero_distri_solicitudes')
    .select('estado')
    .eq('gondolero_id', gondolero.id)
    .eq('distri_id', distriId)
    .maybeSingle()

  if (solicitudExistente?.estado === 'aprobada') {
    return { error: 'Este gondolero ya está vinculado a tu distribuidora.' }
  }

  // El nivel que se le muestra a la distri al vincular es el MÁXIMO alcanzado,
  // no el del mes: acá está evaluando a quién suma a su equipo, y alguien que
  // llegó a Pro sigue siendo alguien que llegó a Pro. `null` cuando no se pudo
  // medir — el panel muestra un guion, no un "Casual" que nadie contó.
  const config = await getConfig()
  const mejorMes = await mejorMesDeMisiones(gondolero.id, admin)
  const nivel = mejorMes === null
    ? null
    : nivelPorMisiones(mejorMes, config.niveles.fotosCasualAActivo, config.niveles.fotosActivoAPro)

  // Si hay solicitud rechazada, terminada o pendiente → se permite reenviar (upsert)
  return { gondolero: { id: gondolero.id, alias: gondolero.alias, nombre: gondolero.nombre, nivel, tipo_actor: gondolero.tipo_actor } }
}

export async function confirmarVinculacionPorCodigo(
  gondoleroId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Crear solicitud pendiente — el gondolero debe aceptar desde su perfil
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .upsert(
      { gondolero_id: gondoleroId, distri_id: distriId, estado: 'pendiente', iniciado_por: 'distri', updated_at: new Date().toISOString() },
      { onConflict: 'gondolero_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Notificación al gondolero
  await admin.from('notificaciones').insert({
    gondolero_id: gondoleroId,
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${distriNombre} quiere vincularte`,
    mensaje: `La distribuidora ${distriNombre} te invitó a unirte a su equipo. Revisá tu perfil para aceptar o rechazar.`,
    leida: false,
  })

  revalidatePath('/distribuidora/gondoleros')
  return {}
}
