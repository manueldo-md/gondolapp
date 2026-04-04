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

  const nombre    = (formData.get('nombre') as string)?.trim()
  const tipo      = formData.get('tipo') as TipoComercio
  const direccion = (formData.get('direccion') as string)?.trim() || null
  const latStr    = formData.get('lat') as string
  const lngStr    = formData.get('lng') as string
  const campanaId = formData.get('campana_id') as string | null

  if (!nombre) return { error: 'El nombre del comercio es obligatorio.' }
  if (!tipo)   return { error: 'Seleccioná el tipo de comercio.' }

  const lat = latStr ? parseFloat(latStr) : null
  const lng = lngStr ? parseFloat(lngStr) : null

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return { error: 'Necesitamos tu ubicación GPS para registrar el comercio. Activá el GPS e intentá de nuevo.' }
  }

  // Obtener zona_id por defecto (Entre Ríos) si no hay zona detectada
  const { data: zona } = await admin
    .from('zonas')
    .select('id')
    .eq('nombre', 'Entre Ríos')
    .limit(1)
    .single()

  // Si no existe "Entre Ríos", usar cualquier zona disponible
  let zonaId: string | null = zona?.id ?? null
  if (!zonaId) {
    const { data: primeraZona } = await admin
      .from('zonas')
      .select('id')
      .limit(1)
      .single()
    zonaId = primeraZona?.id ?? null
  }

  if (!zonaId) {
    return { error: 'No hay zonas configuradas en el sistema. Contactá al equipo de GondolApp.' }
  }

  // INSERT en comercios
  const { data: comercio, error: errInsert } = await admin
    .from('comercios')
    .insert({
      nombre,
      tipo,
      direccion,
      lat,
      lng,
      zona_id:        zonaId,
      registrado_por: user.id,
      validado:       false,
    })
    .select('id')
    .single()

  if (errInsert) {
    console.error('Error creando comercio:', errInsert)
    return { error: 'No se pudo guardar el comercio. Intentá de nuevo.' }
  }

  // Subir foto de fachada si está presente
  // Bucket requerido: 'fotos-fachada' (crear en Supabase Storage Dashboard si no existe)
  const fotoFachada = formData.get('foto_fachada') as File | null
  if (fotoFachada && fotoFachada.size > 0) {
    try {
      const arrayBuffer = await fotoFachada.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const path = `fachadas/${comercio.id}.jpg`

      const { error: uploadError } = await admin.storage
        .from('fotos-gondola')
        .upload(path, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        })

      if (!uploadError) {
        await admin
          .from('comercios')
          .update({ foto_fachada_url: path })
          .eq('id', comercio.id)
      } else {
        console.error('Error subiendo fachada:', uploadError.message)
      }
    } catch (e) {
      console.error('Excepción subiendo fachada:', e)
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
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: zona } = await admin
    .from('zonas').select('id').eq('nombre', 'Entre Ríos').limit(1).single()
  let zonaId: string | null = zona?.id ?? null
  if (!zonaId) {
    const { data: primeraZona } = await admin.from('zonas').select('id').limit(1).single()
    zonaId = primeraZona?.id ?? null
  }
  if (!zonaId) return { error: 'No hay zonas configuradas.' }

  const { data: comercio, error } = await admin
    .from('comercios')
    .insert({
      nombre: datos.nombre,
      tipo: datos.tipo,
      direccion: datos.direccion,
      lat: datos.lat,
      lng: datos.lng,
      zona_id: zonaId,
      registrado_por: user.id,
      validado: false,
    })
    .select('id')
    .single()

  if (error) return { error: 'No se pudo guardar el comercio.' }
  return { id: comercio.id }
}
