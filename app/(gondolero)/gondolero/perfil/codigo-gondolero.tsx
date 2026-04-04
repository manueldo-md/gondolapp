'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CodigoGondolero({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)

  const handleCopiar = async () => {
    await navigator.clipboard.writeText(codigo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleWhatsApp = () => {
    const texto = encodeURIComponent(
      `Hola! Mi código de gondolero en GondolApp es ${codigo}. Ingresalo en tu panel para vincularme a tu distribuidora.`
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-1">Mi código de gondolero</h2>
      <p className="text-xs text-gray-400 mb-3">
        Compartí este código con tu distribuidora para que te vincule a su equipo.
      </p>
      <div className="flex items-center justify-center mb-3 py-3 bg-gray-50 rounded-xl border border-gray-100">
        <span className="text-2xl font-mono font-bold text-gray-900 tracking-widest">{codigo}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleCopiar}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {copiado ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
        >
          📱 WhatsApp
        </button>
      </div>
    </div>
  )
}
