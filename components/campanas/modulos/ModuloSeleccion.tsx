import React from 'react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloHeader, BarraProporcion, ModuloVacio } from './piezas'

type ModuloSel = Extract<Modulo, { tipo: 'seleccion' }>

export function ModuloSeleccion({ modulo, tema }: { modulo: ModuloSel; tema: Tema }) {
  const esMultiple = modulo.campo.tipo === 'seleccion_multiple'

  return (
    <div>
      <ModuloHeader
        pregunta={modulo.campo.pregunta}
        base={modulo.base}
        nota={esMultiple ? 'se puede elegir más de una' : undefined}
      />
      {modulo.opciones.length === 0 ? (
        <ModuloVacio mensaje="Esta pregunta no tiene opciones configuradas." />
      ) : (
        <div className="space-y-2">
          {modulo.opciones.map(o => (
            <BarraProporcion
              key={o.opcion}
              label={o.opcion}
              n={o.n}
              total={modulo.base}
              color={tema.barraModulo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
