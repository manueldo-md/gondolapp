'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function crearCampanaInterna(formData: FormData) {
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
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id
  if (!distriId) return { error: 'No tenés una distribuidora asociada.' }

  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                      formData.get('nombre') as string,
      tipo:                        'interna',
      instruccion:                 (formData.get('instruccion') as string) || null,
      puntos_por_foto:             parseInt(formData.get('puntos_por_foto') as string) || 0,
      fecha_inicio:                (formData.get('fecha_inicio') as string) || null,
      fecha_fin:                   (formData.get('fecha_fin') as string) || null,
      objetivo_comercios:          parseInt(formData.get('objetivo_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar:   parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      distri_id:                   distriId,
      financiada_por:              'distri',
      estado:                      'activa',
      tokens_creacion:             0,
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  // Crear bloque de foto genérico
  const instruccion = (formData.get('instruccion') as string) || 'Fotografiá la góndola'
  const tipoContenido = (formData.get('tipo_contenido') as string) || 'propios'
  await admin.from('bloques_foto').insert({
    campana_id:     campana.id,
    orden:          1,
    instruccion,
    tipo_contenido: tipoContenido,
  })

  revalidatePath('/distribuidora/campanas')
  redirect('/distribuidora/campanas')
}
