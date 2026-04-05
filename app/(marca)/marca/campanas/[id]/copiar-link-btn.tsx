'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

export function CopiarLinkBtn({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // fallback para browsers sin clipboard API
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopiar}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all ${
        copiado
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-gondo-indigo-600 text-white hover:bg-gondo-indigo-400'
      }`}
    >
      {copiado ? (
        <>
          <Check size={15} />
          Copiado
        </>
      ) : (
        <>
          <Copy size={15} />
          Copiar link
        </>
      )}
    </button>
  )
}
