'use client'

import { useState, useTransition } from 'react'
import { MapPin, Users, Crosshair, Check, X, Undo2, Loader2 } from 'lucide-react'
import { formatearFechaHora, calcularDistanciaMetros } from '@/lib/utils'
import { RADIO_BLOQUEO_METROS } from '@/lib/gps-radios'
import { corregirUbicacionComercio, descartarReporteUbicacion } from './actions'

export interface ReporteRow {
  id: string
  lat: number
  lng: number
  created_at: string
  gondolero_id: string | null
  gondolero: { nombre: string | null; alias: string | null } | null
}

interface Props {
  comercioId: string
  /** Pin actual. null si el comercio nunca tuvo coordenadas. */
  lat: number | null
  lng: number | null
  reportes: ReporteRow[]
  /** Coordenadas previas a la última corrección, si hubo alguna. */
  anterior: { lat: number; lng: number } | null
}

function fmt(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

export function ReportesPanel({ comercioId, lat, lng, reportes, anterior }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Los handlers van ANTES del early return de "sin reportes": el caso de volver
  // a la ubicación anterior es justamente cuando ya no quedan reportes —se
  // resolvieron al corregir— así que si esa rama no puede llamar a corregir(),
  // la distribuidora se queda sin ninguna acción sobre la ubicación.
  const corregir = (nueva: { lat: number; lng: number }, reporteIds?: string[]) => {
    setError(null)
    startTransition(async () => {
      const res = await corregirUbicacionComercio({
        comercioId, lat: nueva.lat, lng: nueva.lng, reporteIds,
      })
      if (!res.ok) setError(res.error ?? 'No se pudo corregir.')
    })
  }

  const descartar = (reporteId: string) => {
    setError(null)
    startTransition(async () => {
      const res = await descartarReporteUbicacion(reporteId, comercioId)
      if (!res.ok) setError(res.error ?? 'No se pudo descartar.')
    })
  }

  const botonVolver = anterior ? (
    <button
      onClick={() => corregir(anterior)}
      disabled={isPending}
      className="w-full py-2 text-xs font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
      Volver a la ubicación anterior
    </button>
  ) : null

  if (reportes.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">Reportes de ubicación</h3>
        </div>
        <p className="text-xs text-gray-400">
          Ningún gondolero reportó que este comercio esté mal ubicado.
          {anterior && ' Si la última corrección fue un error, podés volver atrás.'}
        </p>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
        )}
        {botonVolver}
      </div>
    )
  }

  // El centroide es el promedio simple de las posiciones reportadas. A escala de
  // cuadras la curvatura de la Tierra no cambia nada, así que no vale la pena
  // proyectar: el error de un promedio plano es de centímetros.
  const centroide = {
    lat: reportes.reduce((s, r) => s + r.lat, 0) / reportes.length,
    lng: reportes.reduce((s, r) => s + r.lng, 0) / reportes.length,
  }

  // Dispersión = la distancia máxima entre dos reportes cualesquiera. Es lo que
  // separa una confirmación de un desacuerdo: tres puntos a 10 m entre sí dicen
  // lo mismo; tres a 400 m dicen tres cosas distintas y no hay que corregir nada
  // todavía.
  let dispersion = 0
  for (let i = 0; i < reportes.length; i++) {
    for (let j = i + 1; j < reportes.length; j++) {
      const d = calcularDistanciaMetros(reportes[i].lat, reportes[i].lng, reportes[j].lat, reportes[j].lng)
      if (d > dispersion) dispersion = d
    }
  }

  // Gondoleros DISTINTOS, no filas. El que reporta tres veces no son tres
  // confirmaciones — y de paso esto es lo que hace innecesaria una clave de
  // idempotencia en la cola offline: un duplicado por reintento no cuenta dos
  // veces.
  const gondolerosDistintos = new Set(reportes.map(r => r.gondolero_id).filter(Boolean)).size

  const dispersionAlta = dispersion > RADIO_BLOQUEO_METROS

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Reportes de ubicación
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
          <Users size={11} />
          {gondolerosDistintos} gondolero{gondolerosDistintos !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Resumen: la propuesta y qué tan de acuerdo están entre sí */}
      <div className={`rounded-lg border p-3 ${dispersionAlta ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start gap-2">
          <Crosshair size={14} className={`mt-0.5 shrink-0 ${dispersionAlta ? 'text-amber-500' : 'text-gray-400'}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800">
              {reportes.length} reporte{reportes.length !== 1 ? 's' : ''} ·{' '}
              {dispersion === 0
                ? 'un solo punto'
                : `coinciden dentro de ${fmt(dispersion)}`}
            </p>
            <p className="font-mono text-[11px] text-gray-500 mt-0.5">
              {centroide.lat.toFixed(6)}, {centroide.lng.toFixed(6)}
              {lat != null && lng != null && (
                <> · a {fmt(calcularDistanciaMetros(lat, lng, centroide.lat, centroide.lng))} del pin actual</>
              )}
            </p>
            {dispersionAlta && (
              <p className="text-xs text-amber-800 mt-1.5">
                Los reportes no coinciden entre sí. Puede haber dos locales, o alguno
                estar equivocado: conviene mirarlos uno por uno antes de corregir, o
                esperar más reportes.
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}

      {/* Acción principal: aceptar el centroide */}
      <button
        onClick={() => corregir(centroide, reportes.map(r => r.id))}
        disabled={isPending}
        className="w-full py-2.5 bg-gondo-verde-400 text-white font-semibold rounded-xl text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Usar la ubicación que reportaron
      </button>

      {/* Lista: cada reporte, con su distancia RECALCULADA contra el pin actual.
          No se muestra la distancia guardada: si alguien ya corrigió el pin, esa
          quedó vieja y diría que hay un problema que ya no existe. */}
      <ol className="space-y-2">
        {reportes.map(r => {
          const quien = r.gondolero?.alias ?? r.gondolero?.nombre ?? 'Gondolero'
          const dAlPin = lat != null && lng != null
            ? calcularDistanciaMetros(lat, lng, r.lat, r.lng)
            : null
          const yaCerca = dAlPin != null && dAlPin <= RADIO_BLOQUEO_METROS
          return (
            <li key={r.id} className="flex items-start gap-2 border-l-2 border-gray-200 pl-3 py-1">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900">
                  {quien}
                  <span className="text-xs text-gray-400"> · {formatearFechaHora(r.created_at)}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {dAlPin == null
                    ? 'sin pin de referencia'
                    : yaCerca
                      ? `a ${fmt(dAlPin)} del pin actual — ya estaría resuelto`
                      : `a ${fmt(dAlPin)} del pin actual`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => corregir({ lat: r.lat, lng: r.lng }, [r.id])}
                  disabled={isPending}
                  title="Usar esta posición"
                  className="px-2 py-1 text-[11px] font-semibold text-gondo-verde-600 border border-gondo-verde-200 rounded-lg hover:bg-gondo-verde-50 disabled:opacity-60"
                >
                  Usar esta
                </button>
                <button
                  onClick={() => descartar(r.id)}
                  disabled={isPending}
                  title="Descartar este reporte"
                  className="p-1.5 text-gray-400 hover:text-red-500 disabled:opacity-60"
                >
                  <X size={13} />
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Volver atrás. No es un "deshacer": escribe una corrección nueva con su
          propia fila, así que el historial muestra la ida y la vuelta. Un undo
          que borra la fila destruiría el rastro, que es todo el control que
          tenemos sobre quién mueve pines. */}
      {botonVolver}
    </div>
  )
}
