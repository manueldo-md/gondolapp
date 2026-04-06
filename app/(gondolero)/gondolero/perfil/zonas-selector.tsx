'use client'

import { useState, useTransition } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { SelectorZona } from '@/components/shared/selector-zona'
import { actualizarLocalidadesGondolero } from './actions'

interface Props {
  localidadesActuales: number[]
}

export function LocalidadesSelector({ localidadesActuales }: Props) {
  const [seleccionadas, setSeleccionadas] = useState<number[]>(localidadesActuales)
  const [guardado, setGuardado] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleGuardar = () => {
    startTransition(async () => {
      await actualizarLocalidadesGondolero(seleccionadas)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} className="text-gondo-verde-400" />
        <h2 className="text-sm font-semibold text-gray-700">¿En qué zonas trabajás?</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Seleccioná las localidades donde relevás comercios. Esto filtra las campañas disponibles para vos.
      </p>

      <SelectorZona
        localidadesSeleccionadas={seleccionadas}
        onSeleccionadas={setSeleccionadas}
        showLabel={false}
        accentClass="focus:ring-2 focus:ring-gondo-verde-400/20 focus:border-gondo-verde-400"
      />

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
