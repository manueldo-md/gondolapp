'use client'

/**
 * NotificacionesLista — la bandeja de los cuatro paneles.
 *
 * ── LO QUE VINO A ARREGLAR ──────────────────────────────────────────────────
 * Marca y distri marcaban TODAS como leídas al entrar a la sección, con un
 * `useEffect` y un `setTimeout(2000)`. **Entrar a la bandeja no es leer**: si
 * se marcan solas, quien entró con cinco novedades y miró una pierde el rastro
 * de las otras cuatro, y no tiene forma de recuperarlo.
 *
 * El lado del gondolero ya se había arreglado así —marcar por clic, con update
 * optimista— y este componente es ESE, generalizado, no una segunda versión.
 *
 * ── LA DIFERENCIA QUE NO ERA OBVIA ──────────────────────────────────────────
 * Las notificaciones de empresa tienen `link_destino` y sus filas iban
 * envueltas en un `<Link>`: ahí el clic **navega**. Las del gondolero no, y su
 * fila era un `<button>`.
 *
 * O sea que "marcar por clic" no significa lo mismo en los dos lados, y por eso
 * el componente rinde un `<Link>` o un `<button>` según haya `href`. En el caso
 * con link se marca **y** se navega: son la misma intención del usuario, no dos.
 *
 * ── EL OPTIMISTA NO SE REVIERTE, A PROPÓSITO ────────────────────────────────
 * Si el server action falla, el punto ya se apagó en pantalla y así queda. La
 * próxima carga muestra el estado real. Revertirlo haría parpadear un aviso que
 * la persona ya leyó, para informarle de un problema sobre el que no puede
 * hacer nada — y con un link de por medio, probablemente ya navegó.
 */

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { tiempoRelativo } from '@/lib/utils'

export type ItemNotificacion = {
  id: string
  titulo: string
  mensaje: string | null
  leida: boolean
  created_at: string
  /** Si viene, la fila navega al tocarla además de marcarse. */
  href?: string | null
  /** El ícono ya resuelto por la página: cada panel tiene su mapa por tipo. */
  icono?: ReactNode
}

/**
 * Los temas son clases literales y no interpoladas: Tailwind purga lo que no
 * encuentra escrito, así que `bg-${color}-50` se queda sin CSS en producción y
 * el fondo desaparece. Es la única razón por la que esto es una tabla y no una
 * plantilla.
 */
const TEMAS = {
  gondolero: {
    fila:    'bg-red-50 border-l-2 border-red-400 active:bg-red-100',
    titulo:  'text-red-800',
    mensaje: 'text-red-700',
    punto:   'bg-red-500',
  },
  distri: {
    fila:    'bg-amber-50 border-l-4 border-gondo-amber-400',
    titulo:  'text-amber-900',
    mensaje: 'text-amber-700',
    punto:   'bg-gondo-amber-400',
  },
  marca: {
    fila:    'bg-gondo-indigo-50 border-l-4 border-gondo-indigo-400',
    titulo:  'text-gondo-indigo-900',
    mensaje: 'text-gondo-indigo-700',
    punto:   'bg-gondo-indigo-500',
  },
} as const

export function NotificacionesLista({
  items,
  marcarLeida,
  tema,
}: {
  items: ItemNotificacion[]
  /** Server action del panel. Cada uno acota por su propio dueño. */
  marcarLeida: (id: string) => Promise<unknown>
  tema: keyof typeof TEMAS
}) {
  const t = TEMAS[tema]
  const [leidasLocal, setLeidasLocal] = useState<Set<string>>(
    new Set(items.filter(n => n.leida).map(n => n.id))
  )

  function tocar(id: string) {
    if (leidasLocal.has(id)) return
    setLeidasLocal(prev => new Set(prev).add(id))
    // Best-effort: ver el encabezado sobre por qué no se revierte.
    void marcarLeida(id).catch(() => {})
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map(n => {
        const esLeida = leidasLocal.has(n.id)
        const fila = (
          <div className={`flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4 transition-colors ${
            !esLeida ? t.fila : 'bg-white'
          }`}>
            <div className="shrink-0 mt-1">
              {n.icono ?? (
                !esLeida
                  ? <span className="relative flex h-2.5 w-2.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${t.punto}`} />
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${t.punto}`} />
                    </span>
                  : <span className="inline-flex rounded-full h-2 w-2 bg-gray-300" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold leading-tight ${!esLeida ? t.titulo : 'text-gray-700'}`}>
                {n.titulo}
              </p>
              {n.mensaje && (
                <p className={`text-xs mt-0.5 ${!esLeida ? t.mensaje : 'text-gray-400'}`}>
                  {n.mensaje}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">{tiempoRelativo(n.created_at)}</p>
            </div>

            {n.icono && !esLeida && (
              <span className={`shrink-0 w-2 h-2 rounded-full mt-1.5 ${t.punto}`} />
            )}
          </div>
        )

        return n.href ? (
          <Link key={n.id} href={n.href} onClick={() => tocar(n.id)}
            className="block hover:bg-gray-50 transition-colors">
            {fila}
          </Link>
        ) : (
          <button key={n.id} onClick={() => tocar(n.id)} className="w-full text-left">
            {fila}
          </button>
        )
      })}
    </div>
  )
}
