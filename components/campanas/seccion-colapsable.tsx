'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function SeccionColapsable({
  titulo,
  badge,
  badgeClassName,
  headerClassName,
  defaultOpen = true,
  children,
}: {
  titulo: string
  badge: number
  badgeClassName: string
  headerClassName: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl mb-2 ${headerClassName}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{titulo}</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeClassName}`}>
            {badge}
          </span>
        </div>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '9999px' : '0px' }}
      >
        {children}
      </div>
    </div>
  )
}
