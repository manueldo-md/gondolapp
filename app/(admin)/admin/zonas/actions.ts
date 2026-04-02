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

export async function crearZona(datos: {
  nombre: string
  tipo: 'ciudad' | 'provincia' | 'region'
  lat?: number | null
  lng?: number | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('zonas').insert({
    nombre: datos.nombre.trim(),
    tipo: datos.tipo,
    lat: datos.lat ?? null,
    lng: datos.lng ?? null,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/zonas')
  return {}
}

export async function editarZona(
  id: string,
  datos: {
    nombre: string
    tipo: 'ciudad' | 'provincia' | 'region'
    lat?: number | null
    lng?: number | null
  }
): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('zonas').update({
    nombre: datos.nombre.trim(),
    tipo: datos.tipo,
    lat: datos.lat ?? null,
    lng: datos.lng ?? null,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/zonas')
  return {}
}

export async function eliminarZona(id: string): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.from('zonas').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/zonas')
  return {}
}
