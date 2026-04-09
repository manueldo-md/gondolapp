'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoCampana, TipoContenidoBloque } from '@/types'
import { crearNotificacionAdmin } from '@/lib/notificaciones'

const COSTO_CREACION = 15

export async function crearCampana(formData: FormData) {
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

  const marcaId = profile?.marca_id
  if (!marcaId) return { error: 'No tenés una marca asociada.' }

  // Verificar tokens
  const { data: marca } = await admin
    .from('marcas')
    .select('tokens_disponibles')
    .eq('id', marcaId)
    .single()

  if ((marca?.tokens_disponibles ?? 0) < COSTO_CREACION) {
    return { error: 'Tokens insuficientes para crear la campaña. Necesitás al menos 15 tokens.' }
  }

  // Vía de ejecución
  const viaEjecucion = (formData.get('via_ejecucion') as string) || 'distribuidora'
  const distriId = viaEjecucion === 'distribuidora'
    ? (formData.get('distri_id') as string) || null
    : null

  // Crear campaña
  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                    formData.get('nombre') as string,
      tipo:                      formData.get('tipo') as TipoCampana,
      instruccion:               formData.get('instruccion') as string || null,
      puntos_por_foto:           parseInt(formData.get('puntos_por_foto') as string) || 0,
      fecha_inicio:              formData.get('fecha_inicio') as string || null,
      fecha_fin:                 formData.get('fecha_fin') as string || null,
      objetivo_comercios:        parseInt(formData.get('objetivo_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar: parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      marca_id:                  marcaId,
      distri_id:                 distriId,
      financiada_por:            'marca',
      estado:                    'pendiente_aprobacion',
      via_ejecucion:             viaEjecucion,
      tokens_creacion:           COSTO_CREACION,
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  const campanaId = campana.id

  // Crear bloque de foto
  const instruccionBloque = formData.get('instruccion_bloque') as string
  const tipoContenido = (formData.get('tipo_contenido') as TipoContenidoBloque) || 'propios'

  const solicitarPrecio = formData.get('solicitar_precio') === 'true'
  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:      campanaId,
    orden:           1,
    instruccion:     instruccionBloque || (formData.get('instruccion') as string) || '',
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
        if (errCampos) console.error('[crearCampana] Error insertando bloque_campos:', errCampos.message)
      }
    } catch (e) { console.error('[crearCampana] Error parseando campos_json:', e) }
  }

  // Descontar tokens
  await admin
    .from('marcas')
    .update({ tokens_disponibles: (marca?.tokens_disponibles ?? 0) - COSTO_CREACION })
    .eq('id', marcaId)

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    const { error: errZonas } = await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campanaId, localidad_id }))
    )
    if (errZonas) console.error('[crearCampana] Error insertando campana_localidades:', errZonas.message)
  }

  // Registrar movimiento
  await admin.from('movimientos_tokens').insert({
    actor_id:   marcaId,
    actor_tipo: 'marca',
    tipo:       'consumo',
    monto:      COSTO_CREACION,
    concepto:   `Creación de campaña: ${formData.get('nombre')}`,
    campana_id: campanaId,
  })

  // Si es vía distribuidora con distri_id, crear token de invitación
  if (viaEjecucion === 'distribuidora' && distriId) {
    await admin.from('campana_tokens').insert({
      campana_id: campanaId,
      distri_id:  distriId,
    })
  }

  // Notificar al admin que hay una campaña nueva pendiente de aprobación
  await crearNotificacionAdmin({
    tipo:        'admin_campana_pendiente',
    titulo:      'Nueva campaña pendiente de aprobación',
    mensaje:     `"${formData.get('nombre')}" fue enviada por una marca.`,
    campanaId:   campanaId,
    linkDestino: `/admin/campanas`,
  })

  revalidatePath('/marca/campanas')
  redirect(`/marca/campanas/${campanaId}`)
}
