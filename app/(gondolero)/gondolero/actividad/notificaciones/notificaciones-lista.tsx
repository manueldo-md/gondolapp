'use client'

/**
 * NotificacionesLista
 *
 * Renderiza la lista de notificaciones con mark-as-read individual.
 * Al tocar una notificación no leída, se marca como leída de inmediato en la
 * UI (optimistic update) y se llama al server action en background.
 * El server action revalida la ruta para que el badge del nav se actualice.
 */

import { useState } from 'react'
import { tiempoRelativo } from '@/lib/utils'
import { marcarUnaNotificacionLeida } from '../../perfil/actions'

type Notificacion = {
  id: string
  titulo: string
  mensaje: string | null
  leida: boolean
  created_at: string
}

export function NotificacionesLista({ notificaciones }: { notificaciones: Notificacion[] }) {
  // Set de IDs marcados como leídos en esta sesión (optimistic)
  const [leidasLocal, setLeidasLocal] = useState<Set<string>>(
    new Set(notificaciones.filter(n => n.leida).map(n => n.id))
  )

  async function handleTocar(id: string) {
    if (leidasLocal.has(id)) return // ya estaba leída
    // Optimistic: marcar de inmediato en UI
    setLeidasLocal(prev => new Set(prev).add(id))
    // Best-effort: si falla, el estado visual ya cambió y no se revierte
    // (la próxima carga del server mostrará el estado real)
    await marcarUnaNotificacionLeida(id).catch(() => {})
  }

  return (
    <div className="rounded-2xl overflow-hidden divide-y divide-gray-100">
      {notificaciones.map(n => {
        const esLeida = leidasLocal.has(n.id)
        return (
          <button
            key={n.id}
            onClick={() => handleTocar(n.id)}
            className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${
              !esLeida
                ? 'bg-red-50 border-l-2 border-red-400 active:bg-red-100'
                : 'bg-white active:bg-gray-50'
            }`}
          >
            {/* Indicador leída/no leída */}
            <div className="shrink-0 mt-1.5">
              {!esLeida ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              ) : (
                <span className="inline-flex rounded-full h-2 w-2 bg-gray-300" />
              )}
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-tight ${!esLeida ? 'text-red-800' : 'text-gray-700'}`}>
                {n.titulo}
              </p>
              {n.mensaje && (
                <p className={`text-xs mt-0.5 ${!esLeida ? 'text-red-700' : 'text-gray-400'}`}>
                  {n.mensaje}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
