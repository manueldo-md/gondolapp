import React from 'react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader, BarraProporcion, ModuloVacio } from './piezas'

type ModuloBin = Extract<Modulo, { tipo: 'binaria' }>

export function ModuloBinaria({ modulo, tema }: { modulo: ModuloBin; tema: Tema }) {
  const pctSi = modulo.base > 0 ? Math.round((modulo.si / modulo.base) * 100) : 0

  return (
    <div>
      <ModuloHeader
        pregunta={modulo.campo.pregunta}
        base={modulo.base}
        nota={modulo.base > 0 ? `${pctSi}% sí` : undefined}
      />
      {modulo.base === 0 ? (
        <ModuloVacio />
      ) : (
        <div className="space-y-2">
          <BarraProporcion label="Sí" n={modulo.si} total={modulo.base} color="bg-green-400" />
          <BarraProporcion label="No" n={modulo.no} total={modulo.base} color="bg-red-400" />
        </div>
      )}
      {/* tema no se usa todavía acá: el sí/no tiene semántica de color propia
          (verde/rojo) que no depende del panel. Se deja en la firma porque en
          la etapa 2 el gráfico sí toma el acento del panel. */}
      <span className="hidden">{tema.acento}</span>
    </div>
  )
}
