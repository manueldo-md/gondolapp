'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { appUrl } from '@/lib/app-url'
import { revisarCodigo } from '@/lib/codigo-gondolero'
import { crearNotificacionActor } from '@/lib/notificaciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function generarLinkInvitacionFixer(
  distriId: string,
  distriNombre: string
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
    tipo: 'distri',
    actor_id: distriId,
    expira_at: expiraAt,
  })

  if (error) return { error: 'No se pudo generar el link. Intentá de nuevo.' }

  const baseUrl = appUrl()
  const link = `${baseUrl}/fixer-vinculacion?token=${token}`
  return { link }
}

export async function buscarFixerPorCodigo(
  codigo: string,
  distriId: string
): Promise<{ fixer?: { id: string; alias: string | null; nombre: string | null }; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Se normaliza y se rechaza por PREFIJO antes de consultar. El mensaje cruzado
  // ya existía, pero salía solo si el código estaba en la base: un GND mal
  // tipeado o de otro ambiente caía en "no encontrado", indistinguible de un
  // typo. Ver lib/codigo-gondolero.ts.
  const revisado = revisarCodigo(codigo, 'fixer',
    'Para vincularlo andá a la sección Gondoleros de tu panel.')
  if (revisado.error) return { error: revisado.error }

  const { data: perfil } = await admin
    .from('profiles')
    .select('id, alias, nombre, tipo_actor')
    .eq('codigo_gondolero', revisado.codigo)
    .maybeSingle()

  if (!perfil) return { error: 'Código no encontrado. Verificá que sea correcto.' }

  // El prefijo ya garantiza el tipo salvo que la base esté inconsistente —el
  // trigger `profiles_sincronizar_codigo` lo impide—, pero el chequeo se queda:
  // es el que decide, y no se apoya en un prefijo que es una convención.
  if (perfil.tipo_actor !== 'fixer') {
    return { error: 'Código no encontrado. Verificá que sea correcto.' }
  }

  const fixer = perfil

  // Verificar si ya existe vínculo aprobado
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existente } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .select('estado')
    .eq('fixer_id', fixer.id)
    .eq('distri_id', distriId)
    .maybeSingle()

  if (existente?.estado === 'aprobada') {
    return { error: 'Este fixer ya está vinculado a tu distribuidora.' }
  }

  return { fixer: { id: fixer.id, alias: fixer.alias, nombre: fixer.nombre } }
}

export async function confirmarVinculacionPorCodigo(
  fixerId: string,
  distriId: string,
  distriNombre: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_distri_solicitudes')
    .upsert(
      { fixer_id: fixerId, distri_id: distriId, estado: 'pendiente', iniciado_por: 'distri', updated_at: new Date().toISOString() },
      { onConflict: 'fixer_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la invitación. Intentá de nuevo.' }

  // Por el helper y no con un insert suelto: chequea el error y lo loguea. Este
  // mismo aviso venía REBOTANDO —el CHECK de `tipo` no aceptaba
  // 'vinculacion_invitacion'— y como nadie miraba el error, ningún fixer se
  // enteró nunca de que lo habían invitado.
  //
  // No corta el flujo si falla: la solicitud ya quedó registrada, y perderla por
  // un aviso sería peor que el aviso que se pierde.
  await crearNotificacionActor(fixerId, true, {
    tipo: 'vinculacion_invitacion',
    titulo: `📦 ${distriNombre} quiere vincularte`,
    mensaje: `La distribuidora ${distriNombre} te invitó a unirte a su equipo. Revisá tu perfil para aceptar o rechazar.`,
  })

  revalidatePath('/distribuidora/fixers')
  return {}
}
