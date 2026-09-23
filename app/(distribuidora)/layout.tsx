import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { DistriShell } from './distri-shell'
import { getGondolerosDeDistri } from '@/lib/utils-distri'

export default async function DistriLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: profile } = await db
    .from('profiles')
    .select('tipo_actor, distri_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'distribuidora') {
    redirect('/auth')
  }

  let empresa = 'Mi distribuidora'
  let solicitudesPendientesCount = 0
  let campanasPendientesCount = 0
  let comerciosPendientesCount = 0
  let unreadNotifsCount = 0

  if (profile.distri_id) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const [{ data: distri }, gondIds, { count: unreadCount }] = await Promise.all([
      admin.from('distribuidoras').select('razon_social').eq('id', profile.distri_id).single(),
      // Los gondoleros vigentes. Antes salía de profiles.distri_id, que tiene
      // lugar para una sola distri: al que trabaja para dos, la segunda no lo
      // veía en este badge. Ver lib/utils-distri.ts.
      getGondolerosDeDistri(profile.distri_id, admin),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('actor_id', profile.distri_id)
        .eq('actor_tipo', 'distribuidora')
        .eq('leida', false),
    ])
    unreadNotifsCount = unreadCount ?? 0
    if (distri?.razon_social) empresa = distri.razon_social

    try {
      const solicitudesRes = await admin
        .from('gondolero_distri_solicitudes')
        .select('*', { count: 'exact', head: true })
        .eq('distri_id', profile.distri_id)
        .eq('estado', 'pendiente')
      solicitudesPendientesCount = solicitudesRes.count ?? 0
    } catch {
      // Tabla puede no existir aún en la DB — ignorar
    }

    try {
      const campanasPendientesRes = await admin
        .from('campanas')
        .select('*', { count: 'exact', head: true })
        .eq('distri_id', profile.distri_id)
        .eq('estado', 'pendiente_aprobacion')
      campanasPendientesCount = campanasPendientesRes.count ?? 0
    } catch {
      // ignorar
    }

    try {
      // Contar comercios pendientes de campañas de esta distri
      const { data: campanaIds } = await admin
        .from('campanas')
        .select('id')
        .eq('distri_id', profile.distri_id)
      const ids = (campanaIds ?? []).map((c: { id: string }) => c.id)
      if (ids.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await (admin as any)
          .from('comercios')
          .select('*', { count: 'exact', head: true })
          .eq('estado', 'pendiente_validacion')
          .in('campana_id', ids)
        comerciosPendientesCount = res.count ?? 0
      }
    } catch {
      // ignorar si la columna aún no existe
    }

    // ── EL PUNTITO ROJO DE "ALERTAS" SE FUE, Y NO ES UN OLVIDO ──────────────
    // Lo encendía una consulta a `fotos.declaracion = 'producto_no_encontrado'`
    // en los últimos 7 días. Esa columna está congelada desde abril de 2026:
    // las 22 filas con ese valor son del 11 y 12 de marzo, en dev y en prod.
    // O sea que el punto no se encendió NUNCA desde que existe, y no podía.
    //
    // No se reemplaza por otra consulta acá: el layout corre en cada
    // navegación del panel, y recalcular los cuatro tipos de alerta en cada
    // una sería copiar las reglas de `/distribuidora/alertas` a un segundo
    // lugar — que es como se separaron en este proyecto todas las reglas que
    // después hubo que unificar. Cuando la alerta vuelva a estar viva, el
    // contador sale de la misma función que usa la pantalla.
  }

  return (
    <DistriShell
      empresa={empresa}
      distriId={profile.distri_id}
      solicitudesPendientes={solicitudesPendientesCount}
      campanasPendientes={campanasPendientesCount}
      comerciosPendientes={comerciosPendientesCount}
      unreadNotifs={unreadNotifsCount}
    >
      {children}
    </DistriShell>
  )
}
