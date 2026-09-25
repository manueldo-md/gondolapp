'use client'

/**
 * "Marcar todas como leídas", como BOTÓN.
 *
 * Hasta el 25/9/2026 este archivo exportaba `MarcarDistriLeidas`, que no
 * renderizaba nada: un `useEffect` con `setTimeout(2000)` que marcaba todas al
 * entrar a la sección.
 *
 * **Entrar a la bandeja no es leer.** Quien entraba con cinco novedades y
 * miraba una perdía el rastro de las otras cuatro, sin forma de recuperarlo —
 * y la distri es justamente la que necesita saber qué no miró.
 *
 * Ahora cada notificación se marca al tocarla (ver
 * `components/shared/notificaciones-lista.tsx`) y esto queda para el que quiera
 * limpiar de una. Es la resolución de lo que estaba anotado como pendiente:
 * *"un botón de marcar todas, pero como acción explícita, no como efecto de
 * entrar"*.
 */

import { useTransition } from 'react'
import { CheckCheck, Loader2 } from 'lucide-react'
import { marcarNotificacionesDistriLeidas } from './actions'

export function MarcarTodasLeidas() {
  const [pendiente, empezar] = useTransition()

  return (
    <button
      onClick={() => empezar(async () => { await marcarNotificacionesDistriLeidas() })}
      disabled={pendiente}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
    >
      {pendiente
        ? <Loader2 size={13} className="animate-spin" />
        : <CheckCheck size={13} />}
      Marcar todas
    </button>
  )
}
