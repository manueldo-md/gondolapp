import { createClient } from '@/lib/supabase/server'
import { GondoleroNav } from './gondolero-nav'

export default async function GondoleroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let unreadCount = 0
  if (user) {
    const { count } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('gondolero_id', user.id)
      .eq('leida', false)
    unreadCount = count ?? 0
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>
      <GondoleroNav unreadCount={unreadCount} />
    </div>
  )
}
