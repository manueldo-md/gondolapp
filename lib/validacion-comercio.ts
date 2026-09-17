/**
 * lib/validacion-comercio.ts
 * Validar o rechazar el alta de un comercio. UNA regla, dos llamadores.
 *
 * ── QUÉ ESTABA ROTO ─────────────────────────────────────────────────────────
 * Una campaña `tipo='comercios'` NUNCA creó la misión del alta. No era un error
 * tragado: no había escritura. `crearComercioNuevo` insertaba el comercio y, si
 * había foto, una fila en `fotos` — y nada más. Como `min_comercios_para_cobrar`
 * cuenta comercios distintos con misión APROBADA, el contador del gondolero no
 * podía subir nunca: veía "1 de 3" para siempre, hiciera 3 altas o 300.
 *
 * Y la foto de fachada, al no tener `mision_id`, caía en la rama legacy de
 * `aprobarFoto`, que acredita al instante **salteándose el mínimo**. O sea que
 * el alta con foto cobraba por un camino que no debía existir y el alta sin foto
 * no cobraba por ninguno.
 *
 * ── DÓNDE SE CREA LA MISIÓN, Y POR QUÉ ACÁ ──────────────────────────────────
 * Al VALIDAR el comercio, no al darlo de alta. Un comercio sin validar puede ser
 * un duplicado, estar mal cargado o no existir: crear la misión en el alta
 * sería prometer un pago sobre trabajo que todavía nadie miró, que es
 * exactamente lo que este proyecto viene sacando de todos lados.
 *
 * Creada la misión, se aprueba por `aprobarMisionCore` — el mismo camino que
 * toda otra misión. Eso no es una preferencia de estilo: es lo que hace que el
 * bounty se libere con la misma regla, que el mínimo cuente igual y que la
 * barrida de liberación sea la misma. Una segunda contabilidad para esta
 * campaña habría sido otra regla duplicada que se desincroniza sola.
 *
 * ── LAS DOS COLUMNAS ────────────────────────────────────────────────────────
 * `comercios` tiene `validado` (boolean) Y `estado` (text) para lo mismo. Las
 * colas de pendientes filtran por `estado`, las listas y los tableros por
 * `validado`. Hasta el 17/9/2026 había CUATRO acciones que "validaban" y dos
 * escribían solo `validado`: dejaban el comercio aprobado en una pantalla y
 * pendiente en la otra, sin pagar nada. Las dos muertas se sacaron; este archivo
 * es el único lugar que las escribe, y las escribe SIEMPRE juntas.
 * `validado` se borra en el tramo de columnas muertas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { aprobarMisionCore } from '@/lib/misiones'
import { crearNotificacionGondolero } from '@/lib/notificaciones'
import {
  sincronizarComerciosRelevados,
  sincronizarComerciosCompletados,
} from '@/lib/comercios-relevados'
import { QUE_HACER_TRAS_RECHAZO } from '@/lib/motivos-rechazo-comercio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export interface ResultadoValidacion {
  ok: boolean
  /** Mensaje para la UI cuando ok === false. */
  error?: string
  /** Misión creada por esta validación. null si el comercio no venía de una campaña de altas. */
  misionId?: string | null
  /** Puntos que quedaron a nombre de la misión (retenidos o acreditados según el mínimo). */
  puntos?: number
}

/**
 * Los puntos que vale un alta.
 *
 * Mismo fallback que `aprobarFoto`: `puntos_por_mision` manda y
 * `puntos_por_foto` es el resto de las campañas viejas. Las dos actions de
 * validación leían SOLO `puntos_por_foto`, y la campaña de prod lo tiene en 0
 * con `puntos_por_mision` en 200 — así que aunque la misión hubiera existido,
 * ese camino habría pagado cero.
 */
export function puntosDeLaCampana(campana: {
  puntos_por_mision?: number | null
  puntos_por_foto?: number | null
}): number {
  const porMision = campana.puntos_por_mision ?? 0
  if (porMision > 0) return porMision
  return campana.puntos_por_foto ?? 0
}

/**
 * Una foto de fachada NO se paga sola.
 *
 * La rama legacy de `aprobarFoto` acredita cualquier foto sin `mision_id`. La
 * fachada de un alta no tiene misión hasta que alguien valida el comercio, así
 * que caía justo ahí y cobraba fuera del sistema de bounty: sin mínimo, sin
 * retención y sin quedar registrada en la misión. Los tres paneles de revisión
 * consultan esto antes de acreditar.
 */
export function fotoPagaAlAprobar(params: {
  tipoCampana: string | null | undefined
  misionId: string | null | undefined
}): boolean {
  if (params.misionId) return false          // la paga la misión, no la foto
  return params.tipoCampana !== 'comercios'  // la paga la validación del comercio
}

// ── Validar ───────────────────────────────────────────────────────────────────

/**
 * Aprueba el alta: activa el comercio, crea su misión y la manda por el camino
 * normal de aprobación.
 *
 * Es idempotente en la parte que importa: si el comercio ya tiene una misión
 * viva en esa campaña no crea otra. Sin esa guarda, dos clicks —o el admin y la
 * distribuidora aprobando el mismo comercio— pagarían dos veces. El índice
 * `misiones_campana_comercio_uniq` cubre la campaña puntual, pero depende de un
 * flag denormalizado y no es lugar para enterarse.
 */
export async function validarComercioYCrearMision(
  comercioId: string,
  admin: Admin,
): Promise<ResultadoValidacion> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const { data: comercio, error: errCom } = await db
    .from('comercios')
    .select('id, nombre, estado, campana_id, registrado_por')
    .eq('id', comercioId)
    .maybeSingle()

  if (errCom)   return { ok: false, error: 'No se pudo leer el comercio: ' + errCom.message }
  if (!comercio) return { ok: false, error: 'Comercio no encontrado.' }

  // Las dos columnas, siempre juntas. Ver el encabezado.
  const { error: errUpd } = await db
    .from('comercios')
    .update({ estado: 'activo', validado: true, motivo_rechazo: null })
    .eq('id', comercioId)

  if (errUpd) return { ok: false, error: 'No se pudo aprobar el comercio: ' + errUpd.message }

  // Un comercio cargado fuera de una campaña de altas —desde la captura normal,
  // o por un admin— se valida y ahí termina. No hay alta que pagar.
  if (!comercio.campana_id || !comercio.registrado_por) {
    return { ok: true, misionId: null, puntos: 0 }
  }

  const { data: campana, error: errCamp } = await db
    .from('campanas')
    .select('id, nombre, tipo, puntos_por_mision, puntos_por_foto, min_comercios_para_cobrar')
    .eq('id', comercio.campana_id)
    .maybeSingle()

  // El comercio ya quedó activo: que falle la parte del pago no debe deshacerlo.
  // Se avisa y se corta, sin revertir la validación.
  if (errCamp || !campana) {
    console.error('[validarComercio] no se pudo leer la campaña del alta:', {
      comercioId, campanaId: comercio.campana_id, error: errCamp?.message,
    })
    return { ok: true, misionId: null, puntos: 0 }
  }

  if (campana.tipo !== 'comercios') {
    // `comercios.campana_id` solo lo escribe el alta de una campaña de altas,
    // pero si algún día lo escribe otro flujo, acá no se inventa una misión.
    return { ok: true, misionId: null, puntos: 0 }
  }

  const gondoleroId: string   = comercio.registrado_por
  const minParaCobrar: number = campana.min_comercios_para_cobrar ?? 1
  const puntos                = puntosDeLaCampana(campana)

  // ── Guarda de idempotencia ────────────────────────────────────────────────
  const { data: existentes, error: errMis } = await db
    .from('misiones')
    .select('id, estado')
    .eq('campana_id', campana.id)
    .eq('comercio_id', comercioId)

  if (errMis) {
    console.error('[validarComercio] no se pudo chequear misiones previas:', errMis.message)
    return { ok: true, misionId: null, puntos: 0 }
  }

  // `!==` de JS y no `.neq()` de PostgREST: `misiones.estado` es nullable y la
  // lógica de tres valores dejaría afuera las filas con NULL, que sí son misiones
  // vivas. Mismo criterio que obtenerEstadoComercios y comercios-relevados.
  const viva = ((existentes ?? []) as { id: string; estado: string | null }[])
    .find(m => m.estado !== 'descartada')

  let misionId: string
  if (viva) {
    misionId = viva.id
    if (viva.estado === 'aprobada') {
      // Ya estaba todo hecho. Revalidar no vuelve a pagar.
      return { ok: true, misionId, puntos }
    }
  } else {
    const { data: nueva, error: errCrear } = await db
      .from('misiones')
      .insert({
        campana_id:    campana.id,
        comercio_id:   comercioId,
        gondolero_id:  gondoleroId,
        estado:        'pendiente',
        puntos_total:  puntos,
        bounty_estado: 'retenido',
      })
      .select('id')
      .single()

    if (errCrear || !nueva) {
      // Esto sí se reporta como error: el comercio quedó activo pero el
      // gondolero no tiene con qué cobrar, y alguien tiene que enterarse.
      console.error('[validarComercio] NO SE PUDO CREAR LA MISIÓN del alta:', {
        comercioId, campanaId: campana.id, gondoleroId, error: errCrear?.message,
      })
      return {
        ok: false,
        error: 'El comercio quedó validado pero no se pudo crear la misión del gondolero. ' +
               'Avisá a soporte: el alta no se pagó.',
      }
    }
    misionId = nueva.id
  }

  // ── La foto de fachada pasa a ser la foto de la misión ────────────────────
  // Deja de ser una unidad de pago suelta: su bounty queda saldado acá y el de
  // la misión es el único que cuenta. Sin esto, la foto se queda en 'retenido'
  // y el barrido de `cerrarCampana` la paga OTRA VEZ al cerrar la campaña.
  const { error: errFoto } = await db
    .from('fotos')
    .update({ mision_id: misionId, estado: 'aprobada', bounty_estado: 'acreditado' })
    .eq('comercio_id', comercioId)
    .eq('campana_id', campana.id)
    .is('mision_id', null)

  if (errFoto) console.error('[validarComercio] no se pudo enganchar la foto a la misión:', errFoto.message)

  // ── El camino normal de aprobación ────────────────────────────────────────
  // Acá se decide si el bounty se libera o sigue retenido, con la misma regla
  // que cualquier otra misión: comercios DISTINTOS aprobados >= mínimo.
  try {
    await aprobarMisionCore({ misionId, gondoleroId, campanaId: campana.id, minParaCobrar, admin })
  } catch (err) {
    console.error('[validarComercio] MISIÓN TRABADA — quedó en pendiente y no se acreditó. ' +
      'Reparar con "Destrabar misiones" en /admin/campanas.', {
      misionId, comercioId, gondoleroId, campanaId: campana.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return {
      ok: false,
      error: 'El comercio quedó validado y la misión creada, pero la acreditación falló. ' +
             'Se puede reparar desde "Destrabar misiones".',
    }
  }

  await sincronizarComerciosCompletados(campana.id, gondoleroId, admin)
  await sincronizarComerciosRelevados(campana.id, admin)

  await crearNotificacionGondolero(gondoleroId, {
    tipo:      'comercio_validado',
    titulo:    'Comercio aprobado ✅',
    mensaje:   `"${comercio.nombre}" quedó validado. Sumaste ${puntos} puntos por el alta.`,
    campanaId: campana.id,
  })

  return { ok: true, misionId, puntos }
}

// ── Rechazar ──────────────────────────────────────────────────────────────────

export async function rechazarComercioConMotivo(
  comercioId: string,
  motivoCrudo: string | undefined,
  admin: Admin,
): Promise<ResultadoValidacion> {
  // Obligatorio, igual que en `rechazarFoto`. Un rechazo sin explicar deja al
  // gondolero sin saber si perdió el trabajo por algo que puede corregir.
  const motivo = motivoCrudo?.trim()
  if (!motivo) return { ok: false, error: 'Falta el motivo del rechazo.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const { data: comercio, error: errCom } = await db
    .from('comercios')
    .select('id, nombre, campana_id, registrado_por')
    .eq('id', comercioId)
    .maybeSingle()

  if (errCom)    return { ok: false, error: 'No se pudo leer el comercio: ' + errCom.message }
  if (!comercio) return { ok: false, error: 'Comercio no encontrado.' }

  const { error } = await db
    .from('comercios')
    .update({ estado: 'rechazado', validado: false, motivo_rechazo: motivo })
    .eq('id', comercioId)

  if (error) return { ok: false, error: 'No se pudo rechazar el comercio: ' + error.message }

  // La foto de fachada pierde sus puntos retenidos.
  const { error: errFotos } = await db
    .from('fotos')
    .update({ bounty_estado: 'anulado', estado: 'rechazada', motivo_rechazo: motivo })
    .eq('comercio_id', comercioId)
    .eq('bounty_estado', 'retenido')

  if (errFotos) console.error('[rechazarComercio] no se pudieron anular las fotos:', errFotos.message)

  // Si el comercio se validó y DESPUÉS se rechazó, la misión ya existe. Tiene
  // que quedar en un estado terminal: una misión 'pendiente' que nadie va a
  // revisar nunca es exactamente el patrón de las misiones trabadas.
  if (comercio.campana_id) {
    const { error: errMis } = await db
      .from('misiones')
      .update({ estado: 'descartada', bounty_estado: 'anulado' })
      .eq('campana_id', comercio.campana_id)
      .eq('comercio_id', comercioId)
      .neq('estado', 'aprobada')

    if (errMis) console.error('[rechazarComercio] no se pudo descartar la misión:', errMis.message)
    await sincronizarComerciosRelevados(comercio.campana_id, admin)
    if (comercio.registrado_por) {
      await sincronizarComerciosCompletados(comercio.campana_id, comercio.registrado_por, admin)
    }
  }

  if (comercio.registrado_por) {
    const queHacer = QUE_HACER_TRAS_RECHAZO[motivo] ?? ''
    await crearNotificacionGondolero(comercio.registrado_por, {
      tipo:      'comercio_rechazado',
      titulo:    'Alta no aprobada ❌',
      mensaje:
        `"${comercio.nombre}" no se pudo dar de alta. Motivo: ${motivo}.` +
        (queHacer ? ` ${queHacer}` : ''),
      campanaId: comercio.campana_id ?? undefined,
    })
  }

  return { ok: true }
}
