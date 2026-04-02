'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { solicitarCanje } from './actions'
import type { TipoPremio, NivelGondolero } from '@/types'

interface Premio {
  tipo:    TipoPremio
  emoji:   string
  label:   string
  puntos:  number
  soloProRequired: boolean
}

const PREMIOS: Premio[] = [
  { tipo: 'credito_celular', emoji: '🔋', label: 'Crédito celular',   puntos: 300,  soloProRequired: false },
  { tipo: 'nafta_ypf',       emoji: '⛽', label: 'Nafta YPF',         puntos: 500,  soloProRequired: false },
  { tipo: 'giftcard_ml',     emoji: '🎁', label: 'Gift Card ML',      puntos: 1000, soloProRequired: false },
  { tipo: 'transferencia',   emoji: '🏦', label: 'Transferencia',     puntos: 2000, soloProRequired: true  },
]

export function CanjeCatalogo({
  puntosDisponibles,
  nivel,
}: {
  puntosDisponibles: number
  nivel: NivelGondolero
}) {
  const [seleccionado, setSeleccionado] = useState<Premio | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSeleccionar = (p: Premio) => {
    if (p.soloProRequired && nivel !== 'pro') return
    if (puntosDisponibles < p.puntos) return
    setSeleccionado(p)
    setExito(null)
    setErrorMsg(null)
  }

  const handleConfirmar = () => {
    if (!seleccionado) return
    startTransition(async () => {
      const result = await solicitarCanje(seleccionado.tipo)
      if (result?.error) {
        setErrorMsg(result.error)
      } else {
        setExito(`¡Canje solicitado! Lo procesamos en 48hs hábiles.`)
      }
      setSeleccionado(null)
    })
  }

  return (
    <div className="space-y-2">
      {PREMIOS.map(p => {
        const bloqueadoPro = p.soloProRequired && nivel !== 'pro'
        const faltanPuntos = puntosDisponibles < p.puntos
        const bloqueado = bloqueadoPro || faltanPuntos
        return (
          <button
            key={p.tipo}
            onClick={() => handleSeleccionar(p)}
            disabled={bloqueado || isPending}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border text-left transition-colors min-h-[44px] ${
              bloqueado
                ? 'bg-gray-50 border-gray-100 cursor-not-allowed'
                : 'bg-white border-gray-200 hover:border-gondo-verde-400 active:bg-gondo-verde-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className={`text-2xl ${bloqueado ? 'opacity-50' : ''}`}>{p.emoji}</span>
              <div>
                <p className={`text-sm font-semibold ${bloqueado ? 'text-gray-400' : 'text-gray-900'}`}>
                  {p.label}
                </p>
                {bloqueadoPro && (
                  <p className="text-xs text-gray-400">Solo nivel Pro</p>
                )}
                {faltanPuntos && !bloqueadoPro && (
                  <p className="text-xs text-gray-400">
                    Te faltan {(p.puntos - puntosDisponibles).toLocaleString('es-AR')} puntos
                  </p>
                )}
              </div>
            </div>
            <span className={`text-sm font-bold ${bloqueado ? 'text-gray-300' : 'text-gondo-verde-400'}`}>
              {p.puntos.toLocaleString('es-AR')} pts
            </span>
          </button>
        )
      })}

      {/* Confirmación */}
      {seleccionado && (
        <div className="mt-4 bg-gondo-verde-50 border border-gondo-verde-400/30 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-medium text-gray-800 text-center">
            ¿Querés canjear{' '}
            <span className="font-bold text-gondo-verde-400">
              {seleccionado.puntos.toLocaleString('es-AR')} puntos
            </span>{' '}
            por {seleccionado.emoji} {seleccionado.label}?
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setSeleccionado(null)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-gondo-verde-400 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isPending ? <Loader2 size={15} className="animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {exito && (
        <div className="mt-3 bg-green-50 border border-green-200 rounded-2xl p-3 text-center text-sm text-green-700 font-medium">
          {exito}
        </div>
      )}

      {errorMsg && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-2xl p-3 text-center text-sm text-red-600">
          {errorMsg}
        </div>
      )}
    </div>
  )
}
