'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function unirseACampana(campanaId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

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

  if (error) {
    throw new Error('No pudimos inscribirte. Intentá de nuevo.')
  }

  redirect('/gondolero/misiones')
}
