'use client'

import { useRouter, usePathname } from 'next/navigation'

export function GondolasTabs({
  tabActivo,
  pendienteCount,
}: {
  tabActivo: 'pendiente' | 'archivo'
  pendienteCount: number
}) {
  const router  = useRouter()
  const pathname = usePathname()

  function irA(tab: 'pendiente' | 'archivo') {
    if (tab === 'pendiente') {
      router.push(pathname)
    } else {
      router.push(`${pathname}?tab=archivo`)
    }
  }

  return (
    <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
      <button
        onClick={() => irA('pendiente')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
          tabActivo === 'pendiente'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Por aprobar
        {pendienteCount > 0 && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
              tabActivo === 'pendiente'
                ? 'bg-gondo-amber-400 text-white'
                : 'bg-gray-300 text-gray-600'
            }`}
          >
            {pendienteCount}
          </span>
        )}
      </button>
      <button
        onClick={() => irA('archivo')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          tabActivo === 'archivo'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Archivo completo
      </button>
    </div>
  )
}
