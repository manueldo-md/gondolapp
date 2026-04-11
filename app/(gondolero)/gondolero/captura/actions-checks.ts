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
  console.log('[registrarChecksGPS] antes de query comercios pendientes')
  const { data: pendientes, error: pendientesError } = await admin
    .from('comercios')
    .select('id, lat, lng, registrado_por, estado')
    .eq('estado', 'pendiente_validacion')
    .not('lat', 'is', null)
    .not('lng', 'is', null) as { data: { id: string; lat: number; lng: number; registrado_por: string | null; estado: string }[] | null; error: { message: string } | null }

  console.log('[registrarChecksGPS] resultado query:', {
    count: pendientes?.length ?? 0,
    error: pendientesError?.message ?? null,
    sample: pendientes?.slice(0, 3).map(c => ({ id: c.id, lat: c.lat, lng: c.lng, estado: c.estado, registrado_por: c.registrado_por })),
  })

  if (pendientesError) {
    console.error('[registrarChecksGPS] ERROR en query comercios:', pendientesError.message)
    return
  }

  if (!pendientes?.length) {
    console.log('[registrarChecksGPS] sin comercios pendiente_validacion — abortando')
    return
  }

  // Filtrar solo por distancia ≤20m (el creador también registra su check)
  const cercanos = pendientes.filter(c => {
    const dist = distanciaMetros(lat, lng, c.lat, c.lng)
    console.log('[registrarChecksGPS] evaluando comercio', c.id, '— dist:', Math.round(dist), 'm — esCreador:', c.registrado_por === userId)
    return dist <= 20
  })

  console.log('[registrarChecksGPS] comercios cercanos (≤20m):', cercanos.length)

  if (!cercanos.length) return

  for (const comercio of cercanos) {
    // 1. SIEMPRE registrar el check (upsert) — incluye al creador
    const { error: upsertError } = await admin
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

    if (upsertError) {
      console.error('[registrarChecksGPS] ERROR upsert check comercio', comercio.id, ':', upsertError.message)
    } else {
      console.log('[registrarChecksGPS] check registrado para comercio', comercio.id, '— distri_id:', gondoleroDistriId)
    }

    // 2. Verificar si hay checks de 2+ distribuidoras distintas entre sí (activa la validación)
    // Leer TODOS los checks del comercio (incluyendo el recién insertado)
    const { data: todosLosChecks, error: checksError } = await admin
      .from('comercios_checks')
      .select('gondolero_id, distri_id')
      .eq('comercio_id', comercio.id) as { data: { gondolero_id: string; distri_id: string | null }[] | null; error: { message: string } | null }

    if (checksError) {
      console.error('[registrarChecksGPS] ERROR leyendo checks de comercio', comercio.id, ':', checksError.message)
      continue
    }

    // Contar distris únicas con valor no-nulo
    const distrisUnicas = new Set(
      (todosLosChecks ?? [])
        .map(ch => ch.distri_id)
        .filter((d): d is string => d !== null && d !== undefined)
    )

    console.log('[registrarChecksGPS] comercio', comercio.id, '— checks totales:', todosLosChecks?.length ?? 0, '— distris únicas:', distrisUnicas.size, '—', [...distrisUnicas])

    if (distrisUnicas.size >= 2) {
      // 3. Auto-validar el comercio
      await admin
        .from('comercios')
        .update({ estado: 'activo', validado: true })
        .eq('id', comercio.id)

      await liberarBounty(admin, comercio.id)

      revalidatePath('/admin/comercios/pendientes')
      revalidatePath('/admin/comercios')

      console.log('[registrarChecksGPS] comercio auto-validado:', comercio.id, '— distris que confirmaron:', [...distrisUnicas])
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
