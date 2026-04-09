'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceptarInvitacionDistriRepo, rechazarInvitacionDistriRepo } from './actions'

interface Props {
  tokenId: string
  distriId: string
  repoId: string
  distriNombre: string
  repoNombre: string
}

export function AceptarInvitacionDistriRepoForm({ tokenId, distriId, repoId, distriNombre, repoNombre }: Props) {
  const [isPendingAceptar, startAceptar] = useTransition()
  const [isPendingRechazar, startRechazar] = useTransition()
  const [aceptaTyc, setAceptaTyc] = useState(false)
  const [confirmRechazar, setConfirmRechazar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleAceptar = () => {
    if (!aceptaTyc) {
      setError('Debés aceptar los términos y condiciones para continuar.')
      return
    }
    setError(null)
    startAceptar(async () => {
      const res = await aceptarInvitacionDistriRepo(tokenId, distriId, repoId)
      if (res.error) {
        setError(res.error)
      } else {
        router.push('/repositora/distribuidoras?vinculado=1')
      }
    })
  }

  const handleRechazar = () => {
    startRechazar(async () => {
      await rechazarInvitacionDistriRepo(tokenId)
      router.push('/repositora/dashboard')
    })
  }

  if (confirmRechazar) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-semibold text-red-700 mb-1">¿Rechazar la invitación?</p>
          <p className="text-xs text-red-600">
            No te vincularás con {distriNombre}. Podés pedirles un nuevo link si cambiás de opinión.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmRechazar(false)}
            disabled={isPendingRechazar}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleRechazar}
            disabled={isPendingRechazar}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isPendingRechazar ? 'Rechazando...' : 'Rechazar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🤝</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Invitación de vinculación</h1>
        <p className="text-sm text-gray-500">
          La distribuidora <strong className="text-gray-700">{distriNombre}</strong> te invita a establecer una relación comercial con{' '}
          <strong className="text-gray-700">{repoNombre}</strong>.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 mb-6 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Al aceptar podrán:</p>
        <p>• Coordinar campañas conjuntas de repositoría</p>
        <p>• Asignar fixers a campañas compartidas</p>
        <p>• Compartir métricas de cobertura en góndola</p>
      </div>

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={aceptaTyc}
          onChange={e => { setAceptaTyc(e.target.checked); setError(null) }}
          className="mt-0.5 w-4 h-4 accent-amber-600"
        />
        <span className="text-xs text-gray-600">
          Acepto los <span className="text-amber-700 underline">términos y condiciones</span> de uso de GondolApp y autorizo el intercambio de información comercial entre las partes.
        </span>
      </label>

      {error && (
        <p className="text-xs text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setConfirmRechazar(true)}
          disabled={isPendingAceptar}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          onClick={handleAceptar}
          disabled={isPendingAceptar || !aceptaTyc}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#BA7517] rounded-xl hover:bg-[#9a6012] transition-colors disabled:opacity-50"
        >
          {isPendingAceptar ? 'Confirmando...' : 'Aceptar vinculación'}
        </button>
      </div>
    </div>
  )
}
