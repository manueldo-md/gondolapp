'use client'

import { useRouter, usePathname } from 'next/navigation'

const TABS = [
  { value: '',          label: 'Todas'      },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada',  label: 'Aprobadas'  },
  { value: 'rechazada', label: 'Rechazadas' },
]

export function TabFilter({
  tabActivo,
  counts = {},
}: {
  tabActivo: string
  counts?: Record<string, number>
}) {
  const router   = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
      {TABS.map(t => {
        const n = t.value ? (counts[t.value] ?? 0) : Object.values(counts).reduce((a, b) => a + b, 0)
        return (
          <button
            key={t.value}
            onClick={() => router.push(t.value ? `${pathname}?tab=${t.value}` : pathname)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tabActivo === t.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {n > 0 && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none ${
                tabActivo === t.value
                  ? t.value === 'pendiente' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {n}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
