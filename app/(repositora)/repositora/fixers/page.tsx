import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface FixerRow {
  id: string
  nombre: string | null
  alias: string | null
  activo: boolean
  fotos_aprobadas: number
  created_at: string
}

interface SolicitudRow {
  id: string
  fixer_id: string
  estado: string
  created_at: string
  fixer: { nombre: string | null; alias: string | null; celular: string | null } | null
}

export default async function FixersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (admin as any)
    .from('profiles')
    .select('repositora_id')
    .eq('id', user.id)
    .single()

  const repoId: string = perfil?.repositora_id ?? ''
  if (!repoId) redirect('/repositora/dashboard')

  const [fixersRes, solicitudesRes] = await Promise.all([
    admin
      .from('profiles')
      .select('id, nombre, alias, activo, fotos_aprobadas, created_at')
      .eq('repositora_id', repoId)
      .eq('tipo_actor', 'fixer')
      .order('created_at', { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .select('id, fixer_id, estado, created_at, fixer:profiles!fixer_id(nombre, alias, celular)')
      .eq('repositora_id', repoId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false }),
  ])

  const fixers = (fixersRes.data ?? []) as FixerRow[]
  const solicitudes = (solicitudesRes.data ?? []) as SolicitudRow[]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fixers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {fixers.length} fixer{fixers.length !== 1 ? 's' : ''} vinculado{fixers.length !== 1 ? 's' : ''}
            {solicitudes.length > 0 && ` · ${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''} pendiente${solicitudes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Solicitudes pendientes */}
      {solicitudes.length > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
            <Clock size={15} className="text-blue-600" />
            Solicitudes de vinculación pendientes
          </h2>
          <div className="space-y-3">
            {solicitudes.map(s => (
              <div key={s.id} className="bg-white rounded-lg border border-blue-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {s.fixer?.alias ?? s.fixer?.nombre ?? 'Fixer sin nombre'}
                  </p>
                  {s.fixer?.celular && (
                    <p className="text-xs text-gray-500">{s.fixer.celular}</p>
                  )}
                  <p className="text-xs text-gray-400">{tiempoRelativo(s.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">
                    <CheckCircle2 size={13} />
                    Aprobar
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
                    <XCircle size={13} />
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de fixers */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Users size={16} className="text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">Fixers vinculados</h2>
        </div>

        {fixers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="text-gray-200 mb-3" />
            <p className="font-semibold text-gray-700">Sin fixers vinculados</p>
            <p className="text-sm text-gray-400 mt-1">Los fixers que se unan a tu repositora aparecerán acá.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Fixer', 'Fotos aprobadas', 'Estado', 'Registro'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fixers.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-gray-900">{f.alias ?? f.nombre ?? 'Sin nombre'}</p>
                      {f.nombre && f.alias && (
                        <p className="text-xs text-gray-400">{f.nombre}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-gray-600">{f.fotos_aprobadas ?? 0}</td>
                    <td className="px-4 py-3.5">
                      {f.activo ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">
                      {tiempoRelativo(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sección de invitación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Invitar fixers</h2>
        <p className="text-sm text-gray-500 mb-4">
          Compartí el ID de tu repositora para que los fixers puedan solicitar vinculación.
        </p>
        <div className="flex items-center gap-3">
          <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 font-mono truncate">
            {repoId}
          </code>
        </div>
      </div>
    </div>
  )
}
