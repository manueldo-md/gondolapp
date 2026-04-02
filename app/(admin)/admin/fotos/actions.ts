'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function aprobarFotoAdmin(fotoId: string) {
  const admin = await getAdmin()

  const { data: fotoRaw } = await admin
    .from('fotos')
    .select('gondolero_id, campana_id, campana:campanas(puntos_por_foto, comercios_relevados)')
    .eq('id', fotoId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foto = fotoRaw as any
  const puntosPorFoto: number = foto?.campana?.puntos_por_foto ?? 0

  await admin.from('fotos').update({
    estado: 'aprobada',
    puntos_otorgados: puntosPorFoto,
  }).eq('id', fotoId)

  if (foto?.gondolero_id && puntosPorFoto > 0) {
    await admin.from('movimientos_puntos').insert({
      gondolero_id: foto.gondolero_id,
      tipo: 'credito',
      monto: puntosPorFoto,
      concepto: 'Foto aprobada (admin)',
      campana_id: foto.campana_id,
    })
    await admin.rpc('incrementar_puntos', {
      p_gondolero_id: foto.gondolero_id,
      p_monto: puntosPorFoto,
    })
  }

  revalidatePath('/admin/fotos')
}

export async function rechazarFotoAdmin(fotoId: string) {
  const admin = await getAdmin()
  await admin.from('fotos').update({ estado: 'rechazada', puntos_otorgados: 0 }).eq('id', fotoId)
  revalidatePath('/admin/fotos')
}
