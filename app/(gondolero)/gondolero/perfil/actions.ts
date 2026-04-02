'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoPremio } from '@/types'

const COSTO_CANJE: Record<TipoPremio, number> = {
  credito_celular: 300,
  nafta_ypf:       500,
  giftcard_ml:     1000,
  transferencia:   2000,
}

export async function solicitarCanje(premio: TipoPremio) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const puntos = COSTO_CANJE[premio]

  // Verificar puntos disponibles
  const { data: profile } = await admin
    .from('profiles')
    .select('puntos_disponibles, nivel')
    .eq('id', user.id)
    .single()

  if (!profile || profile.puntos_disponibles < puntos) {
    return { error: 'No tenés suficientes puntos para este canje.' }
  }

  // Transferencia solo para nivel Pro
  if (premio === 'transferencia' && profile.nivel !== 'pro') {
    return { error: 'La transferencia bancaria es solo para gondoleros nivel Pro.' }
  }

  // Insertar canje
  const { error: errCanje } = await admin.from('canjes').insert({
    gondolero_id: user.id,
    premio,
    puntos,
    estado: 'pendiente',
  })

  if (errCanje) return { error: 'No se pudo registrar el canje. Intentá de nuevo.' }

  // Registrar movimiento débito
  await admin.from('movimientos_puntos').insert({
    gondolero_id: user.id,
    tipo:    'debito',
    monto:   puntos,
    concepto: `Canje solicitado: ${premio.replace(/_/g, ' ')}`,
  })

  // Descontar puntos del perfil
  await admin
    .from('profiles')
    .update({ puntos_disponibles: profile.puntos_disponibles - puntos })
    .eq('id', user.id)

  revalidatePath('/gondolero/perfil')
  return { ok: true }
}

export async function actualizarPerfil({ nombre, celular }: { nombre: string; celular?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('profiles')
    .update({ nombre: nombre.trim(), celular: celular?.trim() || null })
    .eq('id', user.id)

  revalidatePath('/gondolero/perfil')
  revalidatePath('/gondolero/perfil/editar')
}

export async function actualizarZonasGondolero(zonaIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Reemplazar todas las zonas del gondolero
  await admin.from('gondolero_zonas').delete().eq('gondolero_id', user.id)

  if (zonaIds.length > 0) {
    await admin.from('gondolero_zonas').insert(
      zonaIds.map(zona_id => ({ gondolero_id: user.id, zona_id }))
    )
  }

  revalidatePath('/gondolero/perfil')
  revalidatePath('/gondolero/campanas')
}

export async function marcarNotificacionesLeidas(gondoleroId: string) {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('notificaciones')
    .update({ leida: true })
    .eq('gondolero_id', gondoleroId)
    .eq('leida', false)

  revalidatePath('/gondolero/perfil')
}
