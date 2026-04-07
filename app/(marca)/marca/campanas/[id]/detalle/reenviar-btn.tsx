'use client'

import { useTransition } from 'react'
import { Loader2, Send } from 'lucide-react'
import { reenviarParaRevision } from './draft-actions'

export function ReenviarBtn({ campanaId }: { campanaId: string }) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(async () => { await reenviarParaRevision(campanaId) })}
      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      Corregir y reenviar
    </button>
  )
}
