import { createClient as createAdminClient } from '@supabase/supabase-js'
import { CheckCircle2, AlertCircle, Coins } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { ValidarDistriBtn } from './validar-btn'
import { NuevaDistriModal } from './nueva-distri-modal'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function DistribuidorasAdminPage() {
  const admin = adminClient()

  const { data: distrisRaw } = await admin
    .from('distribuidoras')
    .select('id, razon_social, cuit, validada, tokens_disponibles, created_at')
    .order('created_at', { ascending: false })

  const distris = distrisRaw ?? []
  const distriIds = distris.map((d: { id: string }) => d.id)

  // Gondoleros y campañas activas por distribuidora (en paralelo)
  let gondoleroMap: Record<string, number> = {}
  let campanasMap: Record<string, number> = {}

  if (distriIds.length > 0) {
    const [{ data: gondolerosData }, { data: campanasData }] = await Promise.all([
      admin.from('profiles').select('distri_id').in('distri_id', distriIds).eq('tipo_actor', 'gondolero'),
      admin.from('campanas').select('distri_id').in('distri_id', distriIds).eq('estado', 'activa'),
    ])
    gondoleroMap = ((gondolerosData ?? []) as { distri_id: string }[]).reduce(
      (acc, p) => { acc[p.distri_id] = (acc[p.distri_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
    campanasMap = ((campanasData ?? []) as { distri_id: string }[]).reduce(
      (acc, c) => { acc[c.distri_id] = (acc[c.distri_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  const validadas  = distris.filter((d: { validada: boolean }) => d.validada).length
  const pendientes = distris.length - validadas

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Distribuidoras</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {distris.length} distribuidoras · {validadas} validadas · {pendientes} pendientes
          </p>
        </div>
        <NuevaDistriModal />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Distribuidora', 'CUIT', 'Estado', 'Tokens', 'Gondoleros', 'Campañas activas', 'Registro', 'Acción'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(distris as any[]).map(d => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{d.razon_social}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">
                    {d.cuit ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {d.validada ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 size={14} />
                        <span className="text-xs font-semibold">Validada</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-500">
                        <AlertCircle size={14} />
                        <span className="text-xs font-semibold">Pendiente</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      <Coins size={13} className="text-gondo-amber-400" />
                      <span className="text-sm font-semibold text-gray-700">
                        {(d.tokens_disponibles ?? 0).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">
                    {gondoleroMap[d.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">
                    {campanasMap[d.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(d.created_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    {!d.validada && <ValidarDistriBtn distriId={d.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {distris.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin distribuidoras registradas</p>
          )}
        </div>
      </div>
    </div>
  )
}
