'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoCampana, TipoContenidoBloque } from '@/types'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function crearCampanaAdmin(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que el usuario sea admin
  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'admin') {
    return { error: 'No tenés permiso para realizar esta acción.' }
  }

  // Crear campaña
  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                      formData.get('nombre') as string,
      tipo:                        formData.get('tipo') as TipoCampana,
      instruccion:                 (formData.get('instruccion') as string) || null,
      puntos_por_foto:             parseInt(formData.get('puntos_por_foto') as string) || 0,
      fecha_inicio:                (formData.get('fecha_inicio') as string) || null,
      fecha_fin:                   (formData.get('fecha_fin') as string) || null,
      objetivo_comercios:          parseInt(formData.get('objetivo_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar:   parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      marca_id:                    null,
      distri_id:                   null,
      financiada_por:              'gondolapp',
      estado:                      'activa',
      tokens_creacion:             0,
      actor_campana:               (formData.get('actor_campana') as string) || 'gondolero',
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  const campanaId = campana.id

  // Crear bloque de foto
  const instruccionBloque = (formData.get('instruccion_bloque') as string) || (formData.get('instruccion') as string) || ''
  const tipoContenido = (formData.get('tipo_contenido') as TipoContenidoBloque) || 'propios'
  const solicitarPrecio = formData.get('solicitar_precio') === 'true'

  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:       campanaId,
    orden:            1,
    instruccion:      instruccionBloque,
    tipo_contenido:   tipoContenido,
    solicitar_precio: solicitarPrecio,
  }).select('id').single()

  // Insertar campos dinámicos del bloque (si los hay)
  const camposJson = formData.get('campos_json') as string | null
  if (camposJson && bloque?.id) {
    try {
      const campos = JSON.parse(camposJson) as {
        tipo: string; pregunta: string; opciones: string[]
        obligatorio: boolean; orden: number
      }[]
      const camposValidos = campos.filter(c => c.pregunta.trim())
      if (camposValidos.length > 0) {
        await admin.from('bloque_campos').insert(
          camposValidos.map(c => ({
            bloque_id:   bloque.id,
            tipo:        c.tipo,
            pregunta:    c.pregunta.trim(),
            opciones:    c.opciones.filter(Boolean).length > 0 ? c.opciones.filter(Boolean) : null,
            obligatorio: c.obligatorio,
            orden:       c.orden,
          }))
        )
      }
    } catch { /* campos_json inválido — ignorar */ }
  }

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campanaId, localidad_id }))
    )
  }

  revalidatePath('/admin/campanas')
  redirect('/admin/campanas')
}
