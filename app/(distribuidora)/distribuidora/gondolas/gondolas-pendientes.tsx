'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Loader2, Square, CheckSquare, MapPin, User, Clock } from 'lucide-react'
import Link from 'next/link'
import { formatearFechaHora, labelTipoCampana } from '@/lib/utils'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { aprobarFoto, rechazarFoto, accionMasivaDistri } from './actions'
import type { DeclaracionFoto, TipoCampana } from '@/types'

const DECL_LABEL: Record<DeclaracionFoto, string> = {
  producto_presente:      'Producto presente',
  producto_no_encontrado: 'Producto no encontrado',
  solo_competencia:       'Solo competencia',
}

const DECL_COLOR: Record<DeclaracionFoto, string> = {
  producto_presente:      'bg-green-100 text-green-700',
  producto_no_encontrado: 'bg-red-100 text-red-700',
  solo_competencia:       'bg-amber-100 text-amber-700',
}

interface FotoPendiente {
  id: string
  signedUrl: string | null
  url: string | null
  declaracion: DeclaracionFoto
  precio_detectado: number | null
  created_at: string
  campana_id: string
  gondolero: { nombre: string | null; alias: string | null } | null
  comercio:  { nombre: string; direccion: string | null } | null
  campana:   { nombre: string; tipo: TipoCampana } | null
}

export function GondolasPendientes({ fotos }: { fotos: FotoPendiente[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const todosIds = fotos.map(f => f.id)
  const todosSeleccionados = todosIds.length > 0 && todosIds.every(id => seleccionados.has(id))

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (todosSeleccionados) setSeleccionados(new Set())
    else setSeleccionados(new Set(todosIds))
  }

  function ejecutarAccion(accion: 'aprobada' | 'rechazada') {
    const ids = Array.from(seleccionados)
    startTransition(async () => {
      await accionMasivaDistri(ids, accion)
      setSeleccionados(new Set())
    })
  }

  const haySeleccion = seleccionados.size > 0

  if (fotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 size={28} className="text-gray-300" />
        </div>
        <h3 className="text-base font-semibold text-gray-700 mb-1">Todo al día</h3>
        <p className="text-sm text-gray-400">No hay fotos pendientes de revisión.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Barra de selección masiva */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          onClick={toggleTodos}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          {todosSeleccionados
            ? <CheckSquare size={16} className="text-gondo-amber-400" />
            : <Square size={16} />
          }
          {todosSeleccionados ? 'Deseleccionar todo' : `Seleccionar todas (${fotos.length})`}
        </button>

        {haySeleccion && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{seleccionados.size} seleccionada{seleccionados.size !== 1 ? 's' : ''}</span>
            <button
              disabled={isPending}
              onClick={() => ejecutarAccion('aprobada')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Aprobar
            </button>
            <button
              disabled={isPending}
              onClick={() => ejecutarAccion('rechazada')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              Rechazar
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {fotos.map(foto => {
          const gondoleroNombre = foto.gondolero?.alias ?? foto.gondolero?.nombre ?? 'Gondolero'
          const decl = foto.declaracion
          const imgSrc = foto.signedUrl ?? foto.url
          const estaSeleccionado = seleccionados.has(foto.id)

          return (
            <div
              key={foto.id}
              className={`bg-white rounded-xl border overflow-hidden shadow-sm flex flex-col transition-all ${
                estaSeleccionado ? 'border-gondo-amber-400 ring-2 ring-gondo-amber-400/20' : 'border-gray-200'
              }`}
            >
              {/* Imagen con checkbox */}
              <div className="relative">
                <FotoLightbox
                  src={imgSrc}
                  alt={`Foto de ${foto.comercio?.nombre ?? 'comercio'}`}
                  containerClassName="relative w-full h-52 shrink-0"
                />
                <button
                  onClick={() => toggleSeleccion(foto.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded flex items-center justify-center bg-white/90 hover:bg-white transition-colors shadow-sm"
                >
                  {estaSeleccionado
                    ? <CheckSquare size={18} className="text-gondo-amber-400" />
                    : <Square size={18} className="text-gray-400" />
                  }
                </button>
              </div>

              {/* Datos */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                {foto.campana && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                        {foto.campana.nombre}
                      </span>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {labelTipoCampana(foto.campana.tipo)}
                      </span>
                    </div>
                    <Link
                      href={`/distribuidora/campanas/${foto.campana_id}`}
                      className="shrink-0 text-[11px] font-semibold text-gondo-amber-400 hover:underline"
                    >
                      Ver campana →
                    </Link>
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">
                      {foto.comercio?.nombre ?? 'Comercio desconocido'}
                    </p>
                    {foto.comercio?.direccion && (
                      <p className="text-xs text-gray-400 truncate">{foto.comercio.direccion}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User size={13} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600 truncate">{gondoleroNombre}</span>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${DECL_COLOR[decl]}`}>
                    {DECL_LABEL[decl]}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
                  {foto.precio_detectado != null
                    ? <span className="font-medium text-gray-600">${foto.precio_detectado}</span>
                    : <span />
                  }
                  <div className="flex items-center gap-1">
                    <Clock size={11} />
                    <span>{formatearFechaHora(foto.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Acciones individuales — solo cuando no hay selección masiva */}
              {!haySeleccion && (
                <div className="px-4 pb-4 shrink-0">
                  <SingleFotoAcciones fotoId={foto.id} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SingleFotoAcciones({ fotoId }: { fotoId: string }) {
  const [pendingAprobar, startAprobar] = useTransition()
  const [pendingRechazar, startRechazar] = useTransition()
  const ocupado = pendingAprobar || pendingRechazar

  return (
    <div className="flex gap-2">
      <button
        onClick={() => startAprobar(async () => { await aprobarFoto(fotoId) })}
        disabled={ocupado}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {pendingAprobar ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
        Aprobar
      </button>
      <button
        onClick={() => startRechazar(() => rechazarFoto(fotoId))}
        disabled={ocupado}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-red-300 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        {pendingRechazar ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
        Rechazar
      </button>
    </div>
  )
}
