'use client'

import { useEffect } from 'react'
import { X, AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmModal({
  open,
  title = '¿Estás seguro?',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={17} className="text-red-600" />
            </div>
            <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Descripción */}
        <p className="text-sm text-gray-600 mb-6 leading-relaxed pl-12">
          {description}
        </p>

        {/* Botones */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading
              ? <Loader2 size={14} className="animate-spin" />
              : confirmLabel
            }
          </button>
        </div>
      </div>
    </div>
  )
}
