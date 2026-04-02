import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { EditarPerfilGondoleroForm } from './form'

export default async function EditarPerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('nombre, celular')
    .eq('id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white px-4 pt-12 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <a href="/gondolero/perfil" className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">
            ←
          </a>
          <h1 className="text-lg font-bold text-gray-900">Editar perfil</h1>
        </div>
      </div>
      <div className="px-4 pt-5">
        <EditarPerfilGondoleroForm
          email={user.email ?? ''}
          nombre={profile?.nombre ?? ''}
          celular={profile?.celular ?? ''}
        />
      </div>
    </div>
  )
}
