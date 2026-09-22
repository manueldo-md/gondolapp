'use client'

/**
 * Envoltorio de la lista compartida para el panel de repositora.
 *
 * Hasta el 24/9/2026 la aprobación vivía DENTRO del panel de invitación, y la
 * pestaña "Solicitudes" —que tiene el badge con el contador— era un cartel que
 * decía "aparecen arriba en el panel de invitación". O sea que el lugar donde
 * el contador te manda a mirar no era el lugar donde estaba la cosa.
 */

import { SolicitudesFixer, type SolicitudFixer } from '@/components/shared/solicitudes-fixer'
import { aprobarSolicitudFixer, rechazarSolicitudFixer } from './invitar-actions'

export function SolicitudesFixerTab({
  solicitudes,
  repoId,
  repoNombre,
}: {
  solicitudes: SolicitudFixer[]
  repoId: string
  repoNombre: string
}) {
  return (
    <SolicitudesFixer
      solicitudes={solicitudes}
      tema="repo"
      onAprobar={s => aprobarSolicitudFixer(s.id, s.fixer_id, repoId, repoNombre)}
      onRechazar={(s, motivo) => rechazarSolicitudFixer(s.id, s.fixer_id, repoNombre, motivo)}
    />
  )
}
