import { createClient as createAdminClient } from '@supabase/supabase-js'
import { MapPin, Camera, Store, AlertTriangle } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoComercio } from '@/types'
import { AprobarRechazarBtns } from './aprobar-rechazar-btns'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TIPO_COLOR: Record<TipoComercio, string> = {
  autoservicio: 'bg-blue-100 text-blue-700',
  almacen:      'bg-purple-100 text-purple-700',
  kiosco:       'bg-pink-100 text-pink-700',
  mayorista:    'bg-indigo-100 text-indigo-700',
  dietetica:    'bg-green-100 text-green-700',
  otro:         'bg-gray-100 text-gray-600',
}

const TIPO_LABEL: Record<TipoComercio, string> = {
  autoservicio: 'Autoservicio',
  almacen:      'Almacén',
  kiosco:       'Kiosco',
  mayorista:    'Mayorista',
  dietetica:    'Dietética',
  otro:         'Otro',
}

export default async function ComerciosPendientesPage() {
  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comerciosRaw } = await (admin as any)
    .from('comercios')
    .select(`
      id, nombre, direccion, tipo, estado, created_at, lat, lng,
      registrado_por, foto_fachada_url, campana_id,
      registrador:profiles!registrado_por(nombre, alias),
      campana:campanas!campana_id(nombre)
    `)
    .eq('estado', 'pendiente_validacion')
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comercios = ((comerciosRaw ?? []) as any[]).map(c => ({
    ...c,
    registrador_nombre: Array.isArray(c.registrador) ? c.registrador[0]?.nombre : c.registrador?.nombre,
    registrador_alias:  Array.isArray(c.registrador) ? c.registrador[0]?.alias  : c.registrador?.alias,
    campana_nombre:     Array.isArray(c.campana)     ? c.campana[0]?.nombre     : c.campana?.nombre,
  }))

  // Conteo de checks GPS por comercio
  const comercioIds = comercios.map((c: { id: string }) => c.id)
  const checksCountMap: Record<string, number> = {}
  if (comercioIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: checksData } = await (admin as any)
      .from('comercios_checks')
      .select('comercio_id')
      .in('comercio_id', comercioIds)
    for (const row of ((checksData ?? []) as { comercio_id: string }[])) {
      checksCountMap[row.comercio_id] = (checksCountMap[row.comercio_id] ?? 0) + 1
    }
  }

  // Signed URLs para fotos de fachada (desde bucket fotos-gondola, path fachadas/...)
  const fachadasSignedMap: Record<string, string> = {}
  const conFachada = comercios.filter((c: { foto_fachada_url: string | null }) => c.foto_fachada_url)
  if (conFachada.length > 0) {
    await Promise.all(
      conFachada.map(async (c: { id: string; foto_fachada_url: string }) => {
        // Intentar desde fotos-gondola primero (nuevo flujo), luego fotos-fachada (flujo viejo)
        let signedUrl: string | null = null
        if (c.foto_fachada_url.startsWith('fachadas/')) {
          const { data } = await admin.storage
            .from('fotos-gondola')
            .createSignedUrl(c.foto_fachada_url, 3600)
          signedUrl = data?.signedUrl ?? null
        }
        if (!signedUrl) {
          const { data } = await admin.storage
            .from('fotos-fachada')
            .createSignedUrl(c.foto_fachada_url, 3600)
          signedUrl = data?.signedUrl ?? null
        }
        if (signedUrl) fachadasSignedMap[c.id] = signedUrl
      })
    )
  }

  // Detectar posibles duplicados: cargar todos los activos y calcular distancia por JS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activos } = await (admin as any)
    .from('comercios')
    .select('id, nombre, lat, lng')
    .eq('estado', 'activo')

  function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000
    const phi1 = (lat1 * Math.PI) / 180
    const phi2 = (lat2 * Math.PI) / 180
    const dPhi = ((lat2 - lat1) * Math.PI) / 180
    const dLambda = ((lng2 - lng1) * Math.PI) / 180
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const posiblesDuplicados = new Set<string>()
  if (activos) {
    for (const c of comercios as { id: string; lat: number; lng: number }[]) {
      for (const a of activos as { id: string; lat: number; lng: number }[]) {
        if (c.lat && c.lng && a.lat && a.lng) {
          if (distanciaMetros(c.lat, c.lng, a.lat, a.lng) <= 50) {
            posiblesDuplicados.add(c.id)
            break
          }
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Comercios pendientes de validación</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {comercios.length} comercio{comercios.length !== 1 ? 's' : ''} esperando revisión
        </p>
      </div>

      {comercios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <Store size={28} className="text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin pendientes</h3>
          <p className="text-sm text-gray-400">No hay comercios esperando validación.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Comercio', 'Tipo', 'Campaña', 'Gondolero', 'Checks', 'Fecha', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {comercios.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    {/* Nombre + fachada */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        {fachadasSignedMap[c.id] ? (
                          <a
                            href={fachadasSignedMap[c.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 mt-0.5"
                            title="Ver foto de fachada"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={fachadasSignedMap[c.id]}
                              alt={`Fachada de ${c.nombre}`}
                              className="w-10 h-10 rounded-lg object-cover border border-gray-200 hover:border-[#1E1B4B] transition-colors"
                            />
                          </a>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                            <Camera size={13} className="text-gray-300" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-gray-900 truncate max-w-[160px]">{c.nombre}</p>
                            {posiblesDuplicados.has(c.id) && (
                              <span title="Posible duplicado cercano" className="shrink-0">
                                <AlertTriangle size={13} className="text-amber-400" />
                              </span>
                            )}
                          </div>
                          {c.direccion && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <MapPin size={10} className="text-gray-400 shrink-0" />
                              <p className="text-[11px] text-gray-400 truncate max-w-[150px]">{c.direccion}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo as TipoComercio] ?? 'bg-gray-100 text-gray-600'}`}>
                        {TIPO_LABEL[c.tipo as TipoComercio] ?? c.tipo}
                      </span>
                    </td>

                    {/* Campaña */}
                    <td className="px-4 py-3.5 text-xs text-gray-500">
                      {c.campana_nombre ?? '—'}
                    </td>

                    {/* Gondolero */}
                    <td className="px-4 py-3.5 text-xs text-gray-500">
                      {c.registrador_alias ?? c.registrador_nombre ?? '—'}
                    </td>

                    {/* Checks GPS */}
                    <td className="px-4 py-3.5">
                      {(() => {
                        const n = checksCountMap[c.id] ?? 0
                        return n > 0 ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            n >= 2 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`} title={`${n} check${n !== 1 ? 's' : ''} GPS de gondoleros independientes`}>
                            📍 {n}/2
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )
                      })()}
                    </td>

                    {/* Fecha */}
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {tiempoRelativo(c.created_at)}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3.5">
                      <AprobarRechazarBtns comercioId={c.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
