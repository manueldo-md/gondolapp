'use client'

import { useState, useTransition } from 'react'
import { Link2, Loader2, Check, Copy } from 'lucide-react'
import { generarLinkInvitacionRepo } from './actions'

interface Props {
  marcaId: string
  marcaNombre: string
}

export function InvitarRepoPanel({ marcaId, marcaNombre }: Props) {
  const [isPending, startTransition] = useTransition()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerar = () => {
    setError(null)
    startTransition(async () => {
      const res = await generarLinkInvitacionRepo(marcaId, marcaNombre)
      if (res.error) {
        setError(res.error)
      } else if (res.link) {
        setLink(res.link)
      }
    })
  }

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleWhatsApp = () => {
    if (!link) return
    const msg = encodeURIComponent(
      `Hola! Te invito a vincularte con ${marcaNombre} en GondolApp. Aceptá desde este link (válido por 7 días): ${link}`
    )
    window.open(`https://wa.me/?text=${msg}`, '_blank')
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-1">Invitar repositora</h2>
      <p className="text-xs text-gray-500 mb-4">
        Generá un link de invitación para enviar a una repositora. Válido por 7 días.
      </p>

      {error && (
        <div className="bg-red-50 px-3 py-2 rounded-lg mb-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {!link ? (
        <button
          onClick={handleGenerar}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#1E1B4B] rounded-xl hover:bg-[#2d2a6e] transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
          {isPending ? 'Generando...' : 'Generar link de invitación'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-xs text-gray-600 flex-1 truncate font-mono">{link}</span>
            <button onClick={handleCopy} className="text-gray-400 hover:text-gray-600 transition-colors shrink-0">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleWhatsApp}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#25D366] rounded-xl hover:bg-[#1fb757] transition-colors"
            >
              <span>📲</span> Compartir por WhatsApp
            </button>
            <button
              onClick={() => { setLink(null); setError(null) }}
              className="px-3 py-2 text-xs font-medium text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Nuevo link
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
