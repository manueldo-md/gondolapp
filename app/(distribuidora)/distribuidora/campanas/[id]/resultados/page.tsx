import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { Camera, Clock, MapPin, User, TrendingUp } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana,
  calcularPorcentaje, diasRestantes, formatearFechaHora,
} from '@/lib/utils'
import type { EstadoFoto, TipoCampana, EstadoCampana } from '@/types'
import { FotoAcciones } from '../../../gondolas/foto-acciones'
import { TabFilter } from '../tab-filter'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'

const ESTADO_COLOR: Record<EstadoFoto, string> = {
  pendiente: 'bg-gray-100 text-gray-600', aprobada: 'bg-green-100 text-green-700', rechazada: 'bg-red-100 text-red-700', en_revision: 'bg-blue-100 text-blue-700',
}
const ESTADO_LABEL: Record<EstadoFoto, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', en_revision: 'En revisión',
}

export default async function DistriCampanaResultadosPage({
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

  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', user.id).single()
  const distriId = profile?.distri_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, objetivo_comercios, comercios_relevados, puntos_por_foto, distri_id')
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).distri_id !== distriId) notFound()

  const tab = searchParams.tab ?? ''

  const showGondolero = true

  let fotosQuery = admin
    .from('fotos')
    .select('id, url, storage_path, estado, precio_detectado, created_at, gondolero:profiles(nombre,alias), comercio:comercios(nombre,direccion)')
    .eq('campana_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (tab) fotosQuery = (fotosQuery as any).eq('estado', tab)

  const [fotosData, fotosCuenta, precioData, partData, bloquesData] = await Promise.all([
    fotosQuery,
    admin.from('fotos').select('id, estado').eq('campana_id', params.id),
    admin.from('fotos').select('precio_detectado, precio_confirmado, created_at, gondolero:profiles(alias), comercio:comercios(nombre, direccion)').eq('campana_id', params.id).eq('estado', 'aprobada'),
    admin.from('participaciones').select('gondolero_id', { count: 'exact', head: true }).eq('campana_id', params.id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('bloques_foto').select('id, orden, instruccion, bloque_campos(id, tipo, pregunta, opciones, orden)').eq('campana_id', params.id).order('orden'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosRaw = (fotosData.data ?? []) as any[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // ── Respuestas del formulario ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFotoIds = ((fotosCuenta.data ?? []) as any[]).map((f: any) => f.id as string)
  const respuestasData = allFotoIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (admin as any).from('foto_respuestas').select('foto_id, campo_id, valor, foto:fotos(created_at, gondolero:profiles(alias), comercio:comercios(nombre, direccion))').in('foto_id', allFotoIds).limit(20000)
    : { data: [] }

  const camposMap = new Map<string, { id: string; tipo: string; pregunta: string; opciones: string[] | null; orden: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const bloque of ((bloquesData.data ?? []) as any[])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const campo of (bloque.bloque_campos ?? [])) camposMap.set(campo.id, campo)
  }

  const fotoRespuestasMap = new Map<string, { campo_id: string; valor: unknown }[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRespuestas = ((respuestasData.data ?? []) as any[])
  for (const r of allRespuestas) {
    if (!fotoRespuestasMap.has(r.foto_id)) fotoRespuestasMap.set(r.foto_id, [])
    fotoRespuestasMap.get(r.foto_id)!.push({ campo_id: r.campo_id, valor: r.valor })
  }

  const campoValoresMap = new Map<string, unknown[]>()
  for (const r of allRespuestas) {
    if (!camposMap.has(r.campo_id)) continue
    if (!campoValoresMap.has(r.campo_id)) campoValoresMap.set(r.campo_id, [])
    campoValoresMap.get(r.campo_id)!.push(r.valor)
  }

  interface CampoStats { id: string; tipo: string; pregunta: string; opciones: string[] | null; orden: number; total: number; siCount?: number; noCount?: number; opcionCounts?: Record<string, number>; numAvg?: number; numMin?: number; numMax?: number; textUltimas?: string[] }
  const campoStats: CampoStats[] = []
  for (const [campoId, valores] of campoValoresMap) {
    const campo = camposMap.get(campoId)!
    const stat: CampoStats = { ...campo, total: valores.length }
    if (campo.tipo === 'binaria') {
      let si = 0, no = 0
      for (const v of valores) { (v === true || v === 'true' || v === 'Sí') ? si++ : no++ }
      stat.siCount = si; stat.noCount = no
    } else if (campo.tipo === 'seleccion_unica') {
      const cnts: Record<string, number> = {}
      for (const v of valores) { const s = String(v); cnts[s] = (cnts[s] ?? 0) + 1 }
      stat.opcionCounts = cnts
    } else if (campo.tipo === 'seleccion_multiple') {
      const cnts: Record<string, number> = {}
      for (const v of valores) { const arr = Array.isArray(v) ? v : []; for (const item of arr) { const s = String(item); cnts[s] = (cnts[s] ?? 0) + 1 } }
      stat.opcionCounts = cnts
    } else if (campo.tipo === 'numero') {
      const nums = valores.map(v => Number(v)).filter(n => !isNaN(n))
      if (nums.length > 0) { stat.numAvg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10; stat.numMin = Math.min(...nums); stat.numMax = Math.max(...nums) }
    } else if (campo.tipo === 'texto') {
      stat.textUltimas = valores.slice(-10).map(v => String(v)).filter(s => s.trim())
    }
    campoStats.push(stat)
  }
  campoStats.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

  // ── Per-campo detail rows ──
  interface RespuestaRow { valor: unknown; alias: string | null; comercioNombre: string | null; comercioDireccion: string | null; createdAt: string }
  const campoDetallesMap = new Map<string, RespuestaRow[]>()
  for (const r of allRespuestas) {
    if (!camposMap.has(r.campo_id)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fotoData = r.foto as any
    const alias = Array.isArray(fotoData?.gondolero) ? fotoData.gondolero[0]?.alias ?? null : fotoData?.gondolero?.alias ?? null
    const cnom = Array.isArray(fotoData?.comercio) ? fotoData.comercio[0]?.nombre ?? null : fotoData?.comercio?.nombre ?? null
    const cdir = Array.isArray(fotoData?.comercio) ? fotoData.comercio[0]?.direccion ?? null : fotoData?.comercio?.direccion ?? null
    const row: RespuestaRow = { valor: r.valor, alias, comercioNombre: cnom, comercioDireccion: cdir, createdAt: fotoData?.created_at ?? '' }
    if (!campoDetallesMap.has(r.campo_id)) campoDetallesMap.set(r.campo_id, [])
    campoDetallesMap.get(r.campo_id)!.push(row)
  }
  for (const [campoId, rows] of campoDetallesMap) {
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    campoDetallesMap.set(campoId, rows)
  }

  function fmtValor(valor: unknown, tipo: string): string {
    if (valor === null || valor === undefined) return '—'
    if (tipo === 'binaria') return (valor === true || valor === 'true' || valor === 'Sí') ? 'Sí' : 'No'
    if (tipo === 'seleccion_multiple' && Array.isArray(valor)) return valor.join(', ')
    return String(valor)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preciosArr: number[] = []
  for (const f of (precioData.data ?? []) as any[]) {
    const p = f.precio_confirmado ?? f.precio_detectado
    if (p != null && p > 0) preciosArr.push(p)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const precioRows = (precioData.data ?? []).reduce((acc: { alias: string|null; comercioNombre: string|null; comercioDireccion: string|null; precio: number; createdAt: string }[], f: any) => {
    const p = f.precio_confirmado ?? f.precio_detectado
    if (p != null && p > 0) {
      const alias = Array.isArray(f.gondolero) ? f.gondolero[0]?.alias ?? null : f.gondolero?.alias ?? null
      const cnom = Array.isArray(f.comercio) ? f.comercio[0]?.nombre ?? null : f.comercio?.nombre ?? null
      const cdir = Array.isArray(f.comercio) ? f.comercio[0]?.direccion ?? null : f.comercio?.direccion ?? null
      acc.push({ alias, comercioNombre: cnom, comercioDireccion: cdir, precio: p, createdAt: f.created_at ?? '' })
    }
    return acc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, []).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  const progreso = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const totalFotos = Object.values(counts).reduce((a,b) => a+b, 0)
  const fotosAprobadas = counts['aprobada'] ?? 0
  const gondoleroCount = partData.count ?? 0

  const precioMin = preciosArr.length ? Math.min(...preciosArr) : null
  const precioMax = preciosArr.length ? Math.max(...preciosArr) : null
  const precioAvg = preciosArr.length ? Math.round(preciosArr.reduce((a,b) => a+b,0) / preciosArr.length) : null

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/distribuidora/campanas"
        detalleHref={`/distribuidora/campanas/${params.id}/detalle`}
        resultadosHref={`/distribuidora/campanas/${params.id}/resultados`}
        activo="resultados"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Fotos totales',  value: totalFotos,            color: 'text-gray-900' },
          { label: 'Aprobadas',      value: fotosAprobadas,         color: 'text-green-600' },
          { label: 'Pendientes',     value: counts['pendiente']??0, color: 'text-amber-600' },
          { label: 'Gondoleros',     value: gondoleroCount,         color: 'text-gondo-amber-400' },
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
            <div className="h-full bg-gondo-amber-400 rounded-full transition-all" style={{ width: `${progreso}%` }} />
          </div>
          <p className="text-xs text-gray-400 text-right">{c.comercios_relevados}/{c.objetivo_comercios} comercios ({progreso}%)</p>
        </div>
      )}

      {/* Respuestas del formulario */}
      {campoStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Respuestas del formulario</h3>
          <div className="space-y-6">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {campoStats.map(stat => (
              <div key={stat.id}>
                <p className="text-sm font-medium text-gray-800 mb-1">{stat.pregunta}</p>
                <p className="text-xs text-gray-400 mb-2">{stat.total} respuesta{stat.total !== 1 ? 's' : ''}</p>
                {stat.tipo === 'binaria' && (
                  <div className="space-y-2">
                    {[{ label: 'Sí', n: stat.siCount ?? 0, color: 'bg-green-400' }, { label: 'No', n: stat.noCount ?? 0, color: 'bg-red-400' }].map(opt => {
                      const pct = stat.total > 0 ? Math.round((opt.n / stat.total) * 100) : 0
                      return (<div key={opt.label}><div className="flex justify-between text-xs text-gray-600 mb-1"><span>{opt.label}</span><span className="font-semibold">{opt.n} ({pct}%)</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${opt.color} rounded-full`} style={{ width: `${pct}%` }} /></div></div>)
                    })}
                  </div>
                )}
                {(stat.tipo === 'seleccion_unica' || stat.tipo === 'seleccion_multiple') && stat.opcionCounts && (
                  <div className="space-y-2">
                    {Object.entries(stat.opcionCounts).sort((a, b) => b[1] - a[1]).map(([op, n]) => {
                      const pct = stat.total > 0 ? Math.round((n / stat.total) * 100) : 0
                      return (<div key={op}><div className="flex justify-between text-xs text-gray-600 mb-1"><span>{op}</span><span className="font-semibold">{n} ({pct}%)</span></div><div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} /></div></div>)
                    })}
                  </div>
                )}
                {stat.tipo === 'numero' && stat.numAvg !== undefined && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-green-50 rounded-xl p-2"><p className="text-base font-bold text-green-700">{stat.numMin}</p><p className="text-xs text-gray-400">Mínimo</p></div>
                    <div className="bg-blue-50 rounded-xl p-2"><p className="text-base font-bold text-blue-700">{stat.numAvg}</p><p className="text-xs text-gray-400">Promedio</p></div>
                    <div className="bg-red-50 rounded-xl p-2"><p className="text-base font-bold text-red-700">{stat.numMax}</p><p className="text-xs text-gray-400">Máximo</p></div>
                  </div>
                )}
                {stat.tipo === 'texto' && stat.textUltimas && stat.textUltimas.length > 0 && (
                  <ul className="space-y-1">{stat.textUltimas.map((t, i) => (<li key={i} className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">&ldquo;{t}&rdquo;</li>))}</ul>
                )}
                {(() => {
                  const detalles = campoDetallesMap.get(stat.id) ?? []
                  if (detalles.length === 0) return null
                  return (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Detalle de respuestas</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-gray-100">
                              {showGondolero && <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Gondolero</th>}
                              <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Comercio</th>
                              <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Respuesta</th>
                              <th className="text-left py-1.5 text-gray-400 font-medium">Fecha</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detalles.map((row, ri) => (
                              <tr key={ri} className="border-b border-gray-50">
                                {showGondolero && <td className="py-1.5 pr-3 text-gray-700 font-medium">{row.alias ?? '—'}</td>}
                                <td className="py-1.5 pr-3 text-gray-600">{row.comercioNombre ?? row.comercioDireccion ?? '—'}</td>
                                <td className="py-1.5 pr-3 text-gray-700 font-medium">{fmtValor(row.valor, stat.tipo)}</td>
                                <td className="py-1.5 text-gray-400">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-AR') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
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
          {precioRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Precios relevados</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {showGondolero && <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Gondolero</th>}
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Comercio</th>
                      <th className="text-left py-1.5 pr-3 text-gray-400 font-medium">Precio</th>
                      <th className="text-left py-1.5 text-gray-400 font-medium">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {precioRows.map((row: any, ri: number) => (
                      <tr key={ri} className="border-b border-gray-50">
                        {showGondolero && <td className="py-1.5 pr-3 text-gray-700 font-medium">{row.alias ?? '—'}</td>}
                        <td className="py-1.5 pr-3 text-gray-600">{row.comercioNombre ?? row.comercioDireccion ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-gray-700 font-bold">${row.precio}</td>
                        <td className="py-1.5 text-gray-400">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('es-AR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {fotos.map((f: any) => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
              <FotoLightbox
                src={f.signedUrl}
                alt={`Foto de ${f.comercio?.nombre ?? 'comercio'}`}
                containerClassName="relative w-full h-52 shrink-0"
                modalFooter={
                  fotoRespuestasMap.has(f.id) && camposMap.size > 0
                    ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-white/80 uppercase tracking-wide mb-2">Respuestas del formulario</p>
                        {fotoRespuestasMap.get(f.id)!.map(r => {
                          const campo = camposMap.get(r.campo_id)
                          if (!campo) return null
                          return (
                            <div key={r.campo_id} className="flex justify-between gap-2">
                              <span className="text-xs text-white/70 shrink-0">{campo.pregunta}</span>
                              <span className="text-xs font-medium text-white text-right">{fmtValor(r.valor, campo.tipo)}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                    : undefined
                }
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
                <div className="flex items-center gap-1.5 min-w-0">
                  <User size={13} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 truncate">{f.gondolero?.alias ?? f.gondolero?.nombre ?? 'Gondolero'}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
                  {f.precio_detectado != null ? <span className="font-medium text-gray-600">${f.precio_detectado}</span> : <span />}
                  <div className="flex items-center gap-1"><Clock size={11} /><span>{formatearFechaHora(f.created_at)}</span></div>
                </div>
              </div>
              {f.estado === 'pendiente' && (
                <div className="px-4 pb-4 shrink-0">
                  <FotoAcciones fotoId={f.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
