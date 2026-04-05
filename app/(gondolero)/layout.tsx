import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { GondoleroNav } from './gondolero-nav'
import { InstalarAppBanner } from '@/components/mobile/instalar-app-banner'
import { OfflineSyncBanner } from '@/components/mobile/offline-sync'
import { OfflineDetector } from '@/components/mobile/offline-detector'
import { NavigationProgress } from '@/components/mobile/navigation-progress'

export default async function GondoleroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let unreadCount = 0
  let unreadLogrosCount = 0
  let invitacionesPendientesCount = 0
  let userId: string | undefined

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const [notifRes, logrosRes, invitacionesRes] = await Promise.all([
        supabase
          .from('notificaciones')
          .select('*', { count: 'exact', head: true })
          .eq('gondolero_id', user.id)
          .eq('leida', false),
        supabase
          .from('gondolero_logros')
          .select('*', { count: 'exact', head: true })
          .eq('gondolero_id', user.id)
          .eq('visto', false),
        admin
          .from('gondolero_distri_solicitudes')
          .select('*', { count: 'exact', head: true })
          .eq('gondolero_id', user.id)
          .eq('estado', 'pendiente')
          .eq('iniciado_por', 'distri'),
      ])
      unreadCount = notifRes.count ?? 0
      unreadLogrosCount = logrosRes.count ?? 0
      invitacionesPendientesCount = invitacionesRes.count ?? 0
    }
  } catch {
    // Sin conexión o tabla no existe aún — continuar con defaults
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <NavigationProgress />
      <InstalarAppBanner />
      <OfflineSyncBanner />
      <OfflineDetector>
        <main className="flex-1 overflow-y-auto pb-20">
          {children}
        </main>
      </OfflineDetector>
      <GondoleroNav
        unreadCount={unreadCount}
        unreadLogrosCount={unreadLogrosCount}
        invitacionesPendientesCount={invitacionesPendientesCount}
        userId={userId}
      />
    </div>
  )
}
