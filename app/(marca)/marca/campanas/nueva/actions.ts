'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoCampana, TipoContenidoBloque } from '@/types'

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
      estado:                    'activa',
      tokens_creacion:           COSTO_CREACION,
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  const campanaId = campana.id

  // Crear bloque de foto
  const instruccionBloque = formData.get('instruccion_bloque') as string
  const tipoContenido = (formData.get('tipo_contenido') as TipoContenidoBloque) || 'propios'

  await admin.from('bloques_foto').insert({
    campana_id:    campanaId,
    orden:         1,
    instruccion:   instruccionBloque || (formData.get('instruccion') as string) || '',
    tipo_contenido: tipoContenido,
  })

  // Descontar tokens
  await admin
    .from('marcas')
    .update({ tokens_disponibles: (marca?.tokens_disponibles ?? 0) - COSTO_CREACION })
    .eq('id', marcaId)

  // Guardar zonas de la campaña
  const zonaIds = formData.getAll('zona_ids') as string[]
  if (zonaIds.length > 0) {
    await admin.from('campana_zonas').insert(zonaIds.map(zona_id => ({ campana_id: campanaId, zona_id })))
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

  revalidatePath('/marca/campanas')
  redirect('/marca/campanas')
}
