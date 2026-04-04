import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { MapPin, Camera, Store, AlertTriangle } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoComercio } from '@/types'
import { AprobarRechazarBtnsDistri } from './aprobar-rechazar-btns'

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

  // Obtener IDs de campañas de esta distribuidora
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campanas } = await (admin as any)
    .from('campanas')
    .select('id')
    .eq('distri_id', distriId)

  const campanaIds = ((campanas ?? []) as { id: string }[]).map(c => c.id)

  // Comercios pendientes de campañas de esta distri
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comerciosRaw } = campanaIds.length > 0
    ? await (admin as any)
        .from('comercios')
        .select(`
          id, nombre, direccion, tipo, estado, created_at,
          registrado_por, foto_fachada_url, campana_id,
          registrador:profiles!registrado_por(nombre, alias),
          campana:campanas!campana_id(nombre)
        `)
        .eq('estado', 'pendiente_validacion')
        .in('campana_id', campanaIds)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comercios = ((comerciosRaw ?? []) as any[]).map(c => ({
    ...c,
    registrador_nombre: Array.isArray(c.registrador) ? c.registrador[0]?.nombre : c.registrador?.nombre,
    registrador_alias:  Array.isArray(c.registrador) ? c.registrador[0]?.alias  : c.registrador?.alias,
    campana_nombre:     Array.isArray(c.campana)     ? c.campana[0]?.nombre     : c.campana?.nombre,
  }))

  // Signed URLs para fotos de fachada
  const fachadasSignedMap: Record<string, string> = {}
  const conFachada = comercios.filter((c: { foto_fachada_url: string | null }) => c.foto_fachada_url)
  if (conFachada.length > 0) {
    await Promise.all(
      conFachada.map(async (c: { id: string; foto_fachada_url: string }) => {
        const { data } = await admin.storage
          .from('fotos-gondola')
          .createSignedUrl(c.foto_fachada_url, 3600)
        if (data?.signedUrl) fachadasSignedMap[c.id] = data.signedUrl
      })
    )
  }

  // Detectar posibles duplicados — lat/lng se obtienen en query separada, solo server-side
  const comercioIds = comercios.map((c: { id: string }) => c.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [{ data: pendientesGeo }, { data: activos }] = await Promise.all([
    campanaIds.length > 0 && comercioIds.length > 0
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
                {['Comercio', 'Tipo', 'Campaña', 'Gondolero', 'Fecha', 'Acciones'].map(h => (
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fachadasSignedMap[c.id]} alt={`Fachada de ${c.nombre}`} className="w-10 h-10 rounded-lg object-cover border border-gray-200 hover:border-gondo-amber-400 transition-colors" />
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
                  <td className="px-4 py-3.5 text-xs text-gray-500">{c.campana_nombre ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">{c.registrador_alias ?? c.registrador_nombre ?? '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">{tiempoRelativo(c.created_at)}</td>
                  <td className="px-4 py-3.5">
                    <AprobarRechazarBtnsDistri comercioId={c.id} />
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
