'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { aceptarInvitacionMarca } from './actions'

interface Props {
  tokenId: string
  marcaId: string
  distriId: string
  iniciadoPor: 'marca' | 'distri'
  otroNombre: string
  miNombre: string
}

export function AceptarInvitacionMarcaForm({
  tokenId, marcaId, distriId, iniciadoPor, otroNombre, miNombre
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [aceptaTyc, setAceptaTyc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const tipoInvitador = iniciadoPor === 'marca' ? 'La marca' : 'La distribuidora'

  const handleAceptar = () => {
    if (!aceptaTyc) {
      setError('Debés aceptar los términos y condiciones para continuar.')
      return
    }
    startTransition(async () => {
      const res = await aceptarInvitacionMarca(tokenId, marcaId, distriId, iniciadoPor)
      if (res.error) {
        setError(res.error)
      } else {
        router.push(iniciadoPor === 'marca' ? '/distribuidora/marcas' : '/marca/distribuidoras')
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🤝</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Invitación de vinculación</h1>
        <p className="text-sm text-gray-500">
          {tipoInvitador} <strong className="text-gray-700">{otroNombre}</strong> te invita a establecer una relación comercial con <strong className="text-gray-700">{miNombre}</strong>.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 mb-6 text-xs text-gray-600 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Al aceptar podrán:</p>
        <p>• Colaborar en campañas conjuntas</p>
        <p>• Ver métricas compartidas</p>
        <p>• Coordinarse en el relevamiento de precios</p>
      </div>

      <label className="flex items-start gap-3 mb-6 cursor-pointer">
        <input
          type="checkbox"
          checked={aceptaTyc}
          onChange={e => { setAceptaTyc(e.target.checked); setError(null) }}
          className="mt-0.5 w-4 h-4 accent-indigo-600"
        />
        <span className="text-xs text-gray-600">
          Acepto los <span className="text-indigo-600 underline">términos y condiciones</span> de uso de GondolApp y autorizo el intercambio de información comercial entre las partes.
        </span>
      </label>

      {error && (
        <p className="text-xs text-red-600 mb-4 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          disabled={isPending}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={handleAceptar}
          disabled={isPending || !aceptaTyc}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-[#1E1B4B] rounded-xl hover:bg-[#2d2a6e] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Confirmando...' : 'Aceptar vinculación'}
        </button>
      </div>
    </div>
  )
}
