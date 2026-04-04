import { createClient } from '@/lib/supabase/server'
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
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { count } = await supabase
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('gondolero_id', user.id)
        .eq('leida', false)
      unreadCount = count ?? 0
    }
  } catch {
    // Sin conexión o Supabase no disponible — continuar con defaults
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
      <GondoleroNav unreadCount={unreadCount} />
    </div>
  )
}
