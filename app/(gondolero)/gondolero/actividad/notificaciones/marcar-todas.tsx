'use client'

/**
 * "Marcar todas como leídas" del gondolero — el cuarto panel.
 *
 * Los otros tres ya lo tenían (marca, distri y admin) desde que se sacó el
 * auto-marcado al entrar. Acá faltaba, y su ausencia había dejado algo peor:
 * cuando esta pantalla pasó a marcar por clic, `marcarNotificacionesLeidas`
 * quedó **sin un solo llamador**, y con ella el componente que la invocaba
 * —un `useEffect` con `setTimeout`, borrado el 25/9/2026—.
 *
 * Una acción muerta con la lógica adentro es la que alguien va a "arreglar"
 * algún día creyendo que es la que corre: ya pasó con `cambiar-rol-btn.tsx`,
 * con `unirseACampana` y con los dos formateadores sin zona de `lib/utils.ts`.
 * Este botón la devuelve a la vida y de paso empareja los cuatro paneles.
 */

import { useTransition } from 'react'
import { CheckCheck, Loader2 } from 'lucide-react'
import { marcarNotificacionesLeidas } from '../../perfil/actions'

export function MarcarTodasLeidas() {
  const [pendiente, empezar] = useTransition()

  return (
    <button
      onClick={() => empezar(async () => { await marcarNotificacionesLeidas() })}
      disabled={pendiente}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 active:text-gray-800 transition-colors disabled:opacity-50"
    >
      {pendiente
        ? <Loader2 size={13} className="animate-spin" />
        : <CheckCheck size={13} />}
      Marcar todas
    </button>
  )
}
