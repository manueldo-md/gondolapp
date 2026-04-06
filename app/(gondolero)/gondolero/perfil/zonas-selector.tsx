'use client'

import { useState, useTransition, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SelectorZona, type GrupoZona } from '@/components/shared/selector-zona'
import { actualizarLocalidadesGondolero } from './actions'

interface Props {
  localidadesActuales: number[]
}

export function LocalidadesSelector({ localidadesActuales }: Props) {
  const [grupos, setGrupos] = useState<GrupoZona[]>([])
  const [guardado, setGuardado] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Reconstruir grupos desde los IDs planos al montar
  useEffect(() => {
    if (localidadesActuales.length === 0) return

    createClient()
      .from('localidades')
      .select('id, nombre, departamento_id, departamentos(id, nombre, provincia_id, provincias(id, nombre))')
      .in('id', localidadesActuales)
      .then(({ data }) => {
        if (!data) return

        // Agrupar por departamento_id
        const gruposMap: Record<number, GrupoZona> = {}
        for (const loc of data as Array<{
          id: number; nombre: string; departamento_id: number
          departamentos: { id: number; nombre: string; provincia_id: number; provincias: { id: number; nombre: string } }
        }>) {
          const deptId = loc.departamento_id
          const dept   = loc.departamentos
          const prov   = dept?.provincias
          if (!gruposMap[deptId]) {
            gruposMap[deptId] = {
              departamentoId:    deptId,
              departamentoNombre: dept?.nombre ?? '',
              provinciaId:       prov?.id ?? 0,
              provinciaNombre:   prov?.nombre ?? '',
              localidadIds:      [],
              todas:             false,
            }
          }
          gruposMap[deptId].localidadIds.push(loc.id)
        }

        setGrupos(Object.values(gruposMap))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // solo al montar

  const handleGuardar = () => {
    startTransition(async () => {
      const ids = grupos.flatMap(g => g.localidadIds)
      await actualizarLocalidadesGondolero(ids)
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
        grupos={grupos}
        onGrupos={setGrupos}
        showLabel={false}
        accentClass="focus:ring-2 focus:ring-gondo-verde-400/20 focus:border-gondo-verde-400"
        addBtnClass="bg-gondo-verde-400 hover:opacity-90 text-white"
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
