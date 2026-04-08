import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Images } from 'lucide-react'
import { formatearFechaHora } from '@/lib/utils'
import type { DeclaracionFoto } from '@/types'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NULL_UUID = '00000000-0000-0000-0000-000000000000'
function safe(ids: string[]) { return ids.length > 0 ? ids : [NULL_UUID] }

const DECL_LABEL: Record<DeclaracionFoto, string> = {
  producto_presente:      'Producto presente',
  producto_no_encontrado: 'Producto no encontrado',
  solo_competencia:       'Solo competencia',
}

const DECL_COLOR: Record<DeclaracionFoto, string> = {
  producto_presente:      'bg-green-100 text-green-700',
  producto_no_encontrado: 'bg-red-100 text-red-700',
  solo_competencia:       'bg-amber-100 text-amber-700',
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-amber-100 text-amber-700',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
}

export default async function RepoGondolasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>
}) {
  const params = await searchParams
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

  if (!perfil?.repositora_id) redirect('/repositora/dashboard')
  const repoId = perfil.repositora_id as string

  // Obtener IDs de fixers
  const { data: fixersData } = await admin
    .from('profiles')
    .select('id')
    .eq('repositora_id', repoId)
    .eq('tipo_actor', 'fixer')

  const fixerIds = (fixersData ?? []).map((f: { id: string }) => f.id)
  const safeFixers = safe(fixerIds)

  const estadoFiltro = params.estado ?? ''
  const pagina = Math.max(1, parseInt(params.pagina ?? '1', 10))
  const POR_PAGINA = 20
  const desde = (pagina - 1) * POR_PAGINA

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('fotos')
    .select(
      'id, url, estado, declaracion, created_at, gondolero_id, ' +
      'fixer:profiles!gondolero_id(alias, nombre), ' +
      'campana:campanas(nombre), ' +
      'comercio:comercios(nombre, direccion)',
      { count: 'exact' }
    )
    .in('gondolero_id', safeFixers)
    .order('created_at', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  if (estadoFiltro) {
    query = query.eq('estado', estadoFiltro)
  }

  const { data: fotos, count } = await query

  const lista = (fotos ?? []) as {
    id: string
    url: string
    estado: string
    declaracion: DeclaracionFoto
    created_at: string
    gondolero_id: string
    fixer: { alias: string | null; nombre: string | null } | null
    campana: { nombre: string } | null
    comercio: { nombre: string; direccion: string | null } | null
  }[]

  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const ESTADOS = [
    { value: '', label: 'Todas' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'aprobada', label: 'Aprobadas' },
    { value: 'rechazada', label: 'Rechazadas' },
    { value: 'en_revision', label: 'En revisión' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gondolas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Fotos enviadas por tus fixers · {total} en total</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {ESTADOS.map(e => (
          <a
            key={e.value}
            href={`/repositora/gondolas?estado=${e.value}&pagina=1`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              estadoFiltro === e.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {e.label}
          </a>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100">
          <Images size={40} className="text-gray-200 mb-4" />
          <p className="font-semibold text-gray-700">Sin fotos</p>
          <p className="text-sm text-gray-400 mt-1">Las fotos de tus fixers aparecerán acá.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Foto', 'Fixer', 'Comercio', 'Campaña', 'Declaración', 'Estado', 'Fecha'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {lista.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                          {f.url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={f.url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {f.fixer?.alias ?? f.fixer?.nombre ?? 'Fixer'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{f.comercio?.nombre ?? '—'}</p>
                        {f.comercio?.direccion && (
                          <p className="text-xs text-gray-400">{f.comercio.direccion}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {f.campana?.nombre ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${DECL_COLOR[f.declaracion] ?? 'bg-gray-100 text-gray-500'}`}>
                          {DECL_LABEL[f.declaracion] ?? f.declaracion}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {formatearFechaHora(f.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-3">
              {pagina > 1 && (
                <a href={`/repositora/gondolas?estado=${estadoFiltro}&pagina=${pagina - 1}`}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
                  ← Anterior
                </a>
              )}
              <span className="text-sm text-gray-400">{pagina} / {totalPaginas}</span>
              {pagina < totalPaginas && (
                <a href={`/repositora/gondolas?estado=${estadoFiltro}&pagina=${pagina + 1}`}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white">
                  Siguiente →
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
