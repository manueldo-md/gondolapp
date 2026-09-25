import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { MapPin, Camera, Store, AlertTriangle } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoComercio } from '@/types'
import { AprobarRechazarBtnsDistri } from './aprobar-rechazar-btns'
import { firmarFachadas } from '@/lib/storage-fotos'
import { SelectorLocalidad } from '@/components/shared/selector-localidad'
import { gondolerosParaPendientes } from '@/lib/comercios-pendientes-distri'
import { asignarLocalidadDistri } from './actions'

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

/** Un embed de PostgREST llega como objeto o como array segun el caso. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uno = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** "Colon — Colon, Entre Rios": la cadena entera, que es lo que permite ver
 *  que la sugerencia esta mal sin abrir nada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function etiquetaDe(l: any): string | null {
  if (!l) return null
  const d = uno(l.departamentos)
  const p = uno(d?.provincias)
  return d && p ? l.nombre + ' — ' + d.nombre + ', ' + p.nombre : l.nombre
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default async function ComerciosPendientesDistriPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single() as { data: { distri_id: string | null } | null }

  const distriId = profile?.distri_id
  if (!distriId) redirect('/distribuidora/dashboard')

  // ── QUÉ COMERCIOS LE TOCAN A ESTA DISTRI: los de SUS GONDOLEROS ──────────
  // Hasta el 25/9/2026 esto filtraba por las CAMPAÑAS de la distri
  // (`.in('campana_id', …)`), y `campana_id` solo lo escribe el alta de una
  // campaña de altas. El alta oportunista —el camino normal— no lo escribe **a
  // propósito**: si lo hiciera, la fachada se cobraría como unidad de pago.
  //
  // Medido: 7 pendientes en dev y 8 en prod, y **cero visibles en las dos**.
  // Esta pantalla no mostró un solo comercio desde que existe.
  //
  // El criterio vive en lib/comercios-pendientes-distri.ts, compartido con el
  // badge del sidebar, que tenía la misma consulta copiada.
  const gondoleroIds = await gondolerosParaPendientes(distriId, admin)

  // Comercios pendientes cargados por los gondoleros de esta distri
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comerciosRaw } = gondoleroIds.length > 0
    ? await (admin as any)
        .from('comercios')
        .select(`
          id, nombre, direccion, tipo, estado, created_at,
          registrado_por, foto_fachada_url, campana_id,
          localidad_id, localidad_sugerida_id, localidad_sugerida_estado, localidad_sugerida_texto,
          localidad:localidades!localidad_id(nombre),
          sugerida:localidades!localidad_sugerida_id(nombre, departamentos!inner(nombre, provincias!inner(nombre))),
          registrador:profiles!registrado_por(nombre, alias),
          campana:campanas!campana_id(nombre)
        `)
        .eq('estado', 'pendiente_validacion')
        .in('registrado_por', gondoleroIds)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comercios = ((comerciosRaw ?? []) as any[]).map(c => ({
    ...c,
    registrador_nombre: Array.isArray(c.registrador) ? c.registrador[0]?.nombre : c.registrador?.nombre,
    registrador_alias:  Array.isArray(c.registrador) ? c.registrador[0]?.alias  : c.registrador?.alias,
    campana_nombre:     Array.isArray(c.campana)     ? c.campana[0]?.nombre     : c.campana?.nombre,
    // Los embeds de PostgREST vienen como objeto o como array segun el caso.
    localidad_nombre:   uno(c.localidad)?.nombre ?? null,
    sugerida_etiqueta:  etiquetaDe(uno(c.sugerida)),
  }))

  // Signed URLs para fotos de fachada
  const fachadasSignedMap: Record<string, string> = {}
  // Firmar las fachadas pasa por `firmarFachadas`: la columna tiene dos formatos
  // —storage path y URL completa— y firmar el valor crudo falla en las filas con
  // URL. Ver lib/storage-fotos.ts.
  Object.assign(fachadasSignedMap, await firmarFachadas(comercios, admin))

  // Detectar posibles duplicados — lat/lng se obtienen en query separada, solo server-side
  const comercioIds = comercios.map((c: { id: string }) => c.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: pendientesGeo }, { data: activos }] = await Promise.all([
    comercioIds.length > 0
      ? (admin as any).from('comercios').select('id, lat, lng').in('id', comercioIds)
      : Promise.resolve({ data: [] }),
    (admin as any).from('comercios').select('id, lat, lng').eq('estado', 'activo'),
  ])

  const posiblesDuplicados = new Set<string>()
  if (pendientesGeo && activos) {
    for (const c of pendientesGeo as { id: string; lat: number; lng: number }[]) {
      for (const a of activos as { id: string; lat: number; lng: number }[]) {
        if (c.lat && c.lng && a.lat && a.lng && distanciaMetros(c.lat, c.lng, a.lat, a.lng) <= 50) {
          posiblesDuplicados.add(c.id)
          break
        }
      }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Comercios pendientes</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {comercios.length} comercio{comercios.length !== 1 ? 's' : ''} esperando validación de tus campañas
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Comercio', 'Tipo', 'Localidad', 'Campaña', 'Gondolero', 'Fecha', 'Acciones'].map(h => (
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
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      {fachadasSignedMap[c.id] ? (
                        <a href={fachadasSignedMap[c.id]} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5">
                          <Image src={fachadasSignedMap[c.id]} alt={`Fachada de ${c.nombre}`} width={40} height={40} className="w-10 h-10 rounded-lg object-cover border border-gray-200 hover:border-gondo-amber-400 transition-colors" />
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
                            <span title="Posible duplicado cercano"><AlertTriangle size={13} className="text-amber-400 shrink-0" /></span>
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
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo as TipoComercio] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPO_LABEL[c.tipo as TipoComercio] ?? c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 min-w-[280px]">
                    {c.localidad_id ? (
                      <span className="text-xs text-gray-700">{c.localidad_nombre}</span>
                    ) : (
                      <SelectorLocalidad
                        comercioId={c.id}
                        sugerencia={{
                          estado:   c.localidad_sugerida_estado ?? null,
                          id:       c.localidad_sugerida_id ?? null,
                          texto:    c.localidad_sugerida_texto ?? null,
                          etiqueta: c.sugerida_etiqueta ?? null,
                        }}
                        onAsignar={asignarLocalidadDistri}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{c.campana_nombre ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{c.registrador_alias ?? c.registrador_nombre ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{tiempoRelativo(c.created_at)}</td>
                  <td className="px-4 py-3.5">
                    <AprobarRechazarBtnsDistri comercioId={c.id} nombreComercio={c.nombre} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
