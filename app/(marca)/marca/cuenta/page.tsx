import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { CuentaMarcaForm } from './form'

export default async function MarcaCuentaPage() {
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
    .select('nombre, celular, marca_id')
    .eq('id', user.id)
    .single()

  let razonSocial = ''
  let cuit = ''
  if (profile?.marca_id) {
    const { data: marca } = await admin
      .from('marcas')
      .select('razon_social, cuit')
      .eq('id', profile.marca_id)
      .single()
    razonSocial = marca?.razon_social ?? ''
    cuit = marca?.cuit ?? ''
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Editá tus datos de contacto y contraseña</p>
      </div>

      <CuentaMarcaForm
        email={user.email ?? ''}
        nombre={profile?.nombre ?? ''}
        celular={profile?.celular ?? ''}
        razonSocial={razonSocial}
        cuit={cuit}
      />
    </div>
  )
}
