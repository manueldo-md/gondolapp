/**
 * lib/credito-foto.ts — acreditar los puntos de UNA foto, una sola vez.
 *
 * ── LOS DOS PROBLEMAS QUE CIERRA, QUE SON UNO SOLO ──────────────────────────
 *
 * **1. Nada impedía pagar dos veces la misma foto.** Las tres aprobaciones de
 * a una no miraban `estado` antes de escribir, y aunque desde el 25/9/2026 sí
 * lo miran, queda la puerta de al lado: el admin puede mandar una foto de
 * `aprobada` a `rechazada` o a `pendiente` y volver a aprobarla, y
 * `rechazarFotoAdmin` **no revierte el movimiento** — solo pone
 * `puntos_otorgados: 0`, que es un número de pantalla. Un filtro de estado no
 * cierra eso; lo cierra la base.
 *
 * **2. Ninguno de los seis inserts chequeaba el error.** supabase-js devuelve
 * el error de Postgres en `.error` y no lo lanza, así que un crédito que
 * fallaba no dejaba excepción, ni log, ni rastro.
 *
 * Los dos van juntos y no es una preferencia de prolijidad: **con el índice
 * puesto y sin el chequeo, el duplicado deja de pagar dos veces y pasa a no
 * pagar nada, en silencio.** Cambiaríamos un bug mudo por otro, y el segundo es
 * peor porque le saca plata al gondolero en vez de dársela de más.
 *
 * ── LOS SEIS LLAMADORES ─────────────────────────────────────────────────────
 * Eran seis y no tres, que es lo que yo había contado: las tres aprobaciones de
 * a una (admin, distri, marca), las dos masivas (admin, distri) y
 * `liberarBounty` de la validación automática por GPS.
 *
 * ── QUÉ HACE CON CADA ERROR, QUE NO ES LO MISMO ─────────────────────────────
 *
 *   23505 (unique_violation)  → **el índice funcionando**. Esta foto ya se
 *                               pagó. No es un fallo: es exactamente lo que se
 *                               quería que pasara. Se loguea y se sigue.
 *   cualquier otro            → la foto ya quedó aprobada y NADIE cobró. Es el
 *                               caso caro, y se grita con todo lo que hace
 *                               falta para repararlo a mano.
 *
 * **No tira.** En los seis llamadores la foto ya está marcada `'aprobada'`
 * cuando esto corre, y desde el 25/9 el guard de estado impide reaprobarla: si
 * tirara, el revisor reintentaría contra una foto que ya no es elegible y el
 * pago no llegaría nunca. Se registra y se sigue, que es la única respuesta que
 * no empeora el estado.
 *
 * > **Y eso deja una deuda dicha de frente**: para las misiones trabadas existe
 * > el botón "Destrabar misiones" de `/admin/campanas`; **para un crédito por
 * > foto que falla no hay ninguna herramienta de reparación**. Hoy el único
 * > rastro es este log. Lo correcto sería invertir el orden —acreditar ANTES de
 * > marcar la foto, como hace `solicitarCanje` con el canje y el débito— y eso
 * > es un cambio en los seis llamadores, no acá.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export type ResultadoCredito =
  /** Se acreditó. */
  | { estado: 'acreditado' }
  /** Ya estaba pago: el índice único lo rebotó. Es el caso bueno. */
  | { estado: 'ya_pago' }
  /** Falló de verdad. La foto quedó aprobada y nadie cobró. */
  | { estado: 'fallo'; mensaje: string }

/**
 * Acredita los puntos de una foto. Idempotente **por la base**, no por
 * confianza en el llamador.
 */
export async function acreditarPorFoto(params: {
  admin: Admin
  gondoleroId: string
  fotoId: string
  campanaId: string | null
  monto: number
  concepto: string
  /** Para el log: qué panel lo llamó. */
  desde: string
}): Promise<ResultadoCredito> {
  const { admin, gondoleroId, fotoId, campanaId, monto, concepto, desde } = params

  // `movimientos_puntos` tiene CHECK (monto > 0): con 0 el insert falla y el
  // fallo sería indistinguible de uno real.
  if (monto <= 0) return { estado: 'acreditado' }

  const { error } = await admin.from('movimientos_puntos').insert({
    gondolero_id: gondoleroId,
    tipo:         'credito',
    monto:        Math.round(monto),
    concepto,
    campana_id:   campanaId,
    foto_id:      fotoId,
  })

  if (!error) return { estado: 'acreditado' }

  // `code` es el SQLSTATE que PostgREST propaga. 23505 es unique_violation, o
  // sea el índice `movimientos_puntos_credito_unico_por_foto` haciendo su
  // trabajo: esta foto ya tenía su crédito.
  if ((error as { code?: string }).code === '23505') {
    console.warn(
      `[credito-foto] ${desde}: la foto ${fotoId} ya estaba pagada, no se acredita de nuevo. ` +
      `(gondolero ${gondoleroId}, ${monto} pts)`
    )
    return { estado: 'ya_pago' }
  }

  // El caso caro. Va con todo lo que hace falta para repararlo a mano, porque
  // hoy no hay ninguna herramienta que lo repare solo.
  console.error(
    `[credito-foto] ${desde}: LA FOTO QUEDÓ APROBADA Y NADIE COBRÓ — revisar a mano.`,
    { fotoId, gondoleroId, campanaId, monto, concepto, error: error.message, code: (error as { code?: string }).code }
  )
  return { estado: 'fallo', mensaje: error.message }
}
