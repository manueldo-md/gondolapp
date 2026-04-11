import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, Clock, Target } from 'lucide-react'
import { labelEstadoCampana, colorEstadoCampana, diasRestantes, calcularPorcentaje } from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface CampanaRow {
  id: string
  nombre: string
  tipo: TipoCampana
  estado: EstadoCampana
  fecha_inicio: string | null
  fecha_fin: string | null
  objetivo_comercios: number | null
  tope_total_comercios: number | null
  comercios_relevados: number
  puntos_por_foto: number
  puntos_por_mision: number
  financiada_por: string
  instruccion: string | null
  created_at: string
}

const TIPO_COLOR: Record<TipoCampana, string> = {
  relevamiento: 'bg-indigo-50 text-indigo-600',
  precio:       'bg-amber-50 text-amber-600',
  cobertura:    'bg-blue-50 text-blue-600',
  pop:          'bg-purple-100 text-purple-700',
  mapa:         'bg-green-50 text-green-600',
  comercios:    'bg-green-50 text-green-600',
  interna:      'bg-gray-100 text-gray-500',
}

export default async function RepoCampanasPage() {
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
  const repoId: string = perfil.repositora_id

  // Obtener relaciones explícitas de esta repositora
  const [distrisRes, marcasRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('distri_repo_relaciones')
      .select('distri_id')
      .eq('repositora_id', repoId)
      .eq('estado', 'activa'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('marca_repo_relaciones')
      .select('marca_id')
      .eq('repositora_id', repoId)
      .eq('estado', 'activa'),
  ])

  const distrisRelacionadas = ((distrisRes.data ?? []) as { distri_id: string }[]).map(d => d.distri_id)
  const marcasRelacionadas  = ((marcasRes.data ?? []) as { marca_id: string }[]).map(m => m.marca_id)

  // Sin relaciones → sin campañas
  const sinRelaciones = distrisRelacionadas.length === 0 && marcasRelacionadas.length === 0
  let campanas: CampanaRow[] = []

  if (!sinRelaciones) {
    // Campañas para fixers de distribuidoras directamente relacionadas
    const orConditions: string[] = []
    if (distrisRelacionadas.length > 0) {
      // Se filtrará en memoria tras la query usando distrisRelacionadas
    }
    if (marcasRelacionadas.length > 0) {
      // Se filtrará en memoria tras la query usando marcasRelacionadas
    }

    // Query base: campañas de fixer activas o pausadas
    let query = admin
      .from('campanas')
      .select('id, nombre, tipo, estado, fecha_inicio, fecha_fin, objetivo_comercios, tope_total_comercios, comercios_relevados, puntos_por_foto, puntos_por_mision, financiada_por, instruccion, created_at, distri_id, marca_id')
      .eq('actor_campana', 'fixer')
      .in('estado', ['activa', 'pausada'])
      .order('created_at', { ascending: false })

    // Filtrar por distris Y marcas relacionadas usando OR
    if (distrisRelacionadas.length > 0 && marcasRelacionadas.length > 0) {
      query = query.or(
        `distri_id.in.(${distrisRelacionadas.join(',')}),marca_id.in.(${marcasRelacionadas.join(',')}),financiada_por.eq.gondolapp`
      )
    } else if (distrisRelacionadas.length > 0) {
      query = query.or(
        `distri_id.in.(${distrisRelacionadas.join(',')}),financiada_por.eq.gondolapp`
      )
    } else {
      query = query.or(
        `marca_id.in.(${marcasRelacionadas.join(',')}),financiada_por.eq.gondolapp`
      )
    }

    const { data } = await query
    campanas = (data ?? []) as CampanaRow[]
  }

  const lista = campanas

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Campañas para Fixers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lista.length} campaña{lista.length !== 1 ? 's' : ''} disponible{lista.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-gray-100">
          <Megaphone size={40} className="text-gray-200 mb-4" />
          <p className="font-semibold text-gray-700">Sin campañas activas para fixers</p>
          <p className="text-sm text-gray-400 mt-1">
            {sinRelaciones
              ? 'Tu repositora aún no tiene distribuidoras o marcas vinculadas.'
              : 'Las campañas de tipo fixer aparecerán acá cuando estén activas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {lista.map(c => {
            const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
            const limiteRepos = c.tope_total_comercios ?? c.objetivo_comercios
            const progreso = limiteRepos
              ? calcularPorcentaje(c.comercios_relevados, limiteRepos)
              : null

            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo]}`}>
                        {c.tipo}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(c.estado)}`}>
                        {labelEstadoCampana(c.estado)}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        Para fixers
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">{c.nombre}</h3>
                    {c.instruccion && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.instruccion}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="text-right mb-1">
                      <p className="text-xl font-bold text-blue-600">{c.puntos_por_mision > 0 ? c.puntos_por_mision : c.puntos_por_foto}</p>
                      <p className="text-xs text-gray-400">pts/misión</p>
                    </div>
                    <Link href={`/repositora/campanas/${c.id}/detalle`} className="text-xs font-semibold text-gray-600 hover:underline px-2 py-1 bg-gray-50 rounded-lg border border-gray-200 text-center">Detalle</Link>
                    <Link href={`/repositora/campanas/${c.id}/resultados`} className="text-xs font-semibold text-blue-600 hover:underline px-2 py-1 bg-blue-50 rounded-lg border border-blue-200 text-center">Resultados</Link>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500">
                  {dias !== null && (
                    <span className="flex items-center gap-1">
                      <Clock size={13} />
                      {dias === 0 ? 'Vence hoy' : `${dias} días`}
                    </span>
                  )}
                  {limiteRepos && (
                    <span className="flex items-center gap-1">
                      <Target size={13} />
                      {c.comercios_relevados}/{limiteRepos} comercios
                    </span>
                  )}
                </div>

                {progreso !== null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                      <span>Progreso</span>
                      <span>{progreso}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
