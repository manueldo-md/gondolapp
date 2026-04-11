import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { Calendar, Target, Coins, Clock, Users, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana, diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ESTADO_PART_COLOR: Record<string, string> = {
  activa:     'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  abandonada: 'bg-gray-100 text-gray-500',
}
const ESTADO_PART_LABEL: Record<string, string> = {
  activa:     'Activa',
  completada: 'Completada',
  abandonada: 'Abandonada',
}

export default async function RepoCampanaDetallePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient() as any

  const { data: perfil } = await admin
    .from('profiles')
    .select('repositora_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.repositora_id) redirect('/repositora/dashboard')
  const repoId: string = perfil.repositora_id

  // Cargar campaña
  const { data: campanaRaw, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por, via_ejecucion,
      fecha_inicio, fecha_fin,
      objetivo_comercios, tope_total_comercios, comercios_relevados,
      max_comercios_por_gondolero, min_comercios_para_cobrar,
      puntos_por_foto, puntos_por_mision, instruccion,
      distri_id, marca_id, repositora_id, created_at,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido ),
      campana_localidades ( localidades ( nombre ) )
    `)
    .eq('id', params.id)
    .single()

  if (error || !campanaRaw) notFound()

  const c = campanaRaw as any

  // Verificar que esta campaña pertenece a esta repositora
  // (puede ser directa via repositora_id, o via distri/marca relacionada)
  const esDirecta = c.repositora_id === repoId

  if (!esDirecta) {
    // Verificar relaciones activas con la distri o marca de la campaña
    const checks = await Promise.all([
      c.distri_id ? admin
        .from('distri_repo_relaciones')
        .select('id')
        .eq('repositora_id', repoId)
        .eq('distri_id', c.distri_id)
        .eq('estado', 'activa')
        .maybeSingle() : Promise.resolve({ data: null }),
      c.marca_id ? admin
        .from('marca_repo_relaciones')
        .select('id')
        .eq('repositora_id', repoId)
        .eq('marca_id', c.marca_id)
        .eq('estado', 'activa')
        .maybeSingle() : Promise.resolve({ data: null }),
    ])
    const tieneRelacion = checks.some(r => r.data !== null)
    if (!tieneRelacion) notFound()
  }

  // Participaciones de fixers en esta campaña
  const { data: partData } = await admin
    .from('participaciones')
    .select('id, estado, comercios_completados, joined_at, gondolero:profiles(nombre, alias, tipo_actor)')
    .eq('campana_id', params.id)
    .order('joined_at', { ascending: false })

  const participaciones = ((partData ?? []) as any[]).map((p: any) => ({
    ...p,
    gondolero: Array.isArray(p.gondolero) ? (p.gondolero[0] ?? null) : p.gondolero,
  }))

  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const puntosEfectivos = (c.puntos_por_mision ?? 0) > 0 ? c.puntos_por_mision : c.puntos_por_foto
  const marcaNombre = Array.isArray(c.marca) ? c.marca[0]?.razon_social : c.marca?.razon_social
  const creadorLabel = c.financiada_por === 'distri' ? 'Distribuidora' : (marcaNombre ?? 'Marca')
  const limiteComercio = c.tope_total_comercios ?? c.objetivo_comercios

  const zonasActuales: string[] = ((c.campana_localidades ?? []) as any[])
    .map((cz: any) => Array.isArray(cz.localidades) ? cz.localidades[0]?.nombre : cz.localidades?.nombre)
    .filter(Boolean)

  const bloques = ((c.bloques_foto ?? []) as any[]).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

  const fechaCreacion = new Date(c.created_at).toLocaleString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div>
      {/* Nav */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/repositora/campanas"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={15} />
          Campañas
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-900 truncate max-w-xs">{c.nombre}</span>
      </div>

      {/* Info básica */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            Para fixers
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(c.estado as EstadoCampana)}`}>
            {labelEstadoCampana(c.estado as EstadoCampana)}
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gondo-indigo-50 text-gondo-indigo-600">
            {labelTipoCampana(c.tipo as TipoCampana)}
          </span>
          {marcaNombre && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {marcaNombre}
            </span>
          )}
        </div>

        <h1 className="text-lg font-bold text-gray-900 mb-4">{c.nombre}</h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {c.fecha_inicio && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Inicio</p>
                <p className="font-medium text-gray-900">{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</p>
              </div>
            </div>
          )}
          {c.fecha_fin && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Cierre{dias !== null ? ` · ${dias}d` : ''}</p>
                <p className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                  {new Date(c.fecha_fin).toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>
          )}
          {limiteComercio && (
            <div className="flex items-start gap-2">
              <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Tope global</p>
                <p className="font-medium text-gray-900">{limiteComercio} comercios</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Coins size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Pts/misión</p>
              <p className="font-bold text-blue-600">{puntosEfectivos}</p>
            </div>
          </div>
          {c.max_comercios_por_gondolero && (
            <div className="flex items-start gap-2">
              <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Máx. por fixer</p>
                <p className="font-medium text-gray-900">{c.max_comercios_por_gondolero} comercios</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Mín. para cobrar</p>
              <p className="font-medium text-gray-900">{c.min_comercios_para_cobrar} fotos</p>
            </div>
          </div>
        </div>

        {/* Progreso */}
        {limiteComercio && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
              <span>Progreso global</span>
              <span>{c.comercios_relevados ?? 0}/{limiteComercio} comercios</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round(((c.comercios_relevados ?? 0) / limiteComercio) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Instrucción */}
      {c.instruccion && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Instrucciones</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{c.instruccion}</p>

          {bloques.length > 0 && (
            <div className="mt-4 space-y-2">
              {bloques.map((b: any, i: number) => (
                <div key={b.id} className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-600">
                  <span className="text-xs font-semibold text-gray-400 uppercase mr-2">Paso {i + 1}</span>
                  {b.instruccion}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zonas */}
      {zonasActuales.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Zonas</h3>
          <div className="flex flex-wrap gap-2">
            {zonasActuales.map((zona, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium border border-blue-100">
                {zona}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Info de campaña */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Información</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-gray-400">Creada por</dt>
              <dd className="font-medium text-gray-900">{creadorLabel}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-gray-400">Fecha de creación</dt>
              <dd className="font-medium text-gray-900">{fechaCreacion}</dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Fixers participando */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Users size={14} className="text-gray-400" />
          Fixers ({participaciones.length})
        </h3>

        {participaciones.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aún no hay fixers participando en esta campaña.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {participaciones.map((p: any) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.gondolero?.alias ?? p.gondolero?.nombre ?? 'Fixer'}
                  </p>
                  <p className="text-xs text-gray-400">{p.comercios_completados} comercios</p>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${ESTADO_PART_COLOR[p.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                  {ESTADO_PART_LABEL[p.estado] ?? p.estado}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
