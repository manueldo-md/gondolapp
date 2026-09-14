import React from 'react'
import type { Modulo } from '@/lib/resultados'
import { ModuloHeader, ModuloVacio } from './piezas'

type ModuloNum = Extract<Modulo, { tipo: 'numero' }>

export function ModuloNumero({ modulo }: { modulo: ModuloNum }) {
  return (
    <div>
      <ModuloHeader pregunta={modulo.campo.pregunta} base={modulo.base} />
      {modulo.valores.length === 0 ? (
        <ModuloVacio />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-green-50 rounded-xl p-2">
            <p className="text-base font-bold text-green-700">{modulo.min}</p>
            <p className="text-xs text-gray-400">Mínimo</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-2">
            <p className="text-base font-bold text-blue-700">{modulo.avg}</p>
            <p className="text-xs text-gray-400">Promedio</p>
          </div>
          <div className="bg-red-50 rounded-xl p-2">
            <p className="text-base font-bold text-red-700">{modulo.max}</p>
            <p className="text-xs text-gray-400">Máximo</p>
          </div>
        </div>
      )}
      {/* La distribución (histograma) es etapa 2. La serie completa ya viaja en
          modulo.valores: el cargador dejó de tirarla. */}
    </div>
  )
}
