'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarComercio(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Marcar comercio como activo y validado
  const { error } = await admin
    .from('comercios')
    .update({ estado: 'activo', validado: true })
    .eq('id', id)

  if (error) return { error: 'No se pudo aprobar el comercio: ' + error.message }

  // Acreditar puntos retenidos: buscar fotos con bounty_estado='retenido' de este comercio
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fotos } = await (admin as any)
    .from('fotos')
    .select('id, gondolero_id, campana_id, puntos_otorgados')
    .eq('comercio_id', id)
    .eq('bounty_estado', 'retenido')

  if (fotos && fotos.length > 0) {
    for (const foto of fotos as { id: string; gondolero_id: string; campana_id: string; puntos_otorgados: number }[]) {
      // Actualizar estado del bounty
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from('fotos')
        .update({ bounty_estado: 'acreditado', estado: 'aprobada' })
        .eq('id', foto.id)

      // Acreditar puntos si corresponde (usar puntos de la campaña)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campana } = await (admin as any)
        .from('campanas')
        .select('puntos_por_foto')
        .eq('id', foto.campana_id)
        .maybeSingle() as { data: { puntos_por_foto: number } | null }

      const puntos = campana?.puntos_por_foto ?? 0
      if (puntos > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('movimientos_puntos').insert({
          gondolero_id: foto.gondolero_id,
          tipo:         'credito',
          monto:        puntos,
          concepto:     'Comercio nuevo validado',
          campana_id:   foto.campana_id,
          foto_id:      foto.id,
        })

        // Actualizar puntos_disponibles en profiles
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (admin as any)
          .from('profiles')
          .select('puntos_disponibles')
          .eq('id', foto.gondolero_id)
          .maybeSingle() as { data: { puntos_disponibles: number } | null }

        if (profile) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any)
            .from('profiles')
            .update({ puntos_disponibles: (profile.puntos_disponibles ?? 0) + puntos })
            .eq('id', foto.gondolero_id)
        }
      }
    }
  }

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  return { ok: true }
}

export async function rechazarComercio(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('comercios')
    .update({ estado: 'rechazado', validado: false })
    .eq('id', id)

  if (error) return { error: 'No se pudo rechazar el comercio: ' + error.message }

  // Anular bounty en fotos asociadas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('fotos')
    .update({ bounty_estado: 'anulado', estado: 'rechazada' })
    .eq('comercio_id', id)
    .eq('bounty_estado', 'retenido')

  revalidatePath('/admin/comercios/pendientes')
  revalidatePath('/admin/comercios')
  return { ok: true }
}
