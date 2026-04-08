import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { CuentaRepoForm } from './form'

export default async function RepoCuentaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('nombre, celular, repositora_id')
    .eq('id', user.id)
    .single()

  let razonSocial = ''
  let cuit = ''
  if (profile?.repositora_id) {
    const { data: repo } = await admin
      .from('repositoras')
      .select('razon_social, cuit')
      .eq('id', profile.repositora_id)
      .single()
    razonSocial = repo?.razon_social ?? ''
    cuit = repo?.cuit ?? ''
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Editá tus datos de contacto y contraseña</p>
      </div>

      <CuentaRepoForm
        email={user.email ?? ''}
        nombre={profile?.nombre ?? ''}
        celular={profile?.celular ?? ''}
        razonSocial={razonSocial}
        cuit={cuit}
      />
    </div>
  )
}
