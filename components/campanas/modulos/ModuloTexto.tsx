import React from 'react'
import { MapPin, Clock, User } from 'lucide-react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader, ModuloVacio } from './piezas'

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
              <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px] text-gray-400">
                {r.contexto.comercio && (
                  <span className="flex items-center gap-1 min-w-0">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">
                      {r.contexto.comercio}
                      {r.contexto.ciudad ? ` · ${r.contexto.ciudad}` : ''}
                    </span>
                  </span>
                )}
                {tema.verAgente && r.contexto.alias && (
                  <span className="flex items-center gap-1">
                    <User size={11} className="shrink-0" />
                    {r.contexto.alias}
                  </span>
                )}
                {r.contexto.fecha && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} className="shrink-0" />
                    {new Date(r.contexto.fecha).toLocaleDateString('es-AR')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
