'use client'

import { KeyRound } from 'lucide-react'
import { asignarCodigosExistentes } from './actions'
import { BackfillBtn } from './backfill-btn'

export function AsignarCodigosBtn({ pendientes }: { pendientes: number }) {
  return (
    <BackfillBtn
      icono={<KeyRound size={13} />}
      label="Asignar códigos"
      labelCorriendo="Asignando..."
      titulo="Asignar código personal a gondoleros y fixers que no tengan uno, o que tengan uno del formato viejo"
      textoVacio="Todos tienen código ✓"
      sustantivo="códigos asignados"
      pendientes={pendientes}
      ejecutar={asignarCodigosExistentes}
    />
  )
}
