import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, CheckCircle2, XCircle } from 'lucide-react'
import { InvitarFixerPanel } from './invitar-panel'
import { FixerRepoDesvincularBtn } from './desvincular-btn'

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

export default async function FixersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: repoData } = await (admin as any)
    .from('repositoras')
    .select('razon_social')
    .eq('id', repoId)
    .single()
  const repoNombre: string = repoData?.razon_social ?? 'Mi repositora'

  // Obtener fixers vinculados (estado='aprobada') y solicitudes pendientes
  const [fixersVinculadosRes, solicitudesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .select('fixer_id')
      .eq('repositora_id', repoId)
      .eq('estado', 'aprobada'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .select('id, fixer_id, estado, created_at, fixer:profiles!fixer_id(nombre, alias, celular)')
      .eq('repositora_id', repoId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false }),
  ])

  const vinculadosIds: string[] = (fixersVinculadosRes.data ?? []).map((s: { fixer_id: string }) => s.fixer_id)
  const solicitudes = (solicitudesRes.data ?? []) as SolicitudRow[]

  // Fetch profiles de fixers vinculados
  let fixers: FixerRow[] = []
  if (vinculadosIds.length > 0) {
    const { data: profilesData } = await admin
      .from('profiles')
      .select('id, nombre, alias, activo, fotos_aprobadas, created_at')
      .in('id', vinculadosIds)
      .order('created_at', { ascending: false })
    fixers = (profilesData ?? []) as FixerRow[]
  }

  const resolvedSearchParams = await searchParams
  const tab = resolvedSearchParams.tab ?? 'vinculados'

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

      {/* Panel de invitación + solicitudes pendientes (interactivo) */}
      <InvitarFixerPanel
        repoId={repoId}
        repoNombre={repoNombre}
        solicitudesIniciales={solicitudes}
      />

      {/* Tabs */}
      <div className="flex gap-2">
        <a
          href="/repositora/fixers?tab=vinculados"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'vinculados'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Vinculados ({fixers.length})
        </a>
        <a
          href="/repositora/fixers?tab=solicitudes"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'solicitudes'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Solicitudes
          {solicitudes.length > 0 && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === 'solicitudes' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
            }`}>
              {solicitudes.length}
            </span>
          )}
        </a>
      </div>

      {/* Tab content */}
      {tab === 'solicitudes' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
          Las solicitudes pendientes aparecen arriba en el panel de invitación.
        </div>
      ) : (
        /* Vinculados */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">Fixers vinculados</h2>
          </div>

          {fixers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users size={40} className="text-gray-200 mb-3" />
              <p className="font-semibold text-gray-700">Sin fixers vinculados</p>
              <p className="text-sm text-gray-400 mt-1">Usá el link o el código del fixer para invitarlo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fixer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fotos aprobadas</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3"></th>
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
                            <XCircle size={11} /> Inactivo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <FixerRepoDesvincularBtn
                          fixerId={f.id}
                          repoId={repoId}
                          repoNombre={repoNombre}
                          fixerAlias={f.alias ?? f.nombre ?? 'El fixer'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
