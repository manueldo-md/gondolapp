'use client'

/**
 * La lista vive en components/shared/solicitudes-fixer.tsx, compartida con el
 * panel de repositora. Acá solo queda el cableado de las actions: no se pueden
 * pasar closures de un Server Component a uno de cliente, así que hace falta
 * este envoltorio por panel.
 */

import { SolicitudesFixer, type SolicitudFixer } from '@/components/shared/solicitudes-fixer'
import { aprobarSolicitudFixer, rechazarSolicitudFixer } from './solicitudes-actions'

export function SolicitudesFixerTab({
  solicitudes,
  distriId,
  distriNombre,
}: {
  solicitudes: SolicitudFixer[]
  distriId: string
  distriNombre: string
}) {
  return (
    <SolicitudesFixer
      solicitudes={solicitudes}
      tema="distri"
      onAprobar={s => aprobarSolicitudFixer(s.id, s.fixer_id, distriId, distriNombre)}
      onRechazar={(s, motivo) => rechazarSolicitudFixer(s.id, s.fixer_id, distriNombre, motivo)}
    />
  )
}
