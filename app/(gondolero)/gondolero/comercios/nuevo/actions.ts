'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { TipoComercio } from '@/types'

export async function crearComercio(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Usar admin client para bypasear RLS en el INSERT
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const nombre     = (formData.get('nombre') as string)?.trim()
  const tipo       = formData.get('tipo') as TipoComercio
  const direccion  = (formData.get('direccion') as string)?.trim() || null
  const latStr     = formData.get('lat') as string
  const lngStr     = formData.get('lng') as string
  const campanaId  = formData.get('campana_id') as string | null
  const localidadStr = formData.get('localidad_id') as string | null
  const localidadId  = localidadStr ? Number(localidadStr) : null

  if (!nombre) return { error: 'El nombre del comercio es obligatorio.' }
  if (!tipo)   return { error: 'Seleccioná el tipo de comercio.' }

  const lat = latStr ? parseFloat(latStr) : null
  const lng = lngStr ? parseFloat(lngStr) : null

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { error: 'Necesitamos tu ubicación GPS para registrar el comercio. Activá el GPS e intentá de nuevo.' }
  }

  // INSERT en comercios
  // Construimos el objeto dinámicamente para no incluir localidad_id
  // si es null (evita error si la columna aún no existe en la DB).
  const insertData: Record<string, unknown> = {
    nombre,
    tipo,
    direccion,
    lat,
    lng,
    registrado_por: user.id,
    validado:       false,
  }
  if (localidadId !== null) insertData.localidad_id = localidadId

  const { data: comercio, error: errInsert } = await admin
    .from('comercios')
    .insert(insertData)
    .select('id')
    .single()

  if (errInsert) {
    console.error('[crearComercio] Error INSERT comercio:', {
      code:    errInsert.code,
      message: errInsert.message,
      details: errInsert.details,
      hint:    errInsert.hint,
    })
    return { error: `No se pudo guardar el comercio. (${errInsert.code}: ${errInsert.message})` }
  }

  // Subir foto de fachada si está presente
  const fotoFachada = formData.get('foto_fachada') as File | null
  if (fotoFachada && fotoFachada.size > 0) {
    try {
      const arrayBuffer = await fotoFachada.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const storagePath = `fachadas/${comercio.id}.jpg`

      const { data: uploadData, error: uploadError } = await admin.storage
        .from('fotos-gondola')
        .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true })

      console.log('[fachada] upload result — path:', uploadData?.path, 'error:', uploadError?.message ?? null)

      if (!uploadError) {
        // Siempre usar el path construido manualmente — uploadData.path puede devolver
        // una URL firmada completa en algunas versiones del cliente de Supabase
        const { error: updateError } = await admin
          .from('comercios')
          .update({ foto_fachada_url: storagePath })
          .eq('id', comercio.id)
        console.log('[fachada] DB update — path guardado:', storagePath, 'error:', updateError?.message ?? null)
      } else {
        console.error('[fachada] Error subiendo a Storage:', uploadError.message)
      }
    } catch (e) {
      console.error('[fachada] Excepción:', e)
      // No bloquear el flujo si la foto falla
    }
  }

  // Redirigir de vuelta a captura con el nuevo comercio pre-seleccionado
  const params = new URLSearchParams()
  if (campanaId) params.set('campana', campanaId)
  params.set('comercio_nuevo', comercio.id)
  redirect(`/gondolero/captura?${params.toString()}`)
}

// Versión sin redirect para usar desde OfflineSyncBanner al sincronizar
export async function crearComercioOffline(datos: {
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  localidad_id?: number | null
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const insertData: Record<string, unknown> = {
    nombre:         datos.nombre,
    tipo:           datos.tipo,
    direccion:      datos.direccion,
    lat:            datos.lat,
    lng:            datos.lng,
    registrado_por: user.id,
    validado:       false,
  }
  if (datos.localidad_id != null) insertData.localidad_id = datos.localidad_id

  const { data: comercio, error } = await admin
    .from('comercios')
    .insert(insertData)
    .select('id')
    .single()

  if (error) {
    console.error('[crearComercioOffline] Error INSERT comercio:', {
      code:    error.code,
      message: error.message,
      details: error.details,
      hint:    error.hint,
    })
    return { error: `No se pudo guardar el comercio. (${error.code}: ${error.message})` }
  }
  return { id: comercio.id }
}
