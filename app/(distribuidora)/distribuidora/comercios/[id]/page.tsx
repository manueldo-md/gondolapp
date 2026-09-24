import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Camera, History, CheckCircle2, AlertCircle } from 'lucide-react'
import { tiempoRelativo, calcularDistanciaMetros } from '@/lib/utils'
import { formatearInstanteHora } from '@/lib/fecha-ar'
import type { TipoComercio } from '@/types'
import { ReportesPanel, type ReporteRow } from './reportes-panel'
import { firmarFachada } from '@/lib/storage-fotos'

/**
 * Detalle de un comercio.
 *
 * POR QUÉ ES UNA RUTA Y NO UN PANEL LATERAL SOBRE LA LISTA: tiene que ser
 * linkeable. La notificación que le avisa a la distribuidora que entró un
 * reporte de ubicación (Parte B) apunta acá. Sin URL propia el reporte espera a
 * que alguien entre por casualidad a la lista de comercios, y eso no pasa.
 *
 * El historial de correcciones se muestra completo y a la vista, no escondido en
 * un log de admin. Es la contraparte de la decisión de producto: cualquier
 * distribuidora puede corregir cualquier comercio, y **el control es el rastro
 * visible, no el permiso**. Un rastro que solo existe en la base no controla
 * nada.
 */

const TIPO_LABEL: Record<TipoComercio, string> = {
  autoservicio: 'Autoservicio',
  almacen:      'Almacén',
  kiosco:       'Kiosco',
  mayorista:    'Mayorista',
  dietetica:    'Dietética',
  otro:         'Otro',
}

const TIPO_COLOR: Record<TipoComercio, string> = {
  autoservicio: 'bg-blue-100 text-blue-700',
  almacen:      'bg-purple-100 text-purple-700',
  kiosco:       'bg-pink-100 text-pink-700',
  mayorista:    'bg-gondo-indigo-50 text-gondo-indigo-600',
  dietetica:    'bg-green-100 text-green-700',
  otro:         'bg-gray-100 text-gray-600',
}

interface HistorialRow {
  id: string
  lat_anterior: number | null
  lng_anterior: number | null
  lat_nueva: number
  lng_nueva: number
  created_at: string
  corregido_por: { nombre: string | null; alias: string | null } | null
  distri: { razon_social: string | null } | null
}

function coord(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return 'sin coordenadas'
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}

export default async function ComercioDetallePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const [comercioRes, historialRes, fotosRes, reportesRes] = await Promise.all([
    db.from('comercios')
      .select('id, nombre, direccion, tipo, validado, estado, lat, lng, created_at, foto_fachada_url, registrado_por')
      .eq('id', params.id)
      .maybeSingle(),
    db.from('comercios_ubicacion_historial')
      .select('id, lat_anterior, lng_anterior, lat_nueva, lng_nueva, created_at, corregido_por:profiles(nombre, alias), distri:distribuidoras(razon_social)')
      .eq('comercio_id', params.id)
      .order('created_at', { ascending: false }),
    db.from('fotos')
      .select('created_at')
      .eq('comercio_id', params.id)
      .order('created_at', { ascending: false })
      .limit(1),
    db.from('comercios_reportes_ubicacion')
      .select('id, lat, lng, created_at, gondolero_id, gondolero:profiles(nombre, alias)')
      .eq('comercio_id', params.id)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false }),
  ])

  const comercio = comercioRes.data
  if (!comercio) notFound()

  const historial = (historialRes.data ?? []) as HistorialRow[]
  const reportes  = (reportesRes.data ?? []) as ReporteRow[]
  const ultimaVisita: string | null = fotosRes.data?.[0]?.created_at ?? null

  // Coordenadas previas a la última corrección, para el "volver atrás".
  // historial viene ordenado descendente, así que [0] es la más reciente.
  const anterior = historial[0]?.lat_anterior != null && historial[0]?.lng_anterior != null
    ? { lat: historial[0].lat_anterior, lng: historial[0].lng_anterior }
    : null

  // La columna tiene dos formatos —storage path y URL completa— y firmar el
  // valor crudo falla en las filas con URL. Ver lib/storage-fotos.ts.
  const fachadaUrl = await firmarFachada(comercio.foto_fachada_url, admin)

  const tipo = (comercio.tipo ?? 'otro') as TipoComercio
  const sinCoordenadas = comercio.lat == null || comercio.lng == null

  return (
    <div className="max-w-4xl">
      <Link
        href="/distribuidora/comercios"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={15} />
        Comercios
      </Link>

      {/* Identidad */}
      <div className="flex items-start gap-4 mb-6">
        {fachadaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fachadaUrl}
            alt={`Fachada de ${comercio.nombre}`}
            className="w-20 h-20 rounded-xl object-cover border border-gray-200 shrink-0"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
            <Camera size={22} className="text-gray-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900">{comercio.nombre}</h2>
          {comercio.direccion && (
            <p className="text-sm text-gray-500 mt-0.5">{comercio.direccion}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[tipo]}`}>
              {TIPO_LABEL[tipo]}
            </span>
            {comercio.validado ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                <CheckCircle2 size={11} /> Validado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                <AlertCircle size={11} /> Sin validar
              </span>
            )}
            <span className="text-xs text-gray-400">
              {ultimaVisita ? `Última visita ${tiempoRelativo(ultimaVisita)}` : 'Sin visitas'}
            </span>
          </div>

          {/* ── EL LINK A LA EVIDENCIA ──────────────────────────────────────
              Esta pantalla es EL PADRÓN: dónde está el comercio, si está
              validado, quién corrigió su ubicación. La otra —`comercio` en
              singular— es la EVIDENCIA: cómo viene su góndola en el tiempo.
              Son dos preguntas distintas sobre el mismo sustantivo, y desde acá
              es donde alguien va a querer saltar a la otra.

              Va SIN `?alcance`: esta pantalla no lo tiene, porque el padrón no
              está acotado a una marca. La de evidencia abre pidiendo que elijan,
              que es un paso de más pero es la verdad — no hay forma de adivinar
              desde cuál alcance se está mirando este comercio. */}
          <Link
            href={`/distribuidora/comercio/${comercio.id}`}
            className="inline-flex items-center gap-1.5 mt-3 text-sm text-gondo-amber-400 hover:text-gondo-amber-600 font-medium"
          >
            <History size={14} />
            Ver cómo viene la góndola
          </Link>
        </div>
      </div>

      {/* Ubicación actual */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <MapPin size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Ubicación registrada</h3>
        </div>
        {sinCoordenadas ? (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              Este comercio no tiene coordenadas. No aparece en la lista de cercanos
              del gondolero y no se puede llegar a él por GPS: solo por búsqueda
              por nombre.
            </p>
          </div>
        ) : (
          <p className="font-mono text-sm text-gray-700">
            {coord(comercio.lat, comercio.lng)}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Registrado {formatearInstanteHora(comercio.created_at)}
        </p>
      </div>

      {/* Reportes pendientes — arriba del historial: es lo accionable */}
      <div className="mb-4">
        <ReportesPanel
          comercioId={comercio.id}
          lat={comercio.lat}
          lng={comercio.lng}
          reportes={reportes}
          anterior={anterior}
        />
      </div>

      {/* Historial de correcciones */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">
            Historial de ubicación
          </h3>
        </div>

        {historial.length === 0 ? (
          <p className="text-xs text-gray-400">
            La ubicación de este comercio nunca se corrigió. Sigue siendo la que se
            registró al darlo de alta.
          </p>
        ) : (
          <ol className="space-y-3">
            {historial.map(h => {
              const movio = h.lat_anterior != null && h.lng_anterior != null
                ? Math.round(calcularDistanciaMetros(
                    h.lat_anterior, h.lng_anterior, h.lat_nueva, h.lng_nueva
                  ))
                : null
              const quien = h.corregido_por?.alias ?? h.corregido_por?.nombre ?? 'Alguien'
              return (
                <li key={h.id} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{quien}</span>
                    {/* La distribuidora solo se muestra si aporta algo. El
                        usuario de una distri suele tener la razón social como
                        nombre, así que sin esta guarda queda "Biomega S.A. ·
                        Biomega S.A.". */}
                    {h.distri?.razon_social && h.distri.razon_social !== quien && (
                      <span className="text-xs text-gray-400">· {h.distri.razon_social}</span>
                    )}
                    <span className="text-xs text-gray-400">
                      · {formatearInstanteHora(h.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    {movio != null
                      ? <>Movió el pin <strong>{movio >= 1000 ? `${(movio / 1000).toFixed(1)} km` : `${movio} m`}</strong></>
                      : 'Cargó la ubicación por primera vez'}
                  </p>
                  <p className="font-mono text-[11px] text-gray-400 mt-0.5">
                    {coord(h.lat_anterior, h.lng_anterior)} → {coord(h.lat_nueva, h.lng_nueva)}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
