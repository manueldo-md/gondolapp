'use client'

/**
 * MisionesPendientes
 *
 * Widget que aparece arriba de la lista de campañas cuando hay misiones
 * guardadas offline en IDB. Muestra el estado de cada una y ofrece las acciones
 * que correspondan.
 *
 * ── REINTENTAR ESTÁ SIEMPRE, SALVO QUE NO PUEDA TERMINAR DISTINTO ───────────
 * Hasta el 24/9/2026 el botón vivía adentro de la rama 'rechazada', así que en
 * 'esperando' y 'sin_señal' no había ninguno: el gondolero leía que se enviaría
 * solo y no tenía nada que tocar. Y ésos son justo los estados donde reintentar
 * más puede terminar distinto, porque lo único que falta es señal.
 *
 * La excepción es el rechazo DEFINITIVO. Con una campaña vencida o un comercio
 * que otro ya tomó, el botón vuelve a subir todas las fotos para recibir el
 * mismo rechazo: un bucle con el trabajo del gondolero adentro. Quién es
 * definitivo lo dice `rechazoEsDefinitivo` a partir del código que manda el
 * servidor, NO del texto del motivo — ver lib/rechazo-mision.ts.
 *
 * ── DESCARTAR NO ────────────────────────────────────────────────────────────
 * Solo con rechazo del servidor. Una misión que espera señal se va a enviar
 * sola en cuanto la haya; poner un tacho al lado sería dejar a un click la
 * destrucción de trabajo que no tiene ningún problema.
 *
 * Estados por misión:
 *   - 'esperando'  → en IDB, sin error, no se está enviando ahora
 *   - 'enviando'   → en misionesEnviando (transitorio, en vuelo)
 *   - 'sin_señal'  → ultimoError en IDB + err de red: reintentos automáticos en curso o agotados
 *   - 'rechazada'  → estado='rechazada' en IDB: el servidor rechazó la misión (rojo)
 *
 * Se actualiza sin recarga escuchando el evento 'gondolapp:cola-update'
 * disparado por ColaSyncOffline al cambiar el estado de la cola.
 */

import { useEffect, useState } from 'react'
import { WifiOff, Loader2, AlertTriangle, AlertCircle, Clock, RefreshCw, Trash2 } from 'lucide-react'
import {
  listarMisionesPendientes,
  actualizarMisionEnCola,
  misionesEnviando,
  type MisionPendienteIDB,
} from '@/lib/mision-queue'
import { descartarMision } from '@/lib/descarte-cola'
import { rechazoEsDefinitivo } from '@/lib/rechazo-mision'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Timestamp de captura: mínimo timestampDispositivo entre bloques (= cuando
 * se sacó la primera foto). Cae a guardadaAt si no hay bloques con timestamp.
 */
function calcularTimestampCaptura(mision: MisionPendienteIDB): number {
  const ts = mision.bloquesCompletados
    .map(b => new Date(b.timestampDispositivo).getTime())
    .filter(t => Number.isFinite(t) && t > 0)
  return ts.length > 0 ? Math.min(...ts) : mision.guardadaAt
}

function formatearFecha(ts: number): string {
  const diffMs = Date.now() - ts
  const mins  = Math.floor(diffMs / 60_000)
  const horas = Math.floor(diffMs / 3_600_000)
  const dias  = Math.floor(diffMs / 86_400_000)
  if (mins  <  1) return 'hace un momento'
  if (mins  < 60) return `hace ${mins} min`
  if (horas < 24) return `hace ${horas}h`
  if (dias  === 1) return 'ayer'
  return `hace ${dias} días`
}

type EstadoUI = 'esperando' | 'enviando' | 'sin_señal' | 'rechazada'

function getEstadoUI(mision: MisionPendienteIDB): EstadoUI {
  if (misionesEnviando.has(mision.idempotenciaKey)) return 'enviando'
  if (mision.estado === 'rechazada')                return 'rechazada'
  if (mision.ultimoError)                           return 'sin_señal'
  return 'esperando'
}

// ── Componente ────────────────────────────────────────────────────────────────

export function MisionesPendientes() {
  const [pendientes, setPendientes]   = useState<MisionPendienteIDB[]>([])
  // IDs de misiones con acción en curso (Reintentar / Descartar)
  const [accionando, setAccionando]   = useState<Set<string>>(new Set())

  async function actualizar() {
    try {
      const lista = await listarMisionesPendientes()
      setPendientes(lista)
    } catch {
      // idb-keyval no disponible (SSR accidental u otro entorno) — ignorar
    }
  }

  useEffect(() => {
    // Leer IDB al montar: cubre el caso "gondolero navega a campañas
    // con misiones ya guardadas offline".
    actualizar()

    // Evento de la cola: se dispara desde cola-sync-offline (al enviar)
    // y desde captura (al guardar en IDB). Actualiza sin recarga.
    window.addEventListener('gondolapp:cola-update', actualizar)

    // Releer cuando la pestaña vuelve al frente: cubre el caso donde
    // Next.js reutiliza el árbol de componentes desde el router cache
    // sin remontar (useEffect con [] no vuelve a correr en ese caso).
    window.addEventListener('focus', actualizar)
    document.addEventListener('visibilitychange', actualizar)

    return () => {
      window.removeEventListener('gondolapp:cola-update', actualizar)
      window.removeEventListener('focus', actualizar)
      document.removeEventListener('visibilitychange', actualizar)
    }
  }, [])

  /**
   * Reintentar: limpia el error en IDB y dispara 'gondolapp:trigger-cola'
   * para que ColaSyncOffline intente enviar de inmediato.
   */
  async function handleReintentar(mision: MisionPendienteIDB) {
    setAccionando(prev => new Set(prev).add(mision.idempotenciaKey))
    try {
      await actualizarMisionEnCola(mision.idempotenciaKey, {
        ultimoError: null,
        estado: 'pendiente',
        motivoRechazo: null,
      })
      await actualizar()
      window.dispatchEvent(new CustomEvent('gondolapp:trigger-cola'))
    } catch {
      // best-effort
    } finally {
      setAccionando(prev => {
        const next = new Set(prev)
        next.delete(mision.idempotenciaKey)
        return next
      })
    }
  }

  /**
   * Descartar. La regla —y sobre todo el rastro que queda si el servidor no
   * contesta— vive en `lib/descarte-cola.ts`, compartida con el TTL. Acá
   * estaba la segunda copia del mismo bloque, y ya se habían separado: el
   * `motivoFallo` por defecto era distinto en cada una.
   */
  async function handleDescartar(mision: MisionPendienteIDB) {
    setAccionando(prev => new Set(prev).add(mision.idempotenciaKey))
    try {
      await descartarMision(mision, 'Descartada manualmente')
      await actualizar()
      window.dispatchEvent(new CustomEvent('gondolapp:cola-update'))
    } finally {
      setAccionando(prev => {
        const next = new Set(prev)
        next.delete(mision.idempotenciaKey)
        return next
      })
    }
  }

  if (pendientes.length === 0) return null

  // Una sola pregunta —¿queda algo que se envíe solo?— la responden el ícono,
  // el texto de la cabecera y el pie. Si se calculara por separado en los tres,
  // el día que cambie el criterio quedarían diciendo cosas distintas.
  const rechazadas = pendientes.filter(m => m.estado === 'rechazada').length
  const enEspera   = pendientes.length - rechazadas
  const hayEnEspera = enEspera > 0

  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`

  const resumenCabecera =
    rechazadas === 0 ? plural(enEspera, 'misión guardada offline', 'misiones guardadas offline')
    : enEspera === 0 ? plural(rechazadas, 'misión rechazada', 'misiones rechazadas')
    : `${enEspera} guardada${enEspera === 1 ? '' : 's'} · ${rechazadas} rechazada${rechazadas === 1 ? '' : 's'}`

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      {/* Cabecera.
          El ícono responde a la MISMA pregunta que el pie: ¿queda algo que se
          vaya a enviar solo? Con mezcla sigue el de sin señal, porque parte del
          módulo sí espera conexión. Solo cuando están TODAS rechazadas cambia:
          ahí el problema no es la señal, es que hay que decidir en cada una, y
          un ícono de "sin conexión" mandaba a esperar algo que no iba a llegar.

          El conteo se desglosa por lo mismo. "3 misiones guardadas offline" con
          las tres rechazadas es cierto de forma literal y engañoso de hecho. */}
      <div className="px-4 py-3 flex items-center gap-2 border-b border-amber-200">
        {hayEnEspera
          ? <WifiOff       size={16} className="text-amber-500 shrink-0" />
          : <AlertTriangle size={16} className="text-red-500 shrink-0" />}
        <p className="text-sm font-semibold text-amber-800">
          {resumenCabecera}
        </p>
      </div>

      {/* Lista */}
      <ul className="divide-y divide-amber-100">
        {pendientes.map(mision => {
          const estado = getEstadoUI(mision)
          const tsCaptura = calcularTimestampCaptura(mision)
          const enAccion = accionando.has(mision.idempotenciaKey)
          const esRechazada = estado === 'rechazada'
          // Definitivo = reintentar no puede terminar distinto nunca. Sale del
          // código que manda el servidor, no del texto del motivo.
          // Ver lib/rechazo-mision.ts.
          const esDefinitivo = esRechazada && rechazoEsDefinitivo(mision.codigoRechazo)

          return (
            <li
              key={mision.idempotenciaKey}
              className={`px-4 py-3 ${esRechazada ? 'bg-red-50' : ''}`}
            >
              {/* Comercio + campaña */}
              <p className={`text-sm font-medium leading-snug ${esRechazada ? 'text-red-900' : 'text-gray-900'}`}>
                {mision.comercioNombre}
              </p>
              <p className={`text-xs mt-0.5 ${esRechazada ? 'text-red-500' : 'text-gray-500'}`}>
                {mision.campanaNombre}
              </p>

              {/* Timestamp de captura */}
              <div className="flex items-center gap-1 mt-1.5">
                <Clock size={11} className="text-gray-400 shrink-0" />
                <p className="text-xs text-gray-400">
                  Capturada {formatearFecha(tsCaptura)}
                </p>
              </div>

              {/* Estado */}
              <div className="mt-2">
                {estado === 'enviando' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600">
                    <Loader2 size={12} className="animate-spin" />
                    Enviando…
                  </span>
                )}
                {estado === 'esperando' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <WifiOff size={12} />
                    Esperando señal
                  </span>
                )}
                {estado === 'sin_señal' && (
                  <div>
                    {/* "se reintentará automáticamente" era verdad siete
                        minutos y mentira después: el backoff son 3 intentos a
                        30s/2min/5min y al agotarse queda esperando un
                        disparador externo. Ahora dice cuáles son, y el botón de
                        abajo está siempre para no depender de ninguno. */}
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600">
                      <AlertTriangle size={12} />
                      Sin señal — se reintenta al recuperar la conexión
                    </span>
                    {mision.ultimoIntentoAt && (
                      <p className="text-xs text-orange-400 mt-0.5 pl-4">
                        Último intento {formatearFecha(mision.ultimoIntentoAt)}
                      </p>
                    )}
                  </div>
                )}
                {estado === 'rechazada' && (
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
                      <AlertCircle size={12} />
                      El servidor rechazó la misión
                    </span>
                    {mision.motivoRechazo && (
                      <p className="text-xs text-red-400 mt-0.5 pl-4 break-words">
                        {mision.motivoRechazo}
                      </p>
                    )}
                    {mision.ultimoIntentoAt && (
                      <p className="text-xs text-red-400 mt-0.5 pl-4">
                        {formatearFecha(mision.ultimoIntentoAt)}
                      </p>
                    )}

                    {/* Con un rechazo definitivo el trabajo no se va a poder
                        cobrar, y decirlo es parte de la respuesta: la única
                        acción que queda borra lo que hizo. Ofrecerle un tacho
                        sin explicar por qué sería peor que el bucle. */}
                    {esDefinitivo && (
                      <p className="text-xs text-red-500 mt-2 pl-4">
                        Esta misión no se va a poder registrar. Descartala para
                        sacarla de la lista — el trabajo no se cobra.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Botones, FUERA de la rama 'rechazada' ─────────────────
                    Reintentar vivía adentro de ese bloque, así que en
                    'esperando' y 'sin_señal' no había ningún botón: el
                    gondolero solo podía leer que se enviaría solo y esperar
                    que un evento llegara. Y el caso en que reintentar más
                    puede terminar distinto es justamente ése.

                    Es además la red de seguridad de todo lo demás: si
                    'visibilitychange' falla en algún teléfono raro, esto
                    sigue estando y no depende de ningún evento. */}
                <div className="flex gap-2 mt-3">
                  {!esDefinitivo && (
                    <button
                      onClick={() => handleReintentar(mision)}
                      // En vuelo no se reintenta: `procesarColaOffline` tiene
                      // su propio guard, pero un botón activo sobre algo que
                      // ya se está enviando invita a apretarlo dos veces.
                      disabled={enAccion || estado === 'enviando'}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                        bg-white border transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${esRechazada
                          ? 'border-red-200 text-red-700 hover:bg-red-50 active:bg-red-100'
                          : 'border-amber-300 text-amber-800 hover:bg-amber-100 active:bg-amber-200'}`}
                    >
                      {enAccion ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RefreshCw size={11} />
                      )}
                      {estado === 'enviando' ? 'Enviando…' : 'Reintentar ahora'}
                    </button>
                  )}

                  {/* Descartar SOLO con rechazo del servidor.
                      Una misión que espera señal se va a enviar sola en cuanto
                      la haya; ofrecer un tacho al lado sería poner a un click
                      de distancia la destrucción de trabajo que no tiene ningún
                      problema. El tacho es la salida de un callejón, no una
                      forma de limpiar la lista. */}
                  {esRechazada && (
                    <button
                      onClick={() => handleDescartar(mision)}
                      disabled={enAccion}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium
                        bg-white border border-red-200 text-red-500
                        hover:bg-red-50 active:bg-red-100
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors"
                    >
                      {enAccion ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Trash2 size={11} />
                      )}
                      Descartar
                    </button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Pie — solo si hay algo que efectivamente se vaya a enviar solo.
          La promesa "se enviará automáticamente" no aplica a una misión
          rechazada: el servidor ya la resolvió y no se reintenta sola. Con
          todas rechazadas, el gondolero leía que se resolvía solo cuando en
          realidad tenía que elegir Reintentar o Descartar en cada una. */}
      {hayEnEspera && (
        <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-700">
            Tu trabajo está guardado. Se envía solo al recuperar señal o al volver
            a abrir la app — o tocá Reintentar ahora.
          </p>
        </div>
      )}
    </div>
  )
}
