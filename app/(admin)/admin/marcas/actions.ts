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

export async function validarMarca(marcaId: string) {
  const admin = await getAdmin()
  await admin.from('marcas').update({ validada: true }).eq('id', marcaId)
  revalidatePath('/admin/marcas')
  revalidatePath('/admin/tablero')
}

export async function crearMarca(payload: {
  razon_social: string
  cuit: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('marcas').insert({
    razon_social: payload.razon_social,
    cuit: payload.cuit,
    validada: false,
    tokens_disponibles: 0,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/marcas')
  return {}
}
