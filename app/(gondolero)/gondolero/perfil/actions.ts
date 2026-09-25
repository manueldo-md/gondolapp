'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoPremio } from '@/types'
import { getConfig } from '@/lib/config'
import { nivelMaximoAlcanzado } from '@/lib/nivel-maximo'
import { guardarZonasDelGondolero, type ZonaGondolero } from '@/lib/zonas-gondolero'
import { usuarioDeLaSesion } from '@/lib/actor-sesion'
import { marcarNotificacionLeida } from '@/lib/marcar-notificacion'

const COSTO_CANJE: Record<TipoPremio, number> = {
  credito_celular: 300,
  nafta_ypf:       500,
  giftcard_ml:     1000,
  transferencia:   2000,
}

export async function solicitarCanje(premio: TipoPremio) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const puntos = COSTO_CANJE[premio]

  // Verificar puntos disponibles
  const { data: profile } = await admin
    .from('profiles')
    .select('puntos_disponibles')
    .eq('id', user.id)
    .single()

  if (!profile || profile.puntos_disponibles < puntos) {
    return { error: 'No tenés suficientes puntos para este canje.' }
  }

  // Transferencia solo para nivel Pro.
  //
  // El nivel que habilita es el MÁXIMO alcanzado, no el del mes: un gondolero
  // que llegó a Pro y aflojó no puede quedarse sin poder canjear los puntos que
  // ya ganó. Hasta el 17/9/2026 esto leía `profiles.nivel`, que nunca se
  // escribió desde la app. Ver lib/nivel-maximo.ts.
  if (premio === 'transferencia') {
    const config = await getConfig()
    const nivelMax = await nivelMaximoAlcanzado(user.id, admin, {
      activo: config.niveles.fotosCasualAActivo,
      pro:    config.niveles.fotosActivoAPro,
    })

    // `null` = no se pudo medir. No se le niega el canje por eso: se le pide que
    // reintente, que es lo que realmente pasó.
    if (nivelMax === null) {
      return { error: 'No pudimos verificar tu nivel en este momento. Probá de nuevo en unos segundos.' }
    }
    if (nivelMax !== 'pro') {
      return { error: 'La transferencia bancaria es solo para gondoleros nivel Pro.' }
    }
  }

  // Insertar canje
  const { data: canjeCreado, error: errCanje } = await admin.from('canjes').insert({
    gondolero_id: user.id,
    premio,
    puntos,
    estado: 'pendiente',
  }).select('id').single()

  if (errCanje) return { error: 'No se pudo registrar el canje. Intentá de nuevo.' }

  // Registrar movimiento débito.
  //
  // EL ERROR SE CHEQUEA, y no es opcional. supabase-js no lanza ante un error de
  // Postgres: lo devuelve en `.error`. Hasta el 16/9/2026 este insert no lo
  // miraba, así que si el débito fallaba el canje quedaba registrado y el
  // gondolero conservaba los puntos. Premio gratis, sin ninguna traza.
  //
  // Es el único débito de todo el repo, y por eso es el que se arregló primero:
  // un crédito que falla lo reclama el gondolero y se descubre; un débito que
  // falla no lo reclama nadie.
  const { error: errDebito } = await admin.from('movimientos_puntos').insert({
    gondolero_id: user.id,
    tipo:    'debito',
    monto:   puntos,
    concepto: `Canje solicitado: ${premio.replace(/_/g, ' ')}`,
  })

  if (errDebito) {
    // Se deshace el canje: sin el débito, el premio queda pedido y los puntos
    // sin descontar. El orden es este —canje primero, débito después— para que
    // el caso inverso no ocurra nunca: nadie queda debitado por un premio que no
    // se registró.
    const { error: errRollback } = await admin
      .from('canjes')
      .delete()
      .eq('id', canjeCreado.id)

    if (errRollback) {
      // Doble falla: el canje existe y nadie pagó por él. Es lo único que este
      // camino no puede reparar solo, y por eso grita.
      console.error(
        '[solicitarCanje] CANJE SIN DÉBITO — revisar a mano. ' +
        'El premio quedó pedido y los puntos no se descontaron.',
        {
          canjeId:     canjeCreado.id,
          gondoleroId: user.id,
          premio,
          puntos,
          errorDebito:   errDebito.message,
          errorRollback: errRollback.message,
        }
      )
    }
    return { error: 'No se pudo registrar el canje. Intentá de nuevo.' }
  }

  // El saldo NO se toca acá: lo descuenta el trigger on_movimiento_puntos al
  // insertar el débito de arriba. Hasta el 16/9/2026 esta función hacía además
  // un UPDATE manual con el valor absoluto leído ANTES del insert. No era doble
  // cobro —los dos caían en el mismo número— pero era una lectura perdida:
  //
  //   1000 puntos, canje de 300. Entre la lectura y el update se acredita una
  //   misión de 500. El trigger deja 1200. El update manual escribe 700.
  //   Los 500 acreditados desaparecen.
  //
  // La ventana es corta, pero las aprobaciones se hacen en lote desde el panel,
  // que es exactamente cuando se acredita a varios a la vez.

  revalidatePath('/gondolero/perfil')
  revalidatePath('/gondolero/actividad')
  return { ok: true }
}

export async function actualizarPerfil({ nombre, celular }: { nombre: string; celular?: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('profiles')
    .update({ nombre: nombre.trim(), celular: celular?.trim() || null })
    .eq('id', user.id)

  revalidatePath('/gondolero/perfil')
}

/**
 * Guarda las zonas del gondolero AL NIVEL QUE ELIGIÓ.
 *
 * Antes recibía `localidadIds: number[]` y guardaba la expansión, así que
 * "todas las del departamento" quedaba vieja cuando el padrón crecía. Ahora
 * guarda provincia / departamento / localidad y la expansión se hace al leer.
 * Ver lib/zonas-gondolero.ts.
 */
export async function actualizarZonasGondolero(zonas: ZonaGondolero[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Antes este par delete+insert no chequeaba ningún error: si el insert
  // fallaba, el borrado ya había pasado y el gondolero se quedaba SIN zonas
  // creyendo que las guardó. Ahora lo hace la lib y devuelve el error.
  const r = await guardarZonasDelGondolero(user.id, zonas, admin)
  if (r.error) return r

  revalidatePath('/gondolero/perfil')
  revalidatePath('/gondolero/campanas')
  revalidatePath('/gondolero/actividad')
  return {}
}

/**
 * `gondoleroId` **salió de la firma**, y acá no había ni `getUser()`: sin
 * sesión, cualquiera le marcaba las notificaciones como leídas a cualquiera.
 * Eso no borra nada, pero es la forma más limpia de que alguien no se entere
 * de que le rechazaron una foto o le aprobaron un comercio.
 */
export async function marcarNotificacionesLeidas() {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await admin
    .from('notificaciones')
    .update({ leida: true })
    .eq('gondolero_id', userId)
    .eq('leida', false)

  revalidatePath('/gondolero/perfil')
  revalidatePath('/gondolero/actividad')
}

/**
 * Marca una notificación individual como leída.
 * Verifica que la notificación pertenezca al usuario autenticado.
 */
/**
 * Ésta ya estaba bien resuelta y fue el modelo para las otras dos: acotaba con
 * `.eq('gondolero_id', user.id)`, así que una notificación ajena no matchea y
 * el update no escribe nada.
 *
 * Lo único que cambió el 25/9/2026 es que el predicado se mudó a
 * `lib/marcar-notificacion.ts`, para que marca y distri lo usen en vez de
 * copiarlo con otro `.eq()`. Tres copias del mismo permiso es como empiezan a
 * separarse.
 */
export async function marcarUnaNotificacionLeida(notificacionId: string) {
  const userId = await usuarioDeLaSesion()
  if (!userId) return

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await marcarNotificacionLeida(notificacionId, { tipo: 'persona', userId }, admin)

  revalidatePath('/gondolero/actividad')
  revalidatePath('/gondolero/actividad/notificaciones')
}
