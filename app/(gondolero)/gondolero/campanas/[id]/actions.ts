'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const NIVEL_ORDEN: Record<string, number> = { casual: 0, activo: 1, pro: 2 }

export async function unirseACampana(campanaId: string): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verificar campaña activa y validar restricciones
  const { data: campana } = await admin
    .from('campanas')
    .select('id, fecha_limite_inscripcion, tope_total_comercios, comercios_relevados, nivel_minimo')
    .eq('id', campanaId)
    .eq('estado', 'activa')
    .single() as {
      data: {
        id: string
        fecha_limite_inscripcion: string | null
        tope_total_comercios: number | null
        comercios_relevados: number
        nivel_minimo: string | null
      } | null
    }

  if (!campana) return { error: 'La campaña no está disponible.' }

  // Validar fecha límite de inscripción
  if (campana.fecha_limite_inscripcion && new Date(campana.fecha_limite_inscripcion) < new Date()) {
    return { error: 'El período de inscripción ya cerró.' }
  }

  // Validar tope total de comercios
  if (campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios) {
    return { error: 'Esta campaña ya alcanzó su cupo máximo.' }
  }

  // Validar nivel del gondolero
  const nivelMinimo = campana.nivel_minimo ?? 'casual'
  if (nivelMinimo !== 'casual') {
    const { data: profile } = await admin
      .from('profiles')
      .select('nivel')
      .eq('id', user.id)
      .single() as { data: { nivel: string } | null }

    const gondoleroNivel = profile?.nivel ?? 'casual'
    if ((NIVEL_ORDEN[gondoleroNivel] ?? 0) < (NIVEL_ORDEN[nivelMinimo] ?? 0)) {
      const NIVEL_LABEL: Record<string, string> = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }
      return { error: `Esta campaña requiere nivel ${NIVEL_LABEL[nivelMinimo] ?? nivelMinimo}. Tu nivel actual es ${NIVEL_LABEL[gondoleroNivel] ?? gondoleroNivel}.` }
    }
  }

  // Buscar cualquier participación existente (cualquier estado)
  const { data: existente, error: existenteError } = await admin
    .from('participaciones')
    .select('id, estado')
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .maybeSingle()

  console.log('[unirse] existente:', existente, 'error:', existenteError)

  if (existente?.estado === 'activa') {
    redirect(`/gondolero/misiones/${campanaId}`)
  }

  if (existente) {
    // Ya existe fila (completada/abandonada) → UPDATE para reactivar
    console.log('[unirse] haciendo UPDATE de id:', existente.id)
    const { error } = await admin
      .from('participaciones')
      .update({
        estado:                'activa',
        comercios_completados: 0,
        puntos_acumulados:     0,
        joined_at:             new Date().toISOString(),
      })
      .eq('id', existente.id)

    console.log('[unirse] UPDATE error:', error)
    if (error) return { error: `No pudimos reactivar tu inscripción: ${error.message}` }
  } else {
    // Primera vez → INSERT
    console.log('[unirse] haciendo INSERT')
    const { error } = await admin
      .from('participaciones')
      .insert({
        campana_id:            campanaId,
        gondolero_id:          user.id,
        estado:                'activa',
        comercios_completados: 0,
        puntos_acumulados:     0,
      })

    console.log('[unirse] INSERT error:', error)
    if (error) return { error: `No pudimos inscribirte: ${error.message}` }
  }

  revalidatePath('/gondolero/misiones')
  revalidatePath('/gondolero/campanas')
  redirect('/gondolero/misiones')
}
