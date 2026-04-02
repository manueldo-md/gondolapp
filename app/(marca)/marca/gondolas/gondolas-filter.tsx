'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { TipoCampana } from '@/types'

interface CampanaOption {
  id: string
  nombre: string
  tipo: TipoCampana
}

const ESTADOS = [
  { value: '',           label: 'Todos los estados' },
  { value: 'pendiente',  label: 'Pendiente'         },
  { value: 'aprobada',   label: 'Aprobada'          },
  { value: 'rechazada',  label: 'Rechazada'         },
  { value: 'en_revision', label: 'En revisión'      },
]

export function GondolasFilter({
  campanas,
  campanaSeleccionada,
  estadoSeleccionado,
}: {
  campanas: CampanaOption[]
  campanaSeleccionada: string
  estadoSeleccionado: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams()
    if (key !== 'campana' && campanaSeleccionada) params.set('campana', campanaSeleccionada)
    if (key !== 'estado' && estadoSeleccionado) params.set('estado', estadoSeleccionado)
    if (value) params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Filtro de campaña */}
      <select
        value={campanaSeleccionada}
        onChange={e => update('campana', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
      >
        <option value="">Todas las campañas</option>
        {campanas.map(c => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>

      {/* Filtro de estado */}
      <select
        value={estadoSeleccionado}
        onChange={e => update('estado', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600 transition"
      >
        {ESTADOS.map(e => (
          <option key={e.value} value={e.value}>{e.label}</option>
        ))}
      </select>
    </div>
  )
}
