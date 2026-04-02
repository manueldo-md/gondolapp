'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function validarComercio(comercioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id
  if (!distriId) return { error: 'No tenés una distribuidora asociada.' }

  // Solo puede validar comercios registrados por gondoleros de su distri
  const { data: gondolerosData } = await admin
    .from('profiles')
    .select('id')
    .eq('distri_id', distriId)
    .eq('tipo_actor', 'gondolero')

  const gondoleroIds = (gondolerosData ?? []).map((g: { id: string }) => g.id)

  const { data: comercio } = await admin
    .from('comercios')
    .select('id, registrado_por')
    .eq('id', comercioId)
    .single()

  if (!comercio) return { error: 'Comercio no encontrado.' }

  // Verificar que lo registró un gondolero de esta distri (o sin registrado_por = admin)
  if (comercio.registrado_por && !gondoleroIds.includes(comercio.registrado_por)) {
    return { error: 'No tenés permiso para validar este comercio.' }
  }

  await admin
    .from('comercios')
    .update({ validado: true })
    .eq('id', comercioId)

  revalidatePath('/distribuidora/comercios')
}
