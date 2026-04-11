'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function liberarBounty(admin: any, comercioId: string) {
  const { data: fotos } = await admin
    .from('fotos')
    .select('id, gondolero_id, campana_id')
    .eq('comercio_id', comercioId)
    .eq('bounty_estado', 'retenido')

  if (!fotos?.length) return

  for (const foto of fotos as { id: string; gondolero_id: string; campana_id: string }[]) {
    await admin
      .from('fotos')
      .update({ bounty_estado: 'acreditado', estado: 'aprobada' })
      .eq('id', foto.id)

    const { data: campana } = await admin
      .from('campanas')
      .select('puntos_por_foto, puntos_por_mision')
      .eq('id', foto.campana_id)
      .maybeSingle() as { data: { puntos_por_foto: number; puntos_por_mision: number } | null }

    // Usar puntos_por_mision si la campaña lo tiene, fallback a puntos_por_foto (legacy)
    const puntos = (campana?.puntos_por_mision ?? 0) > 0
      ? (campana?.puntos_por_mision ?? 0)
      : (campana?.puntos_por_foto ?? 0)
    if (puntos > 0) {
      await admin.from('movimientos_puntos').insert({
        gondolero_id: foto.gondolero_id,
        tipo:         'credito',
        monto:        puntos,
        concepto:     'Comercio validado automáticamente',
        campana_id:   foto.campana_id,
        foto_id:      foto.id,
      })

      const { data: profile } = await admin
        .from('profiles')
        .select('puntos_disponibles')
        .eq('id', foto.gondolero_id)
        .maybeSingle() as { data: { puntos_disponibles: number } | null }

      if (profile) {
        await admin
          .from('profiles')
          .update({ puntos_disponibles: (profile.puntos_disponibles ?? 0) + puntos })
          .eq('id', foto.gondolero_id)
      }
    }
  }
}

/**
 * Núcleo de la lógica de checks GPS — llamable desde server actions sin necesitar auth propia.
 * Se usa desde registrarMision (captura/actions.ts) para visibilidad en logs de Vercel.
 */
export async function registrarChecksGPSInterno({
  lat,
  lng,
  userId,
  gondoleroDistriId,
  admin,
}: {
  lat: number
  lng: number
  userId: string
  gondoleroDistriId: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any
}) {
  console.log('[registrarChecksGPS] iniciando con', { lat, lng, userId, gondoleroDistriId })

  // Obtener todos los comercios en pendiente_validacion con coordenadas
  const { data: pendientes } = await admin
    .from('comercios')
    .select('id, lat, lng, registrado_por')
    .eq('estado', 'pendiente_validacion')
    .not('lat', 'is', null)
    .not('lng', 'is', null) as { data: { id: string; lat: number; lng: number; registrado_por: string | null }[] | null }

  console.log('[registrarChecksGPS] comercios pendientes encontrados:', pendientes?.length ?? 0)

  if (!pendientes?.length) return

  // Filtrar los que están a ≤20m y que este gondolero NO creó
  const cercanos = pendientes.filter(c =>
    c.registrado_por !== userId &&
    distanciaMetros(lat, lng, c.lat, c.lng) <= 20
  )

  console.log('[registrarChecksGPS] comercios cercanos (≤20m):', cercanos.length)

  if (!cercanos.length) return

  for (const comercio of cercanos) {
    // Registrar check (upsert: un gondolero solo puede tener un check por comercio)
    await admin
      .from('comercios_checks')
      .upsert(
        {
          comercio_id:  comercio.id,
          gondolero_id: userId,
          distri_id:    gondoleroDistriId,
          latitud:      lat,
          longitud:     lng,
        },
        { onConflict: 'comercio_id,gondolero_id' }
      )

    // Si este gondolero no tiene distri, no puede contar como validación independiente
    if (!gondoleroDistriId) continue

    // Obtener distri del creador del comercio
    const { data: creador } = await admin
      .from('profiles')
      .select('distri_id')
      .eq('id', comercio.registrado_por)
      .maybeSingle() as { data: { distri_id: string | null } | null }

    const creadorDistriId = creador?.distri_id ?? null

    // El gondolero actual es de la misma distri que el creador → no cuenta
    if (gondoleroDistriId === creadorDistriId) continue

    // Verificar si hay algún check previo de una distri distinta a la del creador Y distinta a la actual
    const { data: checksExistentes } = await admin
      .from('comercios_checks')
      .select('gondolero_id, distri_id')
      .eq('comercio_id', comercio.id)
      .neq('gondolero_id', userId) as { data: { gondolero_id: string; distri_id: string | null }[] | null }

    // Hay confirmación independiente si existe al menos un check de una distri diferente al creador
    const hayConfirmacionIndependiente = checksExistentes?.some(
      ch => ch.distri_id && ch.distri_id !== creadorDistriId
    )

    console.log('[registrarChecksGPS] comercio', comercio.id, '— hayConfirmacionIndependiente:', hayConfirmacionIndependiente)

    if (hayConfirmacionIndependiente) {
      // Auto-validar el comercio
      await admin
        .from('comercios')
        .update({ estado: 'activo', validado: true })
        .eq('id', comercio.id)

      await liberarBounty(admin, comercio.id)

      revalidatePath('/admin/comercios/pendientes')
      revalidatePath('/admin/comercios')

      console.log('[registrarChecksGPS] comercio auto-validado:', comercio.id)
    }
  }
}

/**
 * Registra checks GPS silenciosos para comercios pendientes de validación
 * cercanos a la posición del gondolero (radio 20m).
 *
 * Versión para llamadas desde el cliente (server action con auth propia).
 * Para llamadas desde server actions usa registrarChecksGPSInterno directamente.
 */
export async function registrarChecksGPS(params: { lat: number; lng: number }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Obtener distri_id del gondolero
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .maybeSingle() as { data: { distri_id: string | null } | null }

  await registrarChecksGPSInterno({
    lat:               params.lat,
    lng:               params.lng,
    userId:            user.id,
    gondoleroDistriId: profile?.distri_id ?? null,
    admin,
  })
}
