import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { AceptarInvitacionMarcaForm } from './aceptar-form'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function VinculacionMarcaPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams.token
  console.log('[vinculacion-marca] token:', token)

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
  const { data: tokenData, error: tokenError } = await admin
    .from('marca_distri_tokens')
    .select('id, token, iniciado_por, marca_id, distri_id, usado, expira_at')
    .eq('token', token)
    .single()

  console.log('[vinculacion-marca] tokenData:', tokenData)
  console.log('[vinculacion-marca] tokenError:', tokenError)

  if (!tokenData || tokenData.usado || new Date(tokenData.expira_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⛔</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Link inválido o expirado</h2>
          <p className="text-sm text-gray-500">Este link ya fue usado o expiró. Pedí uno nuevo a tu contacto.</p>
        </div>
      </div>
    )
  }

  // Verificar usuario autenticado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  console.log('[vinculacion-marca] user:', user?.id ?? 'no autenticado')

  if (!user) {
    redirect(`/auth?redirect=/vinculacion-marca?token=${token}`)
  }

  // Verificar tipo de actor
  const { data: profile } = await admin
    .from('profiles')
    .select('id, tipo_actor, nombre, marca_id, distri_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.tipo_actor !== 'marca' && profile.tipo_actor !== 'distribuidora')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Esta invitación es solo para marcas y distribuidoras.</p>
        </div>
      </div>
    )
  }

  // Determinar quién es quién
  const iniciadoPor = tokenData.iniciado_por as 'marca' | 'distri'
  let marcaId: string
  let distriId: string
  let otroNombre: string

  if (iniciadoPor === 'marca') {
    // Marca invita a distribuidora — el que acepta debe ser distribuidora
    if (profile.tipo_actor !== 'distribuidora' || !profile.distri_id) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
            <p className="text-gray-500">Esta invitación es para una distribuidora.</p>
          </div>
        </div>
      )
    }
    marcaId = tokenData.marca_id!
    distriId = profile.distri_id
    // Obtener nombre de la marca
    const { data: marcaData } = await admin.from('marcas').select('razon_social').eq('id', marcaId).single()
    otroNombre = marcaData?.razon_social ?? 'la marca'
  } else {
    // Distri invita a marca — el que acepta debe ser marca
    if (profile.tipo_actor !== 'marca' || !profile.marca_id) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
            <p className="text-gray-500">Esta invitación es para una marca.</p>
          </div>
        </div>
      )
    }
    distriId = tokenData.distri_id!
    marcaId = profile.marca_id
    // Obtener nombre de la distribuidora
    const { data: distriData } = await admin.from('distribuidoras').select('razon_social').eq('id', distriId).single()
    otroNombre = distriData?.razon_social ?? 'la distribuidora'
  }

  // Verificar si ya existe relación activa
  const { data: relacionExistente } = await admin
    .from('marca_distri_relaciones')
    .select('id, estado')
    .eq('marca_id', marcaId)
    .eq('distri_id', distriId)
    .single()

  if (relacionExistente?.estado === 'activa') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✅</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Ya están vinculados!</h2>
          <p className="text-sm text-gray-500">Tu cuenta ya tiene una relación activa con {otroNombre}.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <AceptarInvitacionMarcaForm
        tokenId={tokenData.id}
        marcaId={marcaId}
        distriId={distriId}
        iniciadoPor={iniciadoPor}
        otroNombre={otroNombre}
        miNombre={profile.nombre ?? 'Tu empresa'}
      />
    </div>
  )
}
