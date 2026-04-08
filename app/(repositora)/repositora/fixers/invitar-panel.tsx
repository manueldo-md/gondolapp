'use client'

import { useState, useTransition } from 'react'
import { Hash, Search, UserCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { buscarFixerPorCodigo, vincularFixerPorCodigo, aprobarSolicitudFixer, rechazarSolicitudFixer } from './invitar-actions'

interface Solicitud {
  id: string
  fixer_id: string
  fixer: { nombre: string | null; alias: string | null; celular: string | null } | null
  created_at: string
}

export function InvitarFixerPanel({
  repoId,
  repoNombre,
  solicitudesIniciales,
}: {
  repoId: string
  repoNombre: string
  solicitudesIniciales: Solicitud[]
}) {
  const [codigo, setCodigo] = useState('')
  const [fixerEncontrado, setFixerEncontrado] = useState<{ id: string; alias: string | null; nombre: string | null } | null>(null)
  const [codigoError, setCodigoError] = useState<string | null>(null)
  const [vinculadoOk, setVinculadoOk] = useState(false)
  const [vinculadoNombre, setVinculadoNombre] = useState<string | null>(null)
  const [isPendingBuscar, startBuscar] = useTransition()
  const [isPendingVincular, startVincular] = useTransition()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>(solicitudesIniciales)
  const [procesandoSol, setProcesandoSol] = useState<string | null>(null)
  const [solFeedback, setSolFeedback] = useState<string | null>(null)

  const handleBuscar = () => {
    if (!codigo.trim()) return
    setCodigoError(null)
    setFixerEncontrado(null)
    setVinculadoOk(false)
    startBuscar(async () => {
      const res = await buscarFixerPorCodigo(codigo.trim(), repoId)
      if (res.error) { setCodigoError(res.error); return }
      if (res.fixer) setFixerEncontrado(res.fixer)
    })
  }

  const handleVincular = () => {
    if (!fixerEncontrado) return
    const nombre = fixerEncontrado.alias ?? fixerEncontrado.nombre ?? 'El fixer'
    startVincular(async () => {
      const res = await vincularFixerPorCodigo(fixerEncontrado.id, repoId, repoNombre)
      if (res.error) { setCodigoError(res.error); return }
      setVinculadoNombre(nombre)
      setVinculadoOk(true)
      setFixerEncontrado(null)
      setCodigo('')
    })
  }

  const handleAprobar = (sol: Solicitud) => {
    setProcesandoSol(sol.id)
    startVincular(async () => {
      const res = await aprobarSolicitudFixer(sol.id, sol.fixer_id, repoId)
      setProcesandoSol(null)
      if (res.error) { setSolFeedback(res.error); return }
      setSolicitudes(prev => prev.filter(s => s.id !== sol.id))
      setSolFeedback(`Fixer aprobado y vinculado.`)
    })
  }

  const handleRechazar = (sol: Solicitud) => {
    setProcesandoSol(sol.id)
    startVincular(async () => {
      const res = await rechazarSolicitudFixer(sol.id)
      setProcesandoSol(null)
      if (res.error) { setSolFeedback(res.error); return }
      setSolicitudes(prev => prev.filter(s => s.id !== sol.id))
    })
  }

  return (
    <div className="space-y-4">

      {/* Solicitudes pendientes (del fixer) */}
      {solicitudes.length > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Solicitudes de fixers pendientes</p>
          {solicitudes.map(sol => (
            <div key={sol.id} className="bg-white rounded-lg border border-blue-100 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {sol.fixer?.alias ?? sol.fixer?.nombre ?? 'Fixer sin nombre'}
                </p>
                {sol.fixer?.celular && <p className="text-xs text-gray-500">{sol.fixer.celular}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAprobar(sol)}
                  disabled={procesandoSol === sol.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60"
                >
                  {procesandoSol === sol.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Aprobar
                </button>
                <button
                  onClick={() => handleRechazar(sol)}
                  disabled={procesandoSol === sol.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 border border-red-200 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  <XCircle size={13} />
                  Rechazar
                </button>
              </div>
            </div>
          ))}
          {solFeedback && <p className="text-xs text-green-700 font-medium">{solFeedback}</p>}
        </div>
      )}

      {/* Vincular por código */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Hash size={16} className="text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-700">Vincular fixer por código</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          El fixer te comparte su código personal (ej: FIXR-7823). Ingresalo para enviarle una invitación.
        </p>

        {vinculadoOk && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
            <UserCheck size={15} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700">Solicitud enviada</p>
              <p className="text-xs text-green-600">{vinculadoNombre} debe aceptarla desde su perfil.</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={codigo}
            onChange={e => { setCodigo(e.target.value.toUpperCase()); setCodigoError(null); setFixerEncontrado(null); setVinculadoOk(false) }}
            onKeyDown={e => e.key === 'Enter' && handleBuscar()}
            placeholder="Ej: FIXR-7823"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleBuscar}
            disabled={isPendingBuscar || !codigo.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isPendingBuscar ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>

        {codigoError && <p className="text-xs text-red-500 mt-2">{codigoError}</p>}

        {fixerEncontrado && (
          <div className="mt-3 p-4 border border-gray-200 rounded-xl bg-gray-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <span className="text-blue-600 font-bold text-sm">
                  {(fixerEncontrado.alias ?? fixerEncontrado.nombre ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {fixerEncontrado.alias ?? fixerEncontrado.nombre ?? 'Fixer'}
                </p>
                <p className="text-xs text-blue-600 font-medium">Fixer</p>
              </div>
            </div>
            <button
              onClick={handleVincular}
              disabled={isPendingVincular}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isPendingVincular ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
              Invitar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
