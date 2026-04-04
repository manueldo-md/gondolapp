'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { aceptarInvitacion } from './actions'

export function AceptarInvitacionBtn({
  tokenId,
  gondoleroId,
  distriId,
  distriNombre,
}: {
  tokenId: string
  gondoleroId: string
  distriId: string
  distriNombre: string
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleAceptar = () => {
    startTransition(async () => {
      const res = await aceptarInvitacion(tokenId, gondoleroId, distriId, distriNombre)
      if (!res.error) {
        router.push('/gondolero/perfil?vinculado=1')
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleAceptar}
        disabled={isPending}
        className="w-full py-3.5 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-touch"
      >
        {isPending ? <Loader2 size={18} className="animate-spin" /> : '🤝 Sí, unirme a ' + distriNombre}
      </button>
      <a
        href="/gondolero/campanas"
        className="block w-full py-2 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        Cancelar
      </a>
    </div>
  )
}
