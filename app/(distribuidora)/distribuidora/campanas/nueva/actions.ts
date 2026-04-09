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
      actor_campana:               (formData.get('actor_campana') as string) || 'gondolero',
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    const { error: errZonas } = await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campana.id, localidad_id }))
    )
    if (errZonas) console.error('[crearCampanaInterna] Error insertando campana_localidades:', errZonas.message)
  }

  // Crear bloque de foto genérico
  const instruccion = (formData.get('instruccion') as string) || 'Fotografiá la góndola'
  const tipoContenido = (formData.get('tipo_contenido') as string) || 'propios'
  const solicitarPrecio = formData.get('solicitar_precio') === 'true'
  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:      campana.id,
    orden:           1,
    instruccion,
    tipo_contenido:  tipoContenido,
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
      // Para campos tipo 'foto', la pregunta es opcional (es la instrucción de la foto).
      // Para el resto, sí se requiere pregunta no vacía.
      const camposValidos = campos.filter(c => c.tipo === 'foto' || c.pregunta.trim())
      if (camposValidos.length > 0) {
        const { error: errCampos } = await admin.from('bloque_campos').insert(
          camposValidos.map(c => ({
            bloque_id:   bloque.id,
            tipo:        c.tipo,
            pregunta:    c.pregunta.trim() || (c.tipo === 'foto' ? 'Fotografiá el producto' : ''),
            opciones:    c.opciones.filter(Boolean).length > 0 ? c.opciones.filter(Boolean) : null,
            obligatorio: c.obligatorio,
            orden:       c.orden,
          }))
        )
        if (errCampos) console.error('[crearCampanaInterna] Error insertando bloque_campos:', errCampos.message)
      }
    } catch (e) { console.error('[crearCampanaInterna] Error parseando campos_json:', e) }
  }

  revalidatePath('/distribuidora/campanas')
  redirect('/distribuidora/campanas')
}
