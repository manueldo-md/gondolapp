'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Pencil, Trash2 } from 'lucide-react'
import { crearZona, editarZona, eliminarZona } from './actions'

type TipoZona = 'ciudad' | 'provincia' | 'region'

interface ZonaRow {
  id: string
  nombre: string
  tipo: TipoZona
  lat: number | null
  lng: number | null
}

const INPUT = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]'
const BTN_PRIMARY = 'flex-1 py-2.5 bg-[#1E1B4B] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity'
const BTN_SECONDARY = 'flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors'

function ModalBase({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Modal crear / editar ──────────────────────────────────────────────────────

export function ZonaFormModal({
  zona,
  onClose,
}: {
  zona?: ZonaRow
  onClose: () => void
}) {
  const [nombre, setNombre] = useState(zona?.nombre ?? '')
  const [tipo, setTipo] = useState<TipoZona>(zona?.tipo ?? 'ciudad')
  const [lat, setLat] = useState(zona?.lat?.toString() ?? '')
  const [lng, setLng] = useState(zona?.lng?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleGuardar = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setError(null)
    const datos = {
      nombre,
      tipo,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
    }
    startTransition(async () => {
      const res = zona ? await editarZona(zona.id, datos) : await crearZona(datos)
      if (res.error) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <ModalBase title={zona ? 'Editar zona' : 'Nueva zona'} onClose={onClose}>
      <div className="space-y-3.5">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="ej. Concordia, Entre Ríos, Litoral"
            className={INPUT}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleGuardar()}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Tipo</label>
          <select
            value={tipo}
            onChange={e => setTipo(e.target.value as TipoZona)}
            className={`${INPUT} bg-white`}
          >
            <option value="ciudad">Ciudad</option>
            <option value="provincia">Provincia</option>
            <option value="region">Región</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Latitud <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={e => setLat(e.target.value)}
              placeholder="-31.3927"
              className={INPUT}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Longitud <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={e => setLng(e.target.value)}
              placeholder="-58.0158"
              className={INPUT}
              inputMode="decimal"
            />
          </div>
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
      <div className="flex gap-3 mt-5">
        <button onClick={onClose} disabled={isPending} className={BTN_SECONDARY}>Cancelar</button>
        <button onClick={handleGuardar} disabled={isPending || !nombre.trim()} className={BTN_PRIMARY}>
          {isPending ? <Loader2 size={14} className="animate-spin" /> : (zona ? 'Guardar' : 'Crear zona')}
        </button>
      </div>
    </ModalBase>
  )
}

// ── Fila de zona con acciones inline ─────────────────────────────────────────

export function ZonaFila({ zona }: { zona: ZonaRow }) {
  const [modal, setModal] = useState<'editar' | 'eliminar' | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const TIPO_LABEL: Record<TipoZona, string> = {
    ciudad: 'Ciudad',
    provincia: 'Provincia',
    region: 'Región',
  }
  const TIPO_COLOR: Record<TipoZona, string> = {
    ciudad: 'bg-blue-50 text-blue-600',
    provincia: 'bg-amber-50 text-amber-600',
    region: 'bg-purple-50 text-purple-600',
  }

  const handleEliminar = () => {
    startTransition(async () => {
      const res = await eliminarZona(zona.id)
      if (res.error) { setDeleteError(res.error); return }
      setModal(null)
    })
  }

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3 font-medium text-gray-900 text-sm">{zona.nombre}</td>
        <td className="px-4 py-3">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[zona.tipo]}`}>
            {TIPO_LABEL[zona.tipo]}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {zona.lat && zona.lng ? `${zona.lat}, ${zona.lng}` : '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setModal('editar')}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Editar"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setModal('eliminar')}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {modal === 'editar' && (
        <ZonaFormModal zona={zona} onClose={() => setModal(null)} />
      )}

      {modal === 'eliminar' && (
        <ModalBase title="Eliminar zona" onClose={() => { setModal(null); setDeleteError(null) }}>
          <p className="text-sm text-gray-600 mb-4">
            ¿Estás seguro de eliminar <span className="font-semibold">{zona.nombre}</span>?
            Los gondoleros y campañas vinculados a esta zona perderán la referencia.
          </p>
          {deleteError && <p className="text-red-600 text-xs mb-3">{deleteError}</p>}
          <div className="flex gap-3">
            <button onClick={() => setModal(null)} disabled={isPending} className={BTN_SECONDARY}>Cancelar</button>
            <button
              onClick={handleEliminar}
              disabled={isPending}
              className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Eliminar'}
            </button>
          </div>
        </ModalBase>
      )}
    </>
  )
}

// ── Botón nueva zona ──────────────────────────────────────────────────────────

export function NuevaZonaBtn() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-[#1E1B4B] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        + Nueva zona
      </button>
      {open && <ZonaFormModal onClose={() => setOpen(false)} />}
    </>
  )
}
