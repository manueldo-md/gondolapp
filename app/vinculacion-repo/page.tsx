import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AceptarInvitacionRepoForm } from './aceptar-form'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function VinculacionRepoPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams.token

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Link de invitación inválido.</p>
        </div>
      </div>
    )
  }

  const admin = adminClient()

  // Validar token
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tokenData } = await (admin as any)
    .from('marca_repo_tokens')
    .select('id, marca_id, usado, expira_at')
    .eq('token', token)
    .single()

  if (!tokenData || tokenData.usado || new Date(tokenData.expira_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⛔</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Link inválido o expirado</h2>
          <p className="text-sm text-gray-500">Este link ya fue usado o expiró. Pedí uno nuevo a la marca.</p>
        </div>
      </div>
    )
  }

  // Verificar usuario autenticado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth?redirect=${encodeURIComponent(`/vinculacion-repo?token=${token}`)}`)
  }

  // Verificar que es repositora
  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor, repositora_id, nombre')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'repositora') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Esta invitación es solo para repositoras.</p>
        </div>
      </div>
    )
  }

  if (!profile.repositora_id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Tu usuario no tiene una repositora vinculada. Contactá al administrador.</p>
        </div>
      </div>
    )
  }

  const marcaId = tokenData.marca_id
  const repoId  = profile.repositora_id

  // Nombre de la marca
  const { data: marcaData } = await admin.from('marcas').select('razon_social').eq('id', marcaId).single()
  const marcaNombre = marcaData?.razon_social ?? 'la marca'

  // Nombre de la repositora
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: repoData } = await (admin as any).from('repositoras').select('razon_social').eq('id', repoId).single()
  const repoNombre = repoData?.razon_social ?? profile.nombre ?? 'Tu repositora'

  // Verificar si ya existe relación activa
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: relacionExistente } = await (admin as any)
    .from('marca_repo_relaciones')
    .select('id, estado')
    .eq('marca_id', marcaId)
    .eq('repositora_id', repoId)
    .maybeSingle()

  if (relacionExistente?.estado === 'activa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✅</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Ya están vinculados!</h2>
          <p className="text-sm text-gray-500">
            {repoNombre} ya tiene una relación activa con {marcaNombre}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <AceptarInvitacionRepoForm
        tokenId={tokenData.id}
        marcaId={marcaId}
        repoId={repoId}
        marcaNombre={marcaNombre}
        repoNombre={repoNombre}
      />
    </div>
  )
}
