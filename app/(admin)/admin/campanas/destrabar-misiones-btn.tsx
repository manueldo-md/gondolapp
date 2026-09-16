'use client'

import { Unlock } from 'lucide-react'
import { destrabarMisionesTrabadas } from './actions'
import { BackfillBtn } from '../usuarios/backfill-btn'

export function DestrabarMisionesBtn({ pendientes }: { pendientes: number }) {
  return (
    <BackfillBtn
      icono={<Unlock size={13} />}
      label="Destrabar misiones"
      labelCorriendo="Destrabando..."
      titulo="Reintenta la aprobación de las misiones de campañas sin fotos que quedaron en pendiente"
      textoVacio="No hay misiones trabadas ✓"
      sustantivo="misiones destrabadas"
      pendientes={pendientes}
      ejecutar={destrabarMisionesTrabadas}
    />
  )
}
