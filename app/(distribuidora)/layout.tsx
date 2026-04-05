import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { DistriShell } from './distri-shell'

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
  let hayAlertas = false
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

    const [{ data: distri }, { data: gondRows }, { count: unreadCount }] = await Promise.all([
      admin.from('distribuidoras').select('razon_social').eq('id', profile.distri_id).single(),
      admin.from('profiles').select('id').eq('distri_id', profile.distri_id).eq('tipo_actor', 'gondolero'),
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

    const gondIds = (gondRows ?? []).map((g: { id: string }) => g.id)
    if (gondIds.length > 0) {
      const sieteAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count } = await admin
        .from('fotos')
        .select('*', { count: 'exact', head: true })
        .in('gondolero_id', gondIds)
        .eq('declaracion', 'producto_no_encontrado')
        .eq('estado', 'aprobada')
        .gte('created_at', sieteAtras)
      hayAlertas = (count ?? 0) > 0
    }
  }

  return (
    <DistriShell
      empresa={empresa}
      distriId={profile.distri_id}
      hayAlertas={hayAlertas}
      solicitudesPendientes={solicitudesPendientesCount}
      campanasPendientes={campanasPendientesCount}
      comerciosPendientes={comerciosPendientesCount}
      unreadNotifs={unreadNotifsCount}
    >
      {children}
    </DistriShell>
  )
}
