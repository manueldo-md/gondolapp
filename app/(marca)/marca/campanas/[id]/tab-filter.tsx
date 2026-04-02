'use client'

import { useRouter, usePathname } from 'next/navigation'

const TABS = [
  { value: '',          label: 'Todas'      },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada',  label: 'Aprobadas'  },
  { value: 'rechazada', label: 'Rechazadas' },
]

export function TabFilter({ tabActivo }: { tabActivo: string }) {
  const router   = useRouter()
  const pathname = usePathname()

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
      {TABS.map(t => (
        <button
          key={t.value}
          onClick={() => router.push(t.value ? `${pathname}?tab=${t.value}` : pathname)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tabActivo === t.value
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
