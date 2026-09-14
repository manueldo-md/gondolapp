/**
 * components/campanas/modulos/ModuloDispatcher.tsx
 * Elige el componente según el tipo del módulo.
 *
 * El switch vive acá y no dentro de la vista para que agregar un tipo de campo
 * sea agregar un archivo, no una rama más en un componente de 400 líneas.
 */

import React from 'react'
import type { Modulo } from '@/lib/resultados'
import type { Tema } from './tema'
import { ModuloBinaria } from './ModuloBinaria'
import { ModuloNumero } from './ModuloNumero'
import { ModuloSeleccion } from './ModuloSeleccion'
import { ModuloTexto } from './ModuloTexto'
import { ModuloFoto } from './ModuloFoto'
import { ModuloHeader, ModuloVacio } from './piezas'

export function ModuloDispatcher({
  modulo,
  tema,
  fotoRespuestasMap,
  camposMap,
  renderFotoAcciones,
}: {
  modulo: Modulo
  tema: Tema
  fotoRespuestasMap: Map<string, { campo_id: string; valor: unknown }[]>
  camposMap: Map<string, { pregunta: string; tipo: string }>
  renderFotoAcciones?: (fotoId: string, estado: string) => React.ReactNode
}) {
  switch (modulo.tipo) {
    case 'binaria':
      return <ModuloBinaria modulo={modulo} tema={tema} />
    case 'numero':
      return <ModuloNumero modulo={modulo} tema={tema} />
    case 'seleccion':
      return <ModuloSeleccion modulo={modulo} tema={tema} />
    case 'texto':
      return <ModuloTexto modulo={modulo} tema={tema} />
    case 'foto':
      return (
        <ModuloFoto
          modulo={modulo}
          tema={tema}
          fotoRespuestasMap={fotoRespuestasMap}
          camposMap={camposMap}
          renderFotoAcciones={renderFotoAcciones}
        />
      )
    default:
      // Tipo de campo que el panel todavía no sabe mostrar. Se muestra igual,
      // con su pregunta, para que no desaparezca del informe sin aviso.
      return (
        <div>
          <ModuloHeader pregunta={modulo.campo.pregunta} base={modulo.base} />
          <ModuloVacio mensaje="Este tipo de campo todavía no tiene visualización." />
        </div>
      )
  }
}
