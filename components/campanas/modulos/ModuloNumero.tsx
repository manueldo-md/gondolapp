import React from 'react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader, ModuloVacio, ContextoLinea } from './piezas'

type ModuloNum = Extract<Modulo, { tipo: 'numero' }>

export function ModuloNumero({ modulo, tema }: { modulo: ModuloNum; tema: Tema }) {
  return (
    <div>
      <ModuloHeader pregunta={modulo.campo.pregunta} base={modulo.base} />
      {modulo.valores.length === 0 ? (
        <ModuloVacio />
      ) : (
        <>
          {/* Mediana antes que promedio, y pegadas: cuando difieren mucho es
              porque hay un outlier tirando del promedio, y verlas juntas es lo
              que lo delata. La mediana va destacada porque es la que aguanta
              un valor cargado mal. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-green-50 rounded-xl p-2">
              <p className="text-base font-bold text-green-700 tabular-nums">{modulo.min}</p>
              <p className="text-xs text-gray-400">Mínimo</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-2">
              <p className="text-base font-bold text-blue-700 tabular-nums">{modulo.mediana}</p>
              <p className="text-xs text-gray-400">Mediana</p>
            </div>
            <div className="bg-blue-50/60 rounded-xl p-2">
              <p className="text-base font-bold text-blue-600 tabular-nums">{modulo.avg}</p>
              <p className="text-xs text-gray-400">Promedio</p>
            </div>
            <div className="bg-red-50 rounded-xl p-2">
              <p className="text-base font-bold text-red-700 tabular-nums">{modulo.max}</p>
              <p className="text-xs text-gray-400">Máximo</p>
            </div>
          </div>

          {/* Detalle valor por valor, ordenado de mayor a menor.
              Los tiles de arriba dicen CUÁNTO; esta lista dice DÓNDE. */}
          <ul className="mt-3 space-y-1.5">
            {modulo.respuestas.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
              >
                <span className="text-sm font-bold text-gray-800 tabular-nums shrink-0 min-w-[3.5rem]">
                  {r.valor}
                </span>
                <div className="min-w-0 flex-1">
                  <ContextoLinea contexto={r.contexto} verAgente={tema.verAgente} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* La distribución (histograma) es etapa 2. La serie completa ya viaja en
          modulo.valores: el cargador dejó de tirarla. */}
    </div>
  )
}
