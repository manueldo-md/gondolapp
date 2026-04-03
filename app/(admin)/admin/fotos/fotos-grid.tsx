'use client'

import { useState, useTransition, useEffect, useRef, useCallback } from 'react'
import {
  CheckSquare, Square, Loader2, MoreHorizontal,
  CheckCircle2, XCircle, Archive, Clock, RotateCcw, Eye, X,
} from 'lucide-react'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { tiempoRelativo } from '@/lib/utils'
import { accionMasiva, cambiarEstadoFoto } from './actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FotoItem {
  id: string
  estado: string
  signedUrl: string | null
  gondoleroNombre: string | null
  comercioNombre: string | null
  campanaNombre: string | null
  createdAt: string
  precioConfirmado: number | null
  precioDetectado: number | null
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'warning'
}

// ── Estado config ──────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-amber-100 text-amber-700',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
  archivada:   'bg-gray-100 text-gray-400',
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente:   'pendiente',
  aprobada:    'aprobada',
  rechazada:   'rechazada',
  en_revision: 'en revisión',
  archivada:   'archivada',
}

type EstadoFoto = 'pendiente' | 'aprobada' | 'rechazada' | 'en_revision' | 'archivada'

interface MenuAccion {
  label: string
  nuevoEstado: EstadoFoto
  variant: 'default' | 'warning'
  advertencia?: string
  icono?: React.ReactNode
}

const MENU_ACCIONES: Record<string, MenuAccion[]> = {
  pendiente: [
    { label: 'Aprobar',           nuevoEstado: 'aprobada',    variant: 'default', icono: <CheckCircle2 size={13} /> },
    { label: 'Rechazar',          nuevoEstado: 'rechazada',   variant: 'warning', icono: <XCircle size={13} /> },
    { label: 'Mandar a revisión', nuevoEstado: 'en_revision', variant: 'default', icono: <Eye size={13} /> },
    { label: 'Archivar',          nuevoEstado: 'archivada',   variant: 'default', icono: <Archive size={13} /> },
  ],
  aprobada: [
    { label: 'Revertir a pendiente', nuevoEstado: 'pendiente',  variant: 'warning',
      advertencia: 'Los puntos ya acreditados NO se revierten automáticamente.',
      icono: <RotateCcw size={13} /> },
    { label: 'Mandar a revisión', nuevoEstado: 'en_revision', variant: 'default', icono: <Eye size={13} /> },
    { label: 'Rechazar',          nuevoEstado: 'rechazada',   variant: 'warning',
      advertencia: 'Los puntos ya acreditados NO se revierten automáticamente.',
      icono: <XCircle size={13} /> },
  ],
  rechazada: [
    { label: 'Aprobar',            nuevoEstado: 'aprobada',    variant: 'default', icono: <CheckCircle2 size={13} /> },
    { label: 'Volver a pendiente', nuevoEstado: 'pendiente',   variant: 'default', icono: <RotateCcw size={13} /> },
    { label: 'Mandar a revisión',  nuevoEstado: 'en_revision', variant: 'default', icono: <Eye size={13} /> },
    { label: 'Archivar',           nuevoEstado: 'archivada',   variant: 'default', icono: <Archive size={13} /> },
  ],
  en_revision: [
    { label: 'Aprobar',           nuevoEstado: 'aprobada',  variant: 'default', icono: <CheckCircle2 size={13} /> },
    { label: 'Rechazar',          nuevoEstado: 'rechazada', variant: 'warning',  icono: <XCircle size={13} /> },
    { label: 'Volver a pendiente', nuevoEstado: 'pendiente', variant: 'default', icono: <RotateCcw size={13} /> },
  ],
  archivada: [
    { label: 'Desarchivar → pendiente', nuevoEstado: 'pendiente', variant: 'default', icono: <RotateCcw size={13} /> },
  ],
}

// ── Toast helpers ─────────────────────────────────────────────────────────────

let toastCounter = 0
function nextToastId() { return ++toastCounter }

// ── FotosGrid ─────────────────────────────────────────────────────────────────

export function FotosGrid({ fotos }: { fotos: FotoItem[] }) {
  const [seleccionados, setSeleccionados]   = useState<Set<string>>(new Set())
  const [menuAbierto, setMenuAbierto]       = useState<string | null>(null)
  const [toasts, setToasts]                 = useState<Toast[]>([])
  const [isPendingMasiva, startMasiva]      = useTransition()

  const haySeleccion = seleccionados.size > 0

  // ── Selección ────────────────────────────────────────────────────────────────

  const toggleSeleccion = useCallback((id: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function seleccionarTodos() { setSeleccionados(new Set(fotos.map(f => f.id))) }
  function deseleccionarTodos() { setSeleccionados(new Set()) }

  // ── Toast ────────────────────────────────────────────────────────────────────

  const agregarToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = nextToastId()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  // ── Acción masiva ─────────────────────────────────────────────────────────────

  function ejecutarAccionMasiva(accion: 'aprobada' | 'rechazada' | 'archivada' | 'pendiente') {
    const ids = Array.from(seleccionados)
    startMasiva(async () => {
      const { procesadas, errores } = await accionMasiva(ids, accion)
      setSeleccionados(new Set())
      if (errores > 0) {
        agregarToast(`${procesadas} fotos procesadas · ${errores} con error`, 'warning')
      } else {
        agregarToast(`${procesadas} foto${procesadas !== 1 ? 's' : ''} procesada${procesadas !== 1 ? 's' : ''}`)
      }
    })
  }

  // ── Cambio individual ────────────────────────────────────────────────────────

  const ejecutarCambio = useCallback((fotoId: string, nuevoEstado: string) => {
    // Fire and forget — el card tiene su propio isPending
    cambiarEstadoFoto(fotoId, nuevoEstado)
      .then(() => agregarToast(`Estado actualizado: ${ESTADO_LABEL[nuevoEstado] ?? nuevoEstado}`))
      .catch(() => agregarToast('Error al actualizar el estado', 'warning'))
  }, [agregarToast])

  // ── Backdrop para cerrar menú ─────────────────────────────────────────────────

  return (
    <div>
      {/* Backdrop transparente para cerrar menú */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setMenuAbierto(null)}
        />
      )}

      {/* ── Sticky action bar ──────────────────────────────────────────────────── */}
      {haySeleccion && (
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm -mx-6 px-6 py-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-800 mr-1">
            {seleccionados.size} foto{seleccionados.size !== 1 ? 's' : ''} seleccionada{seleccionados.size !== 1 ? 's' : ''}
          </span>

          <button
            onClick={seleccionarTodos}
            className="text-xs text-[#1E1B4B] font-medium hover:underline"
          >
            Seleccionar todas las visibles ({fotos.length})
          </button>
          <button
            onClick={deseleccionarTodos}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            Deseleccionar todo
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              disabled={isPendingMasiva}
              onClick={() => ejecutarAccionMasiva('pendiente')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              {isPendingMasiva ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Volver a pendiente
            </button>
            <button
              disabled={isPendingMasiva}
              onClick={() => ejecutarAccionMasiva('aprobada')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isPendingMasiva ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Aprobar seleccionadas
            </button>
            <button
              disabled={isPendingMasiva}
              onClick={() => ejecutarAccionMasiva('rechazada')}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {isPendingMasiva ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Rechazar seleccionadas
            </button>
            <button
              disabled={isPendingMasiva}
              onClick={() => ejecutarAccionMasiva('archivada')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {isPendingMasiva ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
              Archivar seleccionadas
            </button>
          </div>
        </div>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {fotos.map(f => (
          <FotoCard
            key={f.id}
            foto={f}
            isSelected={seleccionados.has(f.id)}
            haySeleccion={haySeleccion}
            onToggle={() => toggleSeleccion(f.id)}
            menuAbierto={menuAbierto === f.id}
            onMenuToggle={() => setMenuAbierto(menuAbierto === f.id ? null : f.id)}
            onMenuClose={() => setMenuAbierto(null)}
            onCambiarEstado={(nuevoEstado) => ejecutarCambio(f.id, nuevoEstado)}
          />
        ))}
      </div>

      {/* ── Toasts ─────────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium pointer-events-auto ${
              t.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-gray-900 text-white'
            }`}
          >
            {t.type === 'warning' ? <XCircle size={14} className="text-amber-500 shrink-0" /> : <CheckCircle2 size={14} className="text-green-400 shrink-0" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── FotoCard ──────────────────────────────────────────────────────────────────

interface FotoCardProps {
  foto: FotoItem
  isSelected: boolean
  haySeleccion: boolean
  onToggle: () => void
  menuAbierto: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onCambiarEstado: (nuevoEstado: string) => void
}

function FotoCard({
  foto, isSelected, haySeleccion, onToggle,
  menuAbierto, onMenuToggle, onMenuClose, onCambiarEstado,
}: FotoCardProps) {
  const [isPending, startTransition] = useTransition()
  const [confirmando, setConfirmando] = useState<MenuAccion | null>(null)

  const acciones = MENU_ACCIONES[foto.estado] ?? []

  function handleAccion(accion: MenuAccion) {
    if (accion.advertencia) {
      setConfirmando(accion)
      return
    }
    ejecutar(accion.nuevoEstado)
  }

  function ejecutar(nuevoEstado: string) {
    setConfirmando(null)
    onMenuClose()
    startTransition(() => {
      onCambiarEstado(nuevoEstado)
    })
  }

  return (
    <div
      className={`group relative bg-white rounded-xl border overflow-hidden transition-all ${
        isSelected
          ? 'border-[#1E1B4B] ring-2 ring-[#1E1B4B]/20'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* ── Imagen ─────────────────────────────────────────────────────────────── */}
      <div className="relative">
        {/* Overlay de selección: activo cuando hay selección masiva */}
        {haySeleccion && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={onToggle}
          />
        )}

        <FotoLightbox
          src={foto.signedUrl}
          alt={`Foto ${foto.id}`}
          containerClassName="relative w-full h-44 shrink-0"
        />

        {/* Checkbox — top-left, visible en hover o cuando seleccionado */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          className={`absolute top-2 left-2 z-20 w-6 h-6 rounded flex items-center justify-center bg-white/90 hover:bg-white shadow-sm transition-all ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={isSelected ? 'Deseleccionar' : 'Seleccionar'}
        >
          {isSelected
            ? <CheckSquare size={15} className="text-[#1E1B4B]" />
            : <Square size={15} className="text-gray-400" />
          }
        </button>

        {/* Loading overlay */}
        {isPending && (
          <div className="absolute inset-0 z-20 bg-white/70 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-gray-500" />
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <div className="p-3 space-y-1">
        {/* Fila: estado badge + menú ⋯ */}
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[foto.estado] ?? 'bg-gray-100 text-gray-500'}`}>
            {ESTADO_LABEL[foto.estado] ?? foto.estado}
          </span>

          {/* Menú ⋯ */}
          <div className="relative z-30">
            <button
              onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Cambiar estado"
            >
              <MoreHorizontal size={15} />
            </button>

            {menuAbierto && (
              <div
                className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Confirmación de advertencia */}
                {confirmando ? (
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-700">⚠️ {confirmando.advertencia}</p>
                    <p className="text-[11px] text-gray-500">¿Confirmar &ldquo;{confirmando.label}&rdquo;?</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setConfirmando(null)}
                        className="flex-1 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => ejecutar(confirmando.nuevoEstado)}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-amber-500 rounded-lg hover:bg-amber-600"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-1">
                    {acciones.map(accion => (
                      <button
                        key={accion.nuevoEstado}
                        onClick={() => handleAccion(accion)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors ${
                          accion.variant === 'warning' ? 'text-amber-700' : 'text-gray-700'
                        }`}
                      >
                        <span className="shrink-0 opacity-60">{accion.icono}</span>
                        {accion.label}
                        {accion.advertencia && (
                          <span className="ml-auto text-[10px] text-amber-500 font-bold">!</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <p className="text-xs font-medium text-gray-800 truncate">{foto.gondoleroNombre ?? '—'}</p>
        <p className="text-[11px] text-gray-500 truncate">{foto.comercioNombre ?? '—'}</p>
        <p className="text-[11px] text-gray-400 truncate">{foto.campanaNombre ?? '—'}</p>
        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Clock size={10} />
          <span>{tiempoRelativo(foto.createdAt)}</span>
        </div>
        {(foto.precioConfirmado != null || foto.precioDetectado != null) && (
          <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
            {foto.precioConfirmado != null && (
              <span className="font-medium text-gray-700">💲 ${foto.precioConfirmado}</span>
            )}
            {foto.precioDetectado != null && (
              <span className="text-gray-400">(IA: ${foto.precioDetectado})</span>
            )}
            {foto.precioDetectado === null && foto.precioConfirmado != null && (
              <span className="text-gray-400 text-[10px]">IA pendiente</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
