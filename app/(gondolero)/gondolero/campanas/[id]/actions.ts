'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function unirseACampana(campanaId: string): Promise<{ error: string } | void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Verificar campaña activa y validar restricciones
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (supabase as any)
    .from('campanas')
    .select('id, fecha_limite_inscripcion, tope_total_comercios, comercios_relevados')
    .eq('id', campanaId)
    .eq('estado', 'activa')
    .single() as { data: { id: string; fecha_limite_inscripcion: string | null; tope_total_comercios: number | null; comercios_relevados: number } | null }

  if (!campana) return { error: 'La campaña no está disponible.' }

  // Validar fecha límite de inscripción
  if (campana.fecha_limite_inscripcion && new Date(campana.fecha_limite_inscripcion) < new Date()) {
    return { error: 'El período de inscripción ya cerró.' }
  }

  // Validar tope total de comercios
  if (campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios) {
    return { error: 'Esta campaña ya alcanzó su cupo máximo.' }
  }

  // Si ya está inscripto y activo, redirigir directo a misiones
  const { data: existente } = await supabase
    .from('participaciones')
    .select('id')
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle()

  if (existente) {
    redirect(`/gondolero/misiones/${campanaId}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('participaciones')
    .insert({
      campana_id: campanaId,
      gondolero_id: user.id,
    })

  if (error) return { error: 'No pudimos inscribirte. Intentá de nuevo.' }

  redirect('/gondolero/misiones')
}
