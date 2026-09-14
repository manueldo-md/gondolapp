import React from 'react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader, ModuloVacio, ContextoLinea } from './piezas'

type ModuloTxt = Extract<Modulo, { tipo: 'texto' }>

/**
 * El texto libre no se agrega: se lee. Por eso va con contexto — sin saber de
 * qué comercio y de qué ciudad salió, una observación suelta no es accionable
 * para la marca.
 */
export function ModuloTexto({ modulo, tema }: { modulo: ModuloTxt; tema: Tema }) {
  return (
    <div>
      <ModuloHeader pregunta={modulo.campo.pregunta} base={modulo.base} />
      {modulo.respuestas.length === 0 ? (
        <ModuloVacio />
      ) : (
        <ul className="space-y-2">
          {modulo.respuestas.map((r, i) => (
            <li key={i} className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-sm text-gray-700 leading-snug">&ldquo;{r.valor}&rdquo;</p>
              <div className="mt-1.5">
                <ContextoLinea contexto={r.contexto} verAgente={tema.verAgente} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
