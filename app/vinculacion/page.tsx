import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AceptarInvitacionBtn } from './aceptar-btn'

export default async function VinculacionPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams.token

  if (!token) {
    redirect('/')
  }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Validar el token
  const { data: tokenData } = await admin
    .from('vinculacion_tokens')
    .select('id, distri_id, usado, expira_at, distri:distribuidoras(razon_social)')
    .eq('token', token)
    .maybeSingle()

  const ahora = new Date()
  const tokenValido = tokenData && !tokenData.usado && new Date(tokenData.expira_at) > ahora
  const distriNombre = tokenValido
    ? (Array.isArray(tokenData.distri) ? tokenData.distri[0]?.razon_social : (tokenData.distri as { razon_social: string } | null)?.razon_social) ?? 'la distribuidora'
    : null

  // Ver si el gondolero está logueado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link inválido o expirado</h1>
          <p className="text-sm text-gray-500 mb-6">
            Este link de invitación ya fue usado o expiró. Pedile a la distribuidora que genere uno nuevo.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl"
          >
            Volver al inicio
          </a>
        </div>
      </div>
    )
  }

  if (!user) {
    redirect(`/auth?redirect=/vinculacion?token=${token}`)
  }

  // Verificar que el usuario es gondolero
  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor, distri_id, nombre, alias')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'gondolero') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Este link es solo para gondoleros</h1>
          <p className="text-sm text-gray-500">Solo los gondoleros pueden vincularse a una distribuidora.</p>
        </div>
      </div>
    )
  }

  if (profile.distri_id === tokenData.distri_id) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Ya estás vinculado</h1>
          <p className="text-sm text-gray-500 mb-6">Ya sos parte de {distriNombre}.</p>
          <a href="/gondolero/perfil" className="inline-block px-6 py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl">
            Ver mi perfil
          </a>
        </div>
      </div>
    )
  }

  const nombreGondolero = profile.alias ?? profile.nombre ?? 'Gondolero'

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gondo-verde-400 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GondolApp</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Hola, {nombreGondolero} 👋</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {distriNombre} te invita a su equipo
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Al unirte, {distriNombre} podrá ver tus fotos y asignarte campañas exclusivas.
            {profile.distri_id && (
              <span className="block mt-2 text-amber-600 text-xs font-medium">
                ⚠️ Al aceptar, te desvincularás de tu distribuidora actual.
              </span>
            )}
          </p>

          <AceptarInvitacionBtn
            tokenId={tokenData.id}
            gondoleroId={user.id}
            distriId={tokenData.distri_id}
            distriNombre={distriNombre ?? ''}
          />
        </div>
      </div>
    </div>
  )
}
