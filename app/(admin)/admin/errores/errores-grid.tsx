'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cambiarEstadoError } from './acciones'

type ErrorRow = {
  id: string
  usuario_id: string | null
  tipo_actor: string | null
  url: string
  descripcion: string | null
  error_tecnico: string | null
  contexto: Record<string, unknown> | null
  estado: string
  created_at: string
  perfil: { nombre: string } | null
}

const ESTADO_COLORS: Record<string, string> = {
  nuevo:       'bg-red-100 text-red-700',
  revisado:    'bg-amber-100 text-amber-700',
  resuelto:    'bg-green-100 text-green-700',
  descartado:  'bg-gray-100 text-gray-500',
}

const ESTADOS: { value: string; label: string }[] = [
  { value: 'nuevo',      label: 'Nuevo'      },
  { value: 'revisado',   label: 'Revisado'   },
  { value: 'resuelto',   label: 'Resuelto'   },
  { value: 'descartado', label: 'Descartado' },
]

const ACTORES = ['gondolero', 'admin', 'distribuidora', 'marca']

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function FilaError({ error }: { error: ErrorRow }) {
  const [expandido, setExpandido] = useState(false)
  const [isPending, start] = useTransition()

  function cambiar(estado: string) {
    start(() => cambiarEstadoError(error.id, estado as 'nuevo' | 'revisado' | 'resuelto' | 'descartado'))
  }

  return (
    <div className={`border rounded-xl overflow-hidden ${error.estado === 'nuevo' ? 'border-red-200' : 'border-gray-200'}`}>
      {/* Fila principal */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpandido(v => !v)}
      >
        {expandido ? <ChevronDown size={15} className="text-gray-400 shrink-0" /> : <ChevronRight size={15} className="text-gray-400 shrink-0" />}
        <div className="flex-1 min-w-0 grid grid-cols-[auto_1fr_auto_auto] gap-x-4 items-center">
          <span className="text-xs text-gray-400 shrink-0">{formatFecha(error.created_at)}</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{error.perfil?.nombre ?? error.usuario_id?.slice(0, 8) ?? '—'}</p>
            <p className="text-xs text-gray-500 truncate">{error.descripcion ?? 'Sin descripción'}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${ESTADO_COLORS[error.estado] ?? 'bg-gray-100 text-gray-500'}`}>
            {error.estado}
          </span>
          <span className="text-[10px] font-medium text-gray-400 shrink-0 hidden sm:inline capitalize">
            {error.tipo_actor ?? '—'}
          </span>
        </div>
      </button>

      {/* Detalle expandido */}
      {expandido && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">URL</p>
            <p className="text-xs text-gray-700 break-all font-mono">{error.url}</p>
          </div>
          {error.descripcion && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Descripción del usuario</p>
              <p className="text-sm text-gray-800">{error.descripcion}</p>
            </div>
          )}
          {error.error_tecnico && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Error técnico</p>
              <p className="text-xs font-mono text-red-700 bg-red-50 rounded-lg px-3 py-2 break-all whitespace-pre-wrap">
                {error.error_tecnico}
              </p>
            </div>
          )}
          {error.contexto && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Contexto</p>
              <pre className="text-xs font-mono text-gray-600 bg-white rounded-lg px-3 py-2 overflow-auto max-h-32 border border-gray-200">
                {JSON.stringify(error.contexto, null, 2)}
              </pre>
            </div>
          )}

          {/* Cambiar estado */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Cambiar a:</span>
            {ESTADOS.filter(e => e.value !== error.estado).map(e => (
              <button
                key={e.value}
                disabled={isPending}
                onClick={() => cambiar(e.value)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50 ${ESTADO_COLORS[e.value]}`}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function ErroresGrid({
  errores,
  estadoFiltro,
  actorFiltro,
}: {
  errores: ErrorRow[]
  estadoFiltro?: string
  actorFiltro?: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  function filtrar(key: string, value: string | null) {
    const params = new URLSearchParams()
    if (key !== 'estado' && estadoFiltro) params.set('estado', estadoFiltro)
    if (key !== 'actor'  && actorFiltro)  params.set('actor',  actorFiltro)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1.5">
          <button
            onClick={() => filtrar('estado', null)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${!estadoFiltro ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Todos
          </button>
          {ESTADOS.map(e => (
            <button
              key={e.value}
              onClick={() => filtrar('estado', e.value)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${estadoFiltro === e.value ? 'bg-gray-800 text-white' : `${ESTADO_COLORS[e.value]} hover:opacity-80`}`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {ACTORES.map(a => (
            <button
              key={a}
              onClick={() => filtrar('actor', actorFiltro === a ? null : a)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors capitalize ${actorFiltro === a ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {errores.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-medium">Sin errores reportados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {errores.map(e => <FilaError key={e.id} error={e} />)}
        </div>
      )}
    </div>
  )
}
