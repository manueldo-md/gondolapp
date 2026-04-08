import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { RepoShell } from './repo-shell'

export default async function RepoLayout({
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
    .select('tipo_actor, repositora_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'repositora') {
    redirect('/auth')
  }

  const repoId = profile.repositora_id as string | null
  if (!repoId) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let repositoraNombre = 'Mi repositora'
  let solicitudesPendientesCount = 0
  let unreadNotifsCount = 0

  const [{ data: repoData }, solicitudesRes, { count: unreadCount }] = await Promise.all([
    admin.from('repositoras').select('razon_social').eq('id', repoId).single(),
    admin
      .from('fixer_repo_solicitudes')
      .select('*', { count: 'exact', head: true })
      .eq('repositora_id', repoId)
      .eq('estado', 'pendiente'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('actor_id', repoId)
      .eq('actor_tipo', 'repositora')
      .eq('leida', false),
  ])

  if (repoData?.razon_social) repositoraNombre = repoData.razon_social
  solicitudesPendientesCount = solicitudesRes.count ?? 0
  unreadNotifsCount = unreadCount ?? 0

  return (
    <RepoShell
      repositora={repositoraNombre}
      repoId={repoId}
      solicitudesPendientes={solicitudesPendientesCount}
      unreadNotifs={unreadNotifsCount}
    >
      {children}
    </RepoShell>
  )
}
