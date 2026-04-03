import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AdminShell } from './admin-shell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor, nombre')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'admin') redirect('/auth')

  const [{ count: fotosPendientes }, { count: canjesPendientes }] = await Promise.all([
    admin.from('fotos').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    admin.from('canjes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
  ])

  return (
    <AdminShell
      nombre={profile.nombre ?? 'Admin'}
      fotosPendientes={fotosPendientes ?? 0}
      canjesPendientes={canjesPendientes ?? 0}
    >
      {children}
    </AdminShell>
  )
}
