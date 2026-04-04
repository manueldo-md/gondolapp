'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

export interface CrearComercioParams {
  campanaId: string
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  telefono?: string | null
  encargado?: string | null
  fachadaStoragePath?: string | null
  fachadaUrl?: string | null
}

// Deduplicación básica: retorna comercios activos en radio 50m
function nombreSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  // Contiene substring significativo
  if (na.length > 4 && nb.includes(na.slice(0, Math.min(na.length, 6)))) return true
  if (nb.length > 4 && na.includes(nb.slice(0, Math.min(nb.length, 6)))) return true
  return false
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) * Math.sin(dLambda / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function crearComercioNuevo(params: CrearComercioParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verificar que tiene participación activa en la campaña
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: participacion } = await (admin as any)
    .from('participaciones')
    .select('id, comercios_completados')
    .eq('campana_id', params.campanaId)
    .eq('gondolero_id', user.id)
    .eq('estado', 'activa')
    .maybeSingle() as { data: { id: string; comercios_completados: number } | null }

  if (!participacion) {
    return { error: 'No tenés una participación activa en esta campaña.' }
  }

  // Obtener zona_id
  const { data: zona } = await admin
    .from('zonas')
    .select('id')
    .eq('nombre', 'Entre Ríos')
    .limit(1)
    .maybeSingle()

  let zonaId: string | null = zona?.id ?? null
  if (!zonaId) {
    const { data: primeraZona } = await admin
      .from('zonas')
      .select('id')
      .limit(1)
      .maybeSingle()
    zonaId = primeraZona?.id ?? null
  }

  // Deduplicación: buscar comercios activos en radio 50m
  const { data: cercanos } = await admin
    .from('comercios')
    .select('id, nombre, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  let posibleDuplicadoId: string | null = null
  if (cercanos && cercanos.length > 0) {
    for (const c of cercanos as { id: string; nombre: string; lat: number; lng: number }[]) {
      const dist = distanciaMetros(params.lat, params.lng, c.lat, c.lng)
      if (dist <= 50 && nombreSimilar(params.nombre, c.nombre)) {
        posibleDuplicadoId = c.id
        break
      }
    }
  }

  // Insertar comercio con estado pendiente_validacion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, unknown> = {
    nombre:           params.nombre,
    tipo:             params.tipo,
    direccion:        params.direccion,
    lat:              params.lat,
    lng:              params.lng,
    zona_id:          zonaId,
    registrado_por:   user.id,
    validado:         false,
    estado:           'pendiente_validacion',
    campana_id:       params.campanaId,
  }
  if (params.telefono) insertData.telefono = params.telefono
  if (params.encargado) insertData.encargado = params.encargado
  if (params.fachadaStoragePath) insertData.foto_fachada_url = params.fachadaStoragePath

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comercio, error: errInsert } = await (admin as any)
    .from('comercios')
    .insert(insertData)
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (errInsert || !comercio) {
    return { error: 'No se pudo guardar el comercio: ' + (errInsert?.message ?? 'error desconocido') }
  }

  // Insertar registro en fotos con bounty_estado = 'retenido'
  // Usamos un bloque genérico — primero buscamos, si no hay creamos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bloques } = await (admin as any)
    .from('bloques_foto')
    .select('id')
    .eq('campana_id', params.campanaId)
    .limit(1)

  let bloqueId: string | null = bloques?.[0]?.id ?? null

  if (!bloqueId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nuevoBloque } = await (admin as any)
      .from('bloques_foto')
      .insert({
        campana_id:     params.campanaId,
        orden:          1,
        instruccion:    'Foto de fachada del comercio',
        tipo_contenido: 'ninguno',
      })
      .select('id')
      .single()
    bloqueId = nuevoBloque?.id ?? null
  }

  if (bloqueId && params.fachadaUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('fotos').insert({
      campana_id:            params.campanaId,
      bloque_id:             bloqueId,
      gondolero_id:          user.id,
      comercio_id:           comercio.id,
      url:                   params.fachadaUrl,
      storage_path:          params.fachadaStoragePath ?? '',
      lat:                   params.lat,
      lng:                   params.lng,
      timestamp_dispositivo: new Date().toISOString(),
      device_id:             null,
      declaracion:           'producto_presente',
      estado:                'pendiente',
      puntos_otorgados:      0,
      bounty_estado:         'retenido',
    })
  }

  // Incrementar comercios_completados en la participación
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('participaciones')
    .update({ comercios_completados: (participacion.comercios_completados ?? 0) + 1 })
    .eq('id', participacion.id)

  return {
    comercioId: comercio.id,
    posibleDuplicado: !!posibleDuplicadoId,
    mensaje: posibleDuplicadoId
      ? 'Comercio registrado pero puede ser un duplicado. Será revisado antes de acreditar puntos.'
      : 'Comercio registrado. Tus puntos se acreditarán cuando sea validado.',
  }
}

// Sube una foto de fachada al bucket 'fotos-gondola' bajo la ruta fachadas/{campanaId}/{timestamp}.jpg
export async function subirFotoFachada(formData: FormData): Promise<{ url: string; path: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const file       = formData.get('foto') as File
  const campanaId  = formData.get('campanaId') as string
  if (!file || !campanaId) throw new Error('Faltan datos para subir la foto de fachada.')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const storagePath = `fachadas/${campanaId}/${Date.now()}_${user.id}.jpg`

  const { error } = await admin.storage
    .from('fotos-gondola')
    .upload(storagePath, file, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error('Error al subir la foto de fachada: ' + error.message)

  const { data: urlData } = admin.storage
    .from('fotos-gondola')
    .getPublicUrl(storagePath)

  return { url: urlData.publicUrl, path: storagePath }
}
