'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Archive, Loader2, Square, CheckSquare } from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { tiempoRelativo } from '@/lib/utils'
import { accionMasiva, aprobarFotoAdmin, rechazarFotoAdmin } from './actions'

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-amber-100 text-amber-700 border-amber-200',
  aprobada:    'bg-green-100 text-green-700 border-green-200',
  rechazada:   'bg-red-100 text-red-700 border-red-200',
  en_revision: 'bg-blue-100 text-blue-700 border-blue-200',
  archivada:   'bg-gray-100 text-gray-500 border-gray-200',
}

interface FotoItem {
  id: string
  estado: string
  signedUrl: string | null
  gondoleroNombre: string | null
  comercioNombre: string | null
  campanaNombre: string | null
  createdAt: string
}

export function FotosGrid({ fotos }: { fotos: FotoItem[] }) {
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const seleccionables = fotos.filter(f => f.estado === 'pendiente').map(f => f.id)
  const todosSeleccionados = seleccionables.length > 0 &&
    seleccionables.every(id => seleccionados.has(id))

  function toggleSeleccion(id: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(seleccionables))
    }
  }

  function ejecutarAccion(accion: 'aprobada' | 'rechazada' | 'archivada') {
    const ids = Array.from(seleccionados)
    startTransition(async () => {
      await accionMasiva(ids, accion)
      setSeleccionados(new Set())
    })
  }

  const haySeleccion = seleccionados.size > 0

  return (
    <div>
      {/* Barra de selección masiva */}
      {seleccionables.length > 0 && (
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            onClick={toggleTodos}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            {todosSeleccionados
              ? <CheckSquare size={16} className="text-[#1E1B4B]" />
              : <Square size={16} />
            }
            {todosSeleccionados ? 'Deseleccionar todo' : `Seleccionar todas (${seleccionables.length})`}
          </button>

          {haySeleccion && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{seleccionados.size} seleccionada{seleccionados.size !== 1 ? 's' : ''}</span>
              <button
                disabled={isPending}
                onClick={() => ejecutarAccion('aprobada')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Aprobar
              </button>
              <button
                disabled={isPending}
                onClick={() => ejecutarAccion('rechazada')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors border border-red-200"
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                Rechazar
              </button>
              <button
                disabled={isPending}
                onClick={() => ejecutarAccion('archivada')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                Archivar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {fotos.map(f => {
          const esPendiente = f.estado === 'pendiente'
          const estaSeleccionado = seleccionados.has(f.id)

          return (
            <div
              key={f.id}
              className={`bg-white rounded-xl border overflow-hidden transition-all ${
                estaSeleccionado ? 'border-[#1E1B4B] ring-2 ring-[#1E1B4B]/20' : 'border-gray-200'
              }`}
            >
              <div className="relative">
                <FotoLightbox
                  src={f.signedUrl}
                  alt={`Foto ${f.id}`}
                  containerClassName="relative w-full h-44 shrink-0"
                >
                  <div className="absolute top-2 left-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ESTADO_COLOR[f.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                      {f.estado}
                    </span>
                  </div>
                </FotoLightbox>

                {/* Checkbox overlay para pendientes */}
                {esPendiente && (
                  <button
                    onClick={() => toggleSeleccion(f.id)}
                    className="absolute top-2 right-2 w-6 h-6 rounded flex items-center justify-center bg-white/90 hover:bg-white transition-colors shadow-sm"
                    title={estaSeleccionado ? 'Deseleccionar' : 'Seleccionar'}
                  >
                    {estaSeleccionado
                      ? <CheckSquare size={16} className="text-[#1E1B4B]" />
                      : <Square size={16} className="text-gray-400" />
                    }
                  </button>
                )}
              </div>

              <div className="p-3 space-y-1">
                <p className="text-xs font-medium text-gray-800 truncate">{f.gondoleroNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-500 truncate">{f.comercioNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-400 truncate">{f.campanaNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-400">{tiempoRelativo(f.createdAt)}</p>

                {esPendiente && !haySeleccion && (
                  <SingleActions fotoId={f.id} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SingleActions({ fotoId }: { fotoId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex gap-2 pt-1">
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await aprobarFotoAdmin(fotoId) })}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
        Aprobar
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(async () => { await rechazarFotoAdmin(fotoId) })}
        className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
        Rechazar
      </button>
    </div>
  )
}
