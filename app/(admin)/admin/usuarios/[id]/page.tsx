import { createClient as createAdminClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoActor } from '@/types'
import Link from 'next/link'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TIPO_COLOR: Record<TipoActor, string> = {
  gondolero:    'bg-gondo-verde-50 text-gondo-verde-600',
  fixer:        'bg-blue-50 text-blue-600',
  distribuidora:'bg-gondo-amber-50 text-gondo-amber-400',
  marca:        'bg-gondo-indigo-50 text-gondo-indigo-600',
  admin:        'bg-red-50 text-red-600',
  repositora:   'bg-blue-50 text-blue-700',
}

const ESTADO_FOTO: Record<string, string> = {
  pendiente:  'bg-amber-50 text-amber-600',
  aprobada:   'bg-green-50 text-green-600',
  rechazada:  'bg-red-50 text-red-500',
}

export default async function UsuarioDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const admin = adminClient()
  const userId = params.id

  // Cargar en paralelo
  const [
    { data: { user: authUser }, error: authError },
    { data: profile },
    { data: fotos },
    { data: movimientos },
    { data: participaciones },
    { data: canjes },
  ] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from('profiles').select('nombre, celular, tipo_actor, nivel, puntos_disponibles, puntos_totales_ganados, tasa_aprobacion, distri_id, marca_id, created_at').eq('id', userId).single(),
    admin.from('fotos').select('id, estado, puntos_otorgados, created_at, campanas(nombre), comercios(nombre)').eq('gondolero_id', userId).order('created_at', { ascending: false }).limit(10),
    admin.from('movimientos_puntos').select('id, tipo, monto, concepto, created_at').eq('gondolero_id', userId).order('created_at', { ascending: false }).limit(10),
    admin.from('participaciones').select('id, estado, comercios_completados, puntos_acumulados, joined_at, campanas(nombre)').eq('gondolero_id', userId).order('joined_at', { ascending: false }),
    admin.from('canjes').select('id, premio, puntos, estado, created_at').eq('gondolero_id', userId).order('created_at', { ascending: false }),
  ])

  if (authError || !authUser) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bannedUntil = (authUser as any).banned_until as string | null
  const isBanned = bannedUntil ? new Date(bannedUntil) > new Date() : false

  const PREMIO_LABEL: Record<string, string> = {
    credito_celular: 'Crédito celular',
    nafta_ypf:       'Nafta YPF',
    giftcard_ml:     'Gift Card ML',
    transferencia:   'Transferencia',
  }

  const fotosTotal    = fotos?.length ?? 0
  const fotosAprobadas = fotos?.filter(f => f.estado === 'aprobada').length ?? 0

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/usuarios"
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{profile?.nombre ?? 'Sin nombre'}</h1>
          <p className="text-sm text-gray-500">{authUser.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${TIPO_COLOR[profile?.tipo_actor as TipoActor] ?? 'bg-gray-100 text-gray-500'}`}>
            {profile?.tipo_actor}
          </span>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isBanned ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
            {isBanned ? 'Inactivo' : 'Activo'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Puntos disponibles',   value: (profile?.puntos_disponibles ?? 0).toLocaleString('es-AR') },
          { label: 'Puntos totales ganados', value: (profile?.puntos_totales_ganados ?? 0).toLocaleString('es-AR') },
          { label: 'Tasa de aprobación',   value: `${Math.round(profile?.tasa_aprobacion ?? 0)}%` },
          { label: 'Fotos (últimas 10)',    value: `${fotosAprobadas}/${fotosTotal} ✓` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Datos del perfil */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Datos del perfil</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              { k: 'Email',    v: authUser.email },
              { k: 'Celular',  v: profile?.celular ?? '—' },
              { k: 'Nivel',    v: profile?.nivel ?? '—' },
              { k: 'Registro', v: tiempoRelativo(authUser.created_at) },
              { k: 'User ID',  v: userId },
            ].map(({ k, v }) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-gray-400 shrink-0">{k}</dt>
                <dd className="text-gray-800 font-medium text-right truncate max-w-[220px]">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Canjes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Canjes ({canjes?.length ?? 0})
          </h2>
          {(canjes?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400">Sin canjes</p>
          ) : (
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(canjes ?? []).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <div>
                    <p className="font-medium text-gray-800">{PREMIO_LABEL[c.premio] ?? c.premio}</p>
                    <p className="text-gray-400">{tiempoRelativo(c.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-700">{(c.puntos as number).toLocaleString('es-AR')} pts</p>
                    <p className={`font-medium ${c.estado === 'entregado' ? 'text-green-600' : c.estado === 'pendiente' ? 'text-amber-500' : 'text-gray-400'}`}>
                      {c.estado}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimas fotos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Últimas fotos</h2>
          {(fotos?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400">Sin fotos</p>
          ) : (
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(fotos ?? []).map((f: any) => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <p className="font-medium text-gray-800 truncate">{(f.comercios as any)?.nombre ?? '—'}</p>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <p className="text-gray-400 truncate">{(f.campanas as any)?.nombre ?? '—'}</p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded-full font-semibold ${ESTADO_FOTO[f.estado] ?? 'bg-gray-50 text-gray-400'}`}>
                      {f.estado}
                    </span>
                    <p className="text-gray-400 mt-0.5">{tiempoRelativo(f.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Últimos movimientos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Últimos movimientos de puntos</h2>
          {(movimientos?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-400">Sin movimientos</p>
          ) : (
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(movimientos ?? []).map((m: any) => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${m.tipo === 'credito' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {m.tipo === 'credito'
                      ? <ArrowUp size={11} className="text-green-600" />
                      : <ArrowDown size={11} className="text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 truncate">{m.concepto ?? '—'}</p>
                    <p className="text-gray-400">{tiempoRelativo(m.created_at)}</p>
                  </div>
                  <span className={`font-bold shrink-0 ${m.tipo === 'credito' ? 'text-green-600' : 'text-red-500'}`}>
                    {m.tipo === 'credito' ? '+' : '−'}{(m.monto as number).toLocaleString('es-AR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Participaciones */}
      {(participaciones?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            Campañas ({participaciones!.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Campaña', 'Estado', 'Comercios', 'Puntos acumulados', 'Desde'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 text-gray-400 font-semibold uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(participaciones ?? []).map((p: any) => (
                  <tr key={p.id}>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <td className="py-2.5 pr-4 text-gray-800 font-medium">{(p.campanas as any)?.nombre ?? '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-1.5 py-0.5 rounded-full font-semibold ${
                        p.estado === 'completada' ? 'bg-green-50 text-green-600'
                        : p.estado === 'abandonada' ? 'bg-red-50 text-red-500'
                        : 'bg-blue-50 text-blue-600'
                      }`}>{p.estado}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{p.comercios_completados ?? 0}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{(p.puntos_acumulados ?? 0).toLocaleString('es-AR')}</td>
                    <td className="py-2.5 text-gray-400">{tiempoRelativo(p.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
