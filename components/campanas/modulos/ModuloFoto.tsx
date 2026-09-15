import React from 'react'
import { Camera, MapPin, User, Clock } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { FotoDistancia } from '@/components/shared/foto-distancia'
import { formatearFechaHora } from '@/lib/utils'
import type { EstadoFoto } from '@/types'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader } from './piezas'

type ModuloFot = Extract<Modulo, { tipo: 'foto' }>

const ESTADO_COLOR: Record<EstadoFoto, string> = {
  pendiente:   'bg-gray-100 text-gray-600',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
}
const ESTADO_LABEL: Record<EstadoFoto, string> = {
  pendiente:   'Pendiente',
  aprobada:    'Aprobada',
  rechazada:   'Rechazada',
  en_revision: 'En revisión',
}

function fmtValor(valor: unknown, tipo: string): string {
  if (valor === null || valor === undefined) return '—'
  if (tipo === 'binaria') return valor === true || valor === 'true' ? 'Sí' : 'No'
  if (Array.isArray(valor)) return valor.join(', ')
  return String(valor)
}

/**
 * Galería del módulo: solo las fotos de ESTE campo.
 *
 * Reemplaza la grilla global que había antes. Las acciones de moderación
 * bajaron acá: aprobar o rechazar se hace sobre la foto, en el módulo que la
 * pidió, y el filtro por estado de arriba filtra todas las galerías a la vez.
 */
export function ModuloFoto({
  modulo,
  tema,
  fotoRespuestasMap,
  camposMap,
  renderFotoAcciones,
}: {
  modulo: ModuloFot
  tema: Tema
  fotoRespuestasMap: Map<string, { campo_id: string; valor: unknown }[]>
  camposMap: Map<string, { pregunta: string; tipo: string }>
  renderFotoAcciones?: (fotoId: string, estado: string) => React.ReactNode
}) {
  return (
    <div>
      <ModuloHeader
        pregunta={modulo.campo.pregunta}
        base={modulo.base}
        nota={modulo.base > 0 ? `${modulo.base} foto${modulo.base !== 1 ? 's' : ''}` : undefined}
      />

      {modulo.fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center bg-gray-50 rounded-xl">
          <Camera size={24} className="text-gray-300 mb-2" />
          <p className="text-xs text-gray-400">No hay fotos para este módulo con el filtro actual.</p>
        </div>
      ) : (
        // Thumbs a la mitad (h-52 → h-[104px]) y más columnas: una galería con
        // el thumb grande empujaba fuera de pantalla todo lo que venía después.
        // El click para ampliar sigue igual — FotoLightbox no cambia.
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {modulo.fotos.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">
              <FotoLightbox
                src={f.signedUrl}
                alt={`Foto de ${f.comercio?.nombre ?? 'comercio'}`}
                containerClassName="relative w-full h-[104px] shrink-0"
                modalFooter={
                  fotoRespuestasMap.has(f.id) && camposMap.size > 0
                    ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-white/80 uppercase tracking-wide mb-2">
                          Respuestas del formulario
                        </p>
                        {fotoRespuestasMap.get(f.id)!.map(r => {
                          const campo = camposMap.get(r.campo_id)
                          if (!campo) return null
                          return (
                            <div key={r.campo_id} className="flex justify-between gap-2">
                              <span className="text-xs text-white/70 shrink-0">{campo.pregunta}</span>
                              <span className="text-xs font-medium text-white text-right">
                                {fmtValor(r.valor, campo.tipo)}
                              </span>
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

              <div className="p-2.5 flex-1 flex flex-col gap-1">
                <div className="flex items-start gap-1.5">
                  <MapPin size={11} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-xs truncate">
                      {f.comercio?.nombre ?? 'Comercio'}
                    </p>
                    {f.comercio?.direccion && (
                      <p className="text-[10px] text-gray-400 truncate">{f.comercio.direccion}</p>
                    )}
                  </div>
                </div>
                {tema.verAgente && (
                  <div className="flex items-center gap-1 min-w-0">
                    <User size={11} className="text-gray-400 shrink-0" />
                    <span className="text-[10px] text-gray-600 truncate">
                      {f.gondolero?.alias ?? f.gondolero?.nombre ?? '—'}
                    </span>
                  </div>
                )}
                <FotoDistancia metros={f.distancia_metros} />
                <div className="flex items-center justify-end text-[10px] text-gray-400 mt-auto">
                  <div className="flex items-center gap-1">
                    <Clock size={10} />
                    <span>{formatearFechaHora(f.created_at)}</span>
                  </div>
                </div>
              </div>

              {renderFotoAcciones?.(f.id, f.estado)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
