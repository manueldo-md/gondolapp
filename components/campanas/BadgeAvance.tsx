/**
 * components/campanas/BadgeAvance.tsx
 * Badge del estado de avance del relevamiento, para las listas de campañas.
 *
 * Va al lado del badge de `campanas.estado` (Activa, Cerrada…), que es el
 * estado administrativo y responde otra pregunta. Este responde "¿sirve?".
 *
 * Una campaña sin mínimo cargado NO muestra badge: un rótulo que el lector no
 * puede accionar desde la lista es ruido. El aviso de que falta el mínimo va en
 * el dashboard, que es desde donde se puede ir a cargarlo.
 */

import React from 'react'
import { AVANCE_LABEL, AVANCE_COLOR, type EstadoAvance } from '@/lib/campana-avance'

export function BadgeAvance({ estado }: { estado: EstadoAvance | null }) {
  if (!estado) return null
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${AVANCE_COLOR[estado]}`}>
      {AVANCE_LABEL[estado]}
    </span>
  )
}
