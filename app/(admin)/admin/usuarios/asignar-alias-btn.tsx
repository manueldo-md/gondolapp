'use client'

import { Wand2 } from 'lucide-react'
import { asignarAliasExistentes } from './actions'
import { BackfillBtn } from './backfill-btn'

export function AsignarAliasBtn() {
  return (
    <BackfillBtn
      icono={<Wand2 size={13} />}
      label="Asignar alias"
      labelCorriendo="Asignando..."
      titulo="Asignar alias únicos a gondoleros y fixers que no tienen uno"
      textoVacio="Todos tienen alias ✓"
      sustantivo="alias asignados"
      ejecutar={asignarAliasExistentes}
    />
  )
}
