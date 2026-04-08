import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AceptarInvitacionFixerBtn } from './aceptar-btn'

export default async function FixerVinculacionPage({
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenData } = await (admin as any)
    .from('fixer_invitacion_tokens')
    .select('id, actor_id, tipo, usado, expira_at')
    .eq('token', token)
    .maybeSingle()

  const ahora = new Date()
  const tokenValido = tokenData && !tokenData.usado && new Date(tokenData.expira_at) > ahora

  // Resolver nombre del actor invitante
  let actorNombre = 'el equipo'
  if (tokenValido) {
    if (tokenData.tipo === 'distri') {
      const { data: distriData } = await admin
        .from('distribuidoras')
        .select('razon_social')
        .eq('id', tokenData.actor_id)
        .single()
      actorNombre = distriData?.razon_social ?? actorNombre
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: repoData } = await (admin as any)
        .from('repositoras')
        .select('razon_social')
        .eq('id', tokenData.actor_id)
        .single()
      actorNombre = repoData?.razon_social ?? actorNombre
    }
  }

  // Ver si el fixer está logueado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">⛔</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link inválido o expirado</h1>
          <p className="text-sm text-gray-500 mb-6">
            Este link de invitación ya fue usado o expiró. Pedile al equipo que genere uno nuevo.
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
    redirect(`/auth?redirect=/fixer-vinculacion?token=${token}`)
  }

  // Verificar que el usuario es fixer
  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor, distri_id, repositora_id, nombre, alias')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'fixer') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Este link es solo para fixers</h1>
          <p className="text-sm text-gray-500">Solo los fixers pueden vincularse usando este link.</p>
        </div>
      </div>
    )
  }

  // Verificar si ya está vinculado a este actor
  const yaVinculado = tokenData.tipo === 'distri'
    ? profile.distri_id === tokenData.actor_id
    : profile.repositora_id === tokenData.actor_id

  if (yaVinculado) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Ya estás vinculado</h1>
          <p className="text-sm text-gray-500 mb-6">Ya sos parte de {actorNombre}.</p>
          <a href="/gondolero/perfil" className="inline-block px-6 py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl">
            Ver mi perfil
          </a>
        </div>
      </div>
    )
  }

  const nombreFixer = profile.alias ?? profile.nombre ?? 'Fixer'

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
          <p className="text-sm text-gray-500 mb-1">Hola, {nombreFixer} 👋</p>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            {actorNombre} te invita a su equipo
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Al unirte, {actorNombre} podrá coordinar tu trabajo como fixer y asignarte misiones.
          </p>

          <AceptarInvitacionFixerBtn
            tokenId={tokenData.id}
            fixerId={user.id}
            actorId={tokenData.actor_id}
            actorNombre={actorNombre}
            actorTipo={tokenData.tipo as 'distri' | 'repositora'}
          />
        </div>
      </div>
    </div>
  )
}
