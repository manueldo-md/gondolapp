'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface ColapsableSectionProps {
  title: string
  badge?: string | number | null
  badgeColor?: 'verde' | 'amber' | 'red' | 'gray'
  defaultOpen?: boolean
  children: React.ReactNode
}

export function ColapsableSection({
  title,
  badge,
  badgeColor = 'verde',
  defaultOpen = false,
  children,
}: ColapsableSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  const badgeColors = {
    verde: 'bg-gondo-verde-50 text-gondo-verde-400',
    amber: 'bg-gondo-amber-50 text-gondo-amber-400',
    red:   'bg-red-100 text-red-600',
    gray:  'bg-gray-100 text-gray-500',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{title}</span>
          {badge != null && badge !== 0 && badge !== '' && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-gray-400 transition-transform duration-200 shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <div className="pt-3">
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
