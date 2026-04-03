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

export async function guardarConfigCompresion(
  maxKb: number,
  maxWidth: number,
  calidad: number
): Promise<{ error?: string }> {
  const admin = await getAdmin()

  const upserts = [
    { clave: 'compresion_max_kb',    valor: String(maxKb),    descripcion: 'Tamaño máximo de foto en KB tras compresión' },
    { clave: 'compresion_max_width', valor: String(maxWidth), descripcion: 'Ancho máximo en px' },
    { clave: 'compresion_calidad',   valor: String(calidad),  descripcion: 'Calidad JPEG inicial (0.1–1.0)' },
  ]

  const { error } = await admin
    .from('configuracion')
    .upsert(upserts, { onConflict: 'clave' })

  if (error) return { error: error.message }
  revalidatePath('/admin/configuracion')
  return {}
}
