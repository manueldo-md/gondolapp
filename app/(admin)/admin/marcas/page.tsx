import { createClient as createAdminClient } from '@supabase/supabase-js'
import { CheckCircle2, AlertCircle, Coins } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { ValidarMarcaBtn } from './validar-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MarcasAdminPage() {
  const admin = adminClient()

  const { data: marcasRaw } = await admin
    .from('marcas')
    .select('id, razon_social, cuit, validada, tokens_disponibles, created_at')
    .order('created_at', { ascending: false })

  const marcas = marcasRaw ?? []

  // Campañas activas por marca
  const marcaIds = marcas.map((m: { id: string }) => m.id)
  let campanasActivasMap: Record<string, number> = {}
  if (marcaIds.length > 0) {
    const { data: campanasData } = await admin
      .from('campanas')
      .select('marca_id')
      .in('marca_id', marcaIds)
      .eq('estado', 'activa')
    campanasActivasMap = ((campanasData ?? []) as { marca_id: string }[]).reduce(
      (acc, c) => { acc[c.marca_id] = (acc[c.marca_id] ?? 0) + 1; return acc },
      {} as Record<string, number>
    )
  }

  const validadas   = marcas.filter((m: { validada: boolean }) => m.validada).length
  const pendientes  = marcas.length - validadas

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Marcas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {marcas.length} marcas · {validadas} validadas · {pendientes} pendientes
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Marca', 'CUIT', 'Estado', 'Tokens', 'Campañas activas', 'Registro', 'Acción'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(marcas as any[]).map(m => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-gray-900">{m.razon_social}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500 font-mono">
                    {m.cuit ?? '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    {m.validada ? (
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
                      <Coins size={13} className="text-gondo-indigo-600" />
                      <span className="text-sm font-semibold text-gray-700">
                        {(m.tokens_disponibles ?? 0).toLocaleString('es-AR')}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">
                    {campanasActivasMap[m.id] ?? 0}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(m.created_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {!m.validada && <ValidarMarcaBtn marcaId={m.id} />}
                      <a
                        href={`/admin/campanas?marca=${m.id}`}
                        className="text-xs text-gondo-indigo-600 hover:underline font-medium"
                      >
                        Ver campañas →
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {marcas.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin marcas registradas</p>
          )}
        </div>
      </div>
    </div>
  )
}
