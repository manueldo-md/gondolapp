import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { Camera, Clock, MapPin, User, TrendingUp } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana,
  calcularPorcentaje, diasRestantes, formatearFechaHora,
} from '@/lib/utils'
import type { DeclaracionFoto, EstadoFoto, TipoCampana, EstadoCampana } from '@/types'
import { MarcaFotoAcciones } from '../../../gondolas/foto-acciones'
import { TabFilter } from '../tab-filter'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'

const DECL_LABEL: Record<DeclaracionFoto, string> = {
  producto_presente: 'Presente', producto_no_encontrado: 'No encontrado', solo_competencia: 'Solo competencia',
}
const DECL_COLOR: Record<DeclaracionFoto, string> = {
  producto_presente: 'bg-green-100 text-green-700', producto_no_encontrado: 'bg-red-100 text-red-700', solo_competencia: 'bg-amber-100 text-amber-700',
}
const ESTADO_COLOR: Record<EstadoFoto, string> = {
  pendiente: 'bg-gray-100 text-gray-600', aprobada: 'bg-green-100 text-green-700', rechazada: 'bg-red-100 text-red-700', en_revision: 'bg-blue-100 text-blue-700',
}
const ESTADO_LABEL: Record<EstadoFoto, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', en_revision: 'En revisión',
}

export default async function MarcaCampanaResultadosPage({
  params, searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin.from('profiles').select('marca_id').eq('id', user.id).single()
  const marcaId = profile?.marca_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, objetivo_comercios, comercios_relevados, puntos_por_foto, marca_id')
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).marca_id !== marcaId) notFound()

  const tab = searchParams.tab ?? ''

  let fotosQuery = admin
    .from('fotos')
    .select('id, url, storage_path, declaracion, estado, precio_detectado, created_at, gondolero:profiles(nombre,alias), comercio:comercios(nombre,direccion)')
    .eq('campana_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200)
  if (tab) fotosQuery = (fotosQuery as any).eq('estado', tab)

  // Parallel queries
  const [fotosData, fotosCuenta, fotosDecl, partData] = await Promise.all([
    fotosQuery,
    admin.from('fotos').select('estado').eq('campana_id', params.id),
    admin.from('fotos').select('declaracion, precio_detectado, precio_confirmado').eq('campana_id', params.id).eq('estado', 'aprobada'),
    admin.from('participaciones').select('gondolero_id', { count: 'exact', head: true }).eq('campana_id', params.id),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosRaw = (fotosData.data ?? []) as any[]

  // Signed URLs
  const fotos = await Promise.all(fotosRaw.map(async (f: any) => {
    let signedUrl: string | null = null
    if (f.storage_path) {
      const { data: s } = await admin.storage.from('fotos-gondola').createSignedUrl(f.storage_path, 3600)
      signedUrl = s?.signedUrl ?? null
    }
    return { ...f, signedUrl: signedUrl ?? f.url ?? null }
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = ((fotosCuenta.data ?? []) as any[]).reduce((acc: Record<string,number>, f: any) => {
    acc[f.estado] = (acc[f.estado] ?? 0) + 1; return acc
  }, {} as Record<string,number>)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const declData = (fotosDecl.data ?? []) as any[]
  const declCounts: Record<string, number> = {}
  let preciosArr: number[] = []
  for (const f of declData) {
    declCounts[f.declaracion] = (declCounts[f.declaracion] ?? 0) + 1
    const p = f.precio_confirmado ?? f.precio_detectado
    if (p != null && p > 0) preciosArr.push(p)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  const progreso = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const totalFotos = Object.values(counts).reduce((a,b) => a+b, 0)
  const fotosAprobadas = counts['aprobada'] ?? 0
  const gondoleroCount = partData.count ?? 0
  const totalDeclFotos = Object.values(declCounts).reduce((a,b) => a+b, 0)

  const precioMin = preciosArr.length ? Math.min(...preciosArr) : null
  const precioMax = preciosArr.length ? Math.max(...preciosArr) : null
  const precioAvg = preciosArr.length ? Math.round(preciosArr.reduce((a,b) => a+b,0) / preciosArr.length) : null

  const DECLS: { key: string; label: string; color: string }[] = [
    { key: 'producto_presente',      label: 'Presente',         color: 'bg-green-400' },
    { key: 'producto_no_encontrado', label: 'No encontrado',    color: 'bg-red-400' },
    { key: 'solo_competencia',       label: 'Solo competencia', color: 'bg-amber-400' },
  ]

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/marca/campanas"
        detalleHref={`/marca/campanas/${params.id}/detalle`}
        resultadosHref={`/marca/campanas/${params.id}/resultados`}
        activo="resultados"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Fotos totales',  value: totalFotos,           color: 'text-gray-900' },
          { label: 'Aprobadas',      value: fotosAprobadas,        color: 'text-green-600' },
          { label: 'Pendientes',     value: counts['pendiente']??0, color: 'text-amber-600' },
          { label: 'Gondoleros',     value: gondoleroCount,        color: 'text-gondo-indigo-600' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Progreso */}
      {c.objetivo_comercios && c.objetivo_comercios > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span className="flex items-center gap-1"><TrendingUp size={12}/> Avance de la campaña</span>
            <span className={dias !== null && dias <= 3 ? 'text-red-500 font-medium' : ''}>{dias !== null ? `${dias} días restantes` : ''}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-gondo-indigo-600 rounded-full transition-all" style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-right">{c.comercios_relevados}/{c.objetivo_comercios} comercios ({progreso}%)</p>
        </div>
      )}

      {/* Declaraciones */}
      {totalDeclFotos > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Resultados de presencia</h3>
          <div className="space-y-3">
            {DECLS.map(d => {
              const n = declCounts[d.key] ?? 0
              const pct = totalDeclFotos > 0 ? Math.round((n / totalDeclFotos) * 100) : 0
              return (
                <div key={d.key}>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{d.label}</span>
                    <span className="font-semibold">{n} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${d.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Precios (solo si tipo=precio) */}
      {c.tipo === 'precio' && precioMin !== null && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Rango de precios relevados</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-xl font-bold text-green-700">${precioMin}</p>
              <p className="text-xs text-gray-500 mt-0.5">Mínimo</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xl font-bold text-blue-700">${precioAvg}</p>
              <p className="text-xs text-gray-500 mt-0.5">Promedio</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <p className="text-xl font-bold text-red-700">${precioMax}</p>
              <p className="text-xs text-gray-500 mt-0.5">Máximo</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">Basado en {preciosArr.length} fotos con precio</p>
        </div>
      )}

      {/* Grid de fotos */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <TabFilter tabActivo={tab} counts={counts} />
        <p className="text-sm text-gray-500">
          {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
          {tab ? ` ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}` : ''}
        </p>
      </div>

      {fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Camera size={32} className="text-gray-300 mb-4" />
          <p className="text-sm text-gray-400">
            {tab ? `No hay fotos ${ESTADO_LABEL[tab as EstadoFoto]?.toLowerCase() ?? tab}s.` : 'Todavía no hay fotos en esta campaña.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {fotos.map((f: any) => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
              <FotoLightbox
                src={f.signedUrl}
                alt={`Foto de ${f.comercio?.nombre ?? 'comercio'}`}
                containerClassName="relative w-full h-52 shrink-0"
              >
                <span className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado as EstadoFoto]}`}>
                  {ESTADO_LABEL[f.estado as EstadoFoto]}
                </span>
              </FotoLightbox>
              <div className="p-4 flex-1 flex flex-col gap-2.5">
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{f.comercio?.nombre ?? 'Comercio'}</p>
                    {f.comercio?.direccion && <p className="text-xs text-gray-400 truncate">{f.comercio.direccion}</p>}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600 truncate">{f.gondolero?.alias ?? f.gondolero?.nombre ?? 'Gondolero'}</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${DECL_COLOR[f.declaracion as DeclaracionFoto]}`}>
                    {DECL_LABEL[f.declaracion as DeclaracionFoto]}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
                  {f.precio_detectado != null ? <span className="font-medium text-gray-600">${f.precio_detectado}</span> : <span />}
                  <div className="flex items-center gap-1"><Clock size={11} /><span>{formatearFechaHora(f.created_at)}</span></div>
                </div>
              </div>
              {f.estado === 'pendiente' && (
                <div className="px-4 pb-4 shrink-0">
                  <MarcaFotoAcciones fotoId={f.id} estado={f.estado} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
