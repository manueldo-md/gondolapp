'use client'

import { useState, useTransition } from 'react'
import { MapPin, Check, Loader2 } from 'lucide-react'
import { actualizarZonasGondolero } from './actions'

interface Zona {
  id: string
  nombre: string
  tipo: string
}

interface Props {
  todasLasZonas: Zona[]
  zonasActuales: string[] // IDs de zonas del gondolero
}

export function ZonasSelector({ todasLasZonas, zonasActuales }: Props) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set(zonasActuales))
  const [guardado, setGuardado] = useState(false)
  const [isPending, startTransition] = useTransition()

  const toggle = (id: string) => {
    setSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setGuardado(false)
  }

  const handleGuardar = () => {
    startTransition(async () => {
      await actualizarZonasGondolero([...seleccionadas])
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    })
  }

  if (todasLasZonas.length === 0) return null

  // Agrupar por tipo
  const grupos: Record<string, Zona[]> = {}
  for (const z of todasLasZonas) {
    if (!grupos[z.tipo]) grupos[z.tipo] = []
    grupos[z.tipo].push(z)
  }
  const TIPO_LABEL: Record<string, string> = {
    ciudad: 'Ciudades',
    provincia: 'Provincias',
    region: 'Regiones',
  }
  const orden = ['ciudad', 'provincia', 'region']
  const tiposOrdenados = orden.filter(t => grupos[t])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} className="text-gondo-verde-400" />
        <h2 className="text-sm font-semibold text-gray-700">¿En qué zonas trabajás?</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Seleccioná las ciudades o zonas donde relevás comercios. Esto filtra las campañas disponibles para vos.
      </p>

      <div className="space-y-4">
        {tiposOrdenados.map(tipo => (
          <div key={tipo}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
              {TIPO_LABEL[tipo] ?? tipo}
            </p>
            <div className="space-y-1.5">
              {grupos[tipo].map(zona => {
                const activa = seleccionadas.has(zona.id)
                return (
                  <button
                    key={zona.id}
                    onClick={() => toggle(zona.id)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left ${
                      activa
                        ? 'bg-gondo-verde-50 border-gondo-verde-400 text-gondo-verde-600'
                        : 'bg-white border-gray-200 text-gray-700'
                    }`}
                  >
                    <span className="text-sm font-medium">{zona.nombre}</span>
                    {activa && <Check size={16} className="text-gondo-verde-400 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-gondo-verde-400 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {isPending ? 'Guardando...' : 'Guardar zonas'}
        </button>
        {guardado && <span className="text-sm text-gondo-verde-400 font-medium">✓ Guardado</span>}
      </div>
    </div>
  )
}
