import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Clock, Target, Camera, Building2, AlertCircle, LogIn } from 'lucide-react'
import { InvitacionAccionesRepo } from './invitacion-acciones'
import type { TipoCampana } from '@/types'
import { labelTipoCampana } from '@/lib/utils'

const TIPO_COLOR: Record<TipoCampana, string> = {
  relevamiento: 'bg-indigo-100 text-indigo-700',
  precio:       'bg-amber-100 text-amber-700',
  cobertura:    'bg-blue-100 text-blue-700',
  pop:          'bg-purple-100 text-purple-700',
  mapa:         'bg-green-100 text-green-700',
  comercios:    'bg-green-100 text-green-700',
  interna:      'bg-gray-100 text-gray-500',
}

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function InvitacionCampanaRepoPage({
  params,
}: {
  params: { token: string }
}) {
  const admin = adminClient()

  // Verificar token
  const ahora = new Date().toISOString()
  const { data: tokenRow } = await admin
    .from('campana_tokens')
    .select('id, campana_id, repositora_id, usado, expira_at')
    .eq('token', params.token)
    .maybeSingle()

  if (!tokenRow) {
    return <ErrorPage mensaje="Link inválido o expirado" detalle="Este link no existe. Pedile a la marca que te envíe uno nuevo." />
  }

  if (tokenRow.usado) {
    return <ErrorPage mensaje="Invitación ya procesada" detalle="Esta invitación ya fue aceptada o rechazada anteriormente." />
  }

  if (tokenRow.expira_at < ahora) {
    return <ErrorPage mensaje="Link expirado" detalle="Este link venció. Pedile a la marca que te genere uno nuevo." />
  }

  // Datos de la campaña
  const { data: campanaRaw } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, fecha_inicio, fecha_fin,
      tope_total_comercios, puntos_por_mision, puntos_por_foto, instruccion,
      marca:marcas(razon_social)
    `)
    .eq('id', tokenRow.campana_id)
    .maybeSingle()

  if (!campanaRaw) {
    return <ErrorPage mensaje="Campaña no encontrada" detalle="La campaña asociada a este link ya no existe." />
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campana = campanaRaw as any
  const marcaNombre = Array.isArray(campana.marca) ? campana.marca[0]?.razon_social : campana.marca?.razon_social
  const puntosEfectivos = (campana.puntos_por_mision ?? 0) > 0 ? campana.puntos_por_mision : campana.puntos_por_foto

  // Verificar si el usuario está logueado
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp.com'
  const loginUrl = `/auth?redirect=/repo/invitacion-campana/${params.token}`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-gray-900 text-lg">GondolApp</span>
          {!user && (
            <Link
              href={loginUrl}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <LogIn size={15} />
              Ingresar
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Encabezado */}
        <div>
          <p className="text-sm text-gray-500 mb-1">Invitación de campaña — Repositora</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIPO_COLOR[campana.tipo as TipoCampana] ?? 'bg-gray-100 text-gray-500'}`}>
              {labelTipoCampana(campana.tipo)}
            </span>
            {marcaNombre && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                {marcaNombre}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">{campana.nombre}</h1>
        </div>

        {/* Detalles de la campaña */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {campana.instruccion && (
            <p className="text-sm text-gray-600 leading-relaxed">{campana.instruccion}</p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Camera size={13} className="text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{puntosEfectivos}</p>
              <p className="text-[11px] text-gray-400">pts/misión</p>
            </div>
            {campana.tope_total_comercios && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target size={13} className="text-gray-400" />
                </div>
                <p className="text-lg font-bold text-gray-900">{campana.tope_total_comercios}</p>
                <p className="text-[11px] text-gray-400">comercios</p>
              </div>
            )}
            {campana.fecha_fin && (
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock size={13} className="text-gray-400" />
                </div>
                <p className="text-sm font-bold text-gray-900">
                  {new Date(campana.fecha_fin).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                </p>
                <p className="text-[11px] text-gray-400">cierre</p>
              </div>
            )}
          </div>

          {(campana.fecha_inicio || campana.fecha_fin) && (
            <div className="pt-3 border-t border-gray-100 flex gap-6 text-sm text-gray-500">
              {campana.fecha_inicio && (
                <span>Inicio: <strong className="text-gray-700">{new Date(campana.fecha_inicio).toLocaleDateString('es-AR')}</strong></span>
              )}
              {campana.fecha_fin && (
                <span>Cierre: <strong className="text-gray-700">{new Date(campana.fecha_fin).toLocaleDateString('es-AR')}</strong></span>
              )}
            </div>
          )}
        </div>

        {/* Sección de acciones */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-gray-400" />
            <h3 className="font-semibold text-gray-900">Tu respuesta</h3>
          </div>

          {user ? (
            <InvitacionAccionesRepo token={params.token} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Para aceptar o rechazar esta campaña, necesitás ingresar con tu cuenta de repositora.
              </p>
              <Link
                href={loginUrl}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                <LogIn size={15} />
                Ingresar para responder
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Esta invitación fue generada por GondolApp para {marcaNombre ?? 'una marca'}.{' '}
          <a href={appUrl} className="text-indigo-600 hover:underline">gondolapp.com</a>
        </p>

      </main>
    </div>
  )
}

function ErrorPage({ mensaje, detalle }: { mensaje: string; detalle: string }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <span className="font-bold text-gray-900 text-lg">GondolApp</span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">{mensaje}</h1>
          <p className="text-sm text-gray-500">{detalle}</p>
        </div>
      </main>
    </div>
  )
}
