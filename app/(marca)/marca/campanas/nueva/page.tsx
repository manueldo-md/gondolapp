import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { NuevaCampanaForm } from './form'

export default async function NuevaCampanaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId = profile?.marca_id ?? null

  // Distribuidoras vinculadas activas
  let distrisVinculadas: { id: string; razon_social: string }[] = []
  if (marcaId) {
    const { data: relaciones } = await admin
      .from('marca_distri_relaciones')
      .select('distri_id, distribuidoras(id, razon_social)')
      .eq('marca_id', marcaId)
      .eq('estado', 'activa')

    if (relaciones) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      distrisVinculadas = relaciones.map((r: any) => {
        const d = Array.isArray(r.distribuidoras) ? r.distribuidoras[0] : r.distribuidoras
        return { id: d?.id ?? r.distri_id, razon_social: d?.razon_social ?? 'Distribuidora' }
      }).filter((d: { id: string; razon_social: string }) => d.id)
    }
  }

  return <NuevaCampanaForm distrisVinculadas={distrisVinculadas} />
}
