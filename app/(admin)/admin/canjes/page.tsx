import { createClient as createAdminClient } from '@supabase/supabase-js'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoPremio } from '@/types'
import { ProcesarCanjeBtn } from './procesar-modal'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const PREMIO_LABEL: Record<TipoPremio, string> = {
  nafta_ypf:       '⛽ Nafta YPF',
  giftcard_ml:     '🛒 Gift Card ML',
  credito_celular: '📱 Crédito celular',
  transferencia:   '🏦 Transferencia',
}

const SLA_HS = 48

export default async function CanjesAdminPage({
  searchParams,
}: {
  searchParams: { estado?: string }
}) {
  const admin = adminClient()
  const filtroEstado = searchParams.estado ?? 'pendiente'

  let query = admin
    .from('canjes')
    .select(`
      id, premio, puntos, estado, codigo_entregado, created_at, procesado_at,
      gondolero:profiles!gondolero_id(nombre, celular)
    `)
    .order('created_at', { ascending: true })
    .limit(100)

  if (filtroEstado !== 'todos') query = query.eq('estado', filtroEstado)

  const { data: canjesRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canjes = ((canjesRaw ?? []) as any[]).map(c => {
    const horasTranscurridas = (Date.now() - new Date(c.created_at).getTime()) / 3_600_000
    const slaVencido = horasTranscurridas > SLA_HS
    const horasRestantes = Math.max(0, SLA_HS - horasTranscurridas)
    return {
      ...c,
      gondolero_nombre: Array.isArray(c.gondolero) ? c.gondolero[0]?.nombre : c.gondolero?.nombre,
      gondolero_celular: Array.isArray(c.gondolero) ? c.gondolero[0]?.celular : c.gondolero?.celular,
      slaVencido,
      horasRestantes: Math.round(horasRestantes),
    }
  })

  const FILTROS = ['pendiente', 'procesado', 'entregado', 'todos']

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Canjes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {canjes.filter(c => c.estado === 'pendiente').length} pendientes de procesar
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <a
            key={f}
            href={`/admin/canjes${f !== 'pendiente' ? `?estado=${f}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filtroEstado === f
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Gondolero', 'Premio', 'Puntos', 'Solicitado', 'SLA', 'Estado', 'Acción'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {canjes.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.slaVencido && c.estado === 'pendiente' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-sm">{c.gondolero_nombre ?? '—'}</p>
                    {c.gondolero_celular && (
                      <p className="text-[11px] text-gray-400">{c.gondolero_celular}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {PREMIO_LABEL[c.premio as TipoPremio] ?? c.premio}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.puntos}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(c.created_at)}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {c.estado === 'pendiente'
                      ? c.slaVencido
                        ? <span className="text-red-600 font-semibold">Vencido</span>
                        : <span className="text-gray-500">{c.horasRestantes}hs restantes</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      c.estado === 'pendiente'  ? 'bg-amber-100 text-amber-700' :
                      c.estado === 'procesado'  ? 'bg-blue-100 text-blue-700' :
                      c.estado === 'entregado'  ? 'bg-green-100 text-green-700' :
                                                   'bg-gray-100 text-gray-500'
                    }`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.estado === 'pendiente' && (
                      <ProcesarCanjeBtn canjeId={c.id} premio={c.premio} />
                    )}
                    {c.estado === 'procesado' && c.codigo_entregado && (
                      <span className="text-xs text-gray-500 font-mono">{c.codigo_entregado}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canjes.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin canjes</p>
          )}
        </div>
      </div>
    </div>
  )
}
