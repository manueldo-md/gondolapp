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

async function getDistriId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single() as { data: { distri_id: string | null } | null }
  return profile?.distri_id ?? null
}

export async function aprobarComercioDistri(id: string) {
  const distriId = await getDistriId()
  if (!distriId) redirect('/auth')

  const admin = adminClient()

  // Verificar que la campaña de este comercio pertenece a la distri
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comercio } = await (admin as any)
    .from('comercios')
    .select('campana_id')
    .eq('id', id)
    .maybeSingle() as { data: { campana_id: string | null } | null }

  if (comercio?.campana_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: campana } = await (admin as any)
      .from('campanas')
      .select('distri_id')
      .eq('id', comercio.campana_id)
      .maybeSingle() as { data: { distri_id: string | null } | null }
    if (campana?.distri_id !== distriId) {
      return { error: 'No tenés permiso para aprobar este comercio.' }
    }
  }

  const { error } = await admin
    .from('comercios')
    .update({ estado: 'activo', validado: true })
    .eq('id', id)

  if (error) return { error: 'No se pudo aprobar el comercio: ' + error.message }

  // Acreditar bounty retenido
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fotos } = await (admin as any)
    .from('fotos')
    .select('id, gondolero_id, campana_id')
    .eq('comercio_id', id)
    .eq('bounty_estado', 'retenido')

  if (fotos && fotos.length > 0) {
    for (const foto of fotos as { id: string; gondolero_id: string; campana_id: string }[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any).from('fotos').update({ bounty_estado: 'acreditado', estado: 'aprobada' }).eq('id', foto.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campana } = await (admin as any)
        .from('campanas').select('puntos_por_foto').eq('id', foto.campana_id).maybeSingle() as { data: { puntos_por_foto: number } | null }
      const puntos = campana?.puntos_por_foto ?? 0
      if (puntos > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any).from('movimientos_puntos').insert({
          gondolero_id: foto.gondolero_id, tipo: 'credito', monto: puntos,
          concepto: 'Comercio nuevo validado', campana_id: foto.campana_id, foto_id: foto.id,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (admin as any).from('profiles').select('puntos_disponibles').eq('id', foto.gondolero_id).maybeSingle() as { data: { puntos_disponibles: number } | null }
        if (profile) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (admin as any).from('profiles').update({ puntos_disponibles: (profile.puntos_disponibles ?? 0) + puntos }).eq('id', foto.gondolero_id)
        }
      }
    }
  }

  revalidatePath('/distribuidora/comercios/pendientes')
  revalidatePath('/distribuidora/comercios')
  return { ok: true }
}

export async function rechazarComercioDistri(id: string) {
  const distriId = await getDistriId()
  if (!distriId) redirect('/auth')

  const admin = adminClient()

  const { error } = await admin
    .from('comercios')
    .update({ estado: 'rechazado', validado: false })
    .eq('id', id)

  if (error) return { error: 'No se pudo rechazar el comercio: ' + error.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('fotos')
    .update({ bounty_estado: 'anulado', estado: 'rechazada' })
    .eq('comercio_id', id)
    .eq('bounty_estado', 'retenido')

  revalidatePath('/distribuidora/comercios/pendientes')
  revalidatePath('/distribuidora/comercios')
  return { ok: true }
}
