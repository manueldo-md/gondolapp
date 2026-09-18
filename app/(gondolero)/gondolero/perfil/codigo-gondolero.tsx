'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

/**
 * El código personal, con copiar y WhatsApp.
 *
 * Lo usan el perfil y el vacío del ranking de Logros. `className` existe solo
 * para que el segundo pueda sacarle el margen inferior cuando va al final de
 * una tarjeta; el resto es idéntico a propósito, porque es la misma pieza.
 */
export function CodigoGondolero({
  codigo,
  className = 'mb-4',
}: {
  codigo: string | null
  className?: string
}) {
  const [copiado, setCopiado] = useState(false)

  const handleCopiar = async () => {
    if (!codigo) return
    await navigator.clipboard.writeText(codigo)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleWhatsApp = () => {
    if (!codigo) return
    const texto = encodeURIComponent(
      `Hola! Mi código de gondolero en GondolApp es ${codigo}. Ingresalo en tu panel para vincularme a tu distribuidora.`
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  return (
    <div className={`bg-gray-50 rounded-xl border border-gray-100 p-4 ${className}`}>
      <p className="text-xs text-gray-500 mb-1">Tu código personal</p>

      {codigo ? (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xl font-mono font-bold text-gray-900 tracking-widest">{codigo}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopiar}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 bg-white rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              {copiado ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors"
            >
              📱 WhatsApp
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">Compartí este código con tu distribuidora para que te vincule.</p>
        </>
      ) : (
        <p className="text-sm text-gray-400 mt-1">
          Sin código asignado. Contactá al administrador para que te asigne uno.
        </p>
      )}
    </div>
  )
}
