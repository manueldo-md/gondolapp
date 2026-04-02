import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { CuentaDistriForm } from './form'

export default async function DistriCuentaPage() {
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
    .select('nombre, celular, distri_id')
    .eq('id', user.id)
    .single()

  let razonSocial = ''
  let cuit = ''
  if (profile?.distri_id) {
    const { data: distri } = await admin
      .from('distribuidoras')
      .select('razon_social, cuit')
      .eq('id', profile.distri_id)
      .single()
    razonSocial = distri?.razon_social ?? ''
    cuit = distri?.cuit ?? ''
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Editá tus datos de contacto y contraseña</p>
      </div>

      <CuentaDistriForm
        email={user.email ?? ''}
        nombre={profile?.nombre ?? ''}
        celular={profile?.celular ?? ''}
        razonSocial={razonSocial}
        cuit={cuit}
      />
    </div>
  )
}
