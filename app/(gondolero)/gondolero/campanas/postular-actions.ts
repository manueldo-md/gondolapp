'use server'

/**
 * Postularse a una campaña abierta.
 *
 * ── SE PIDE ENTRAR AL EJECUTOR, NO A LA CAMPAÑA ─────────────────────────────
 * La solicitud se guarda contra la repositora o la distribuidora que ejecuta,
 * en las dos tablas que ya existen. Aprobada, el fixer queda vinculado de forma
 * duradera: ve esa campaña y las siguientes del mismo ejecutor.
 *
 * La contra asumida: el ejecutor no puede aceptarlo para una campaña y no para
 * otras. Más adelante puede venir una lista de exclusión al crear la campaña.
 *
 * ── EL PERMISO LO DA `accesoACampana`, NO ESTA FUNCIÓN ──────────────────────
 * Acá no se reescribe ninguna regla de acceso: se llama al mismo `postulable`
 * que decide qué ve la lista. Si esta action tuviera su propio criterio, sería
 * la cuarta copia de lo que ese archivo vino a unificar, y ya sabemos cómo
 * termina — la pantalla ofreciendo un botón que el servidor rechaza, o peor, al
 * revés.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { accesoACampana, type CampanaAcceso } from '@/lib/acceso-campana'
import { contextoAcceso } from '@/lib/utils-distri'
import { estadoPostulacion, textoPostulacion } from '@/lib/postulacion-fixer'
import { crearNotificacionRepositora, crearNotificacionDistri } from '@/lib/notificaciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function postularseACampana(
  campanaId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada.' }

  const admin = adminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana, error: campanaError } = await (admin as any)
    .from('campanas')
    .select('id, nombre, estado, financiada_por, via_ejecucion, distri_id, repositora_id, marca_id, actor_campana, abierta_a_postulaciones')
    .eq('id', campanaId)
    .maybeSingle()

  if (campanaError) {
    console.error('[postularseACampana] no se pudo leer la campaña:', campanaError.message, { campanaId })
    return { error: 'No pudimos cargar la campaña. Probá de nuevo en unos segundos.' }
  }
  if (!campana || campana.estado !== 'activa') {
    return { error: 'La campaña no está disponible.' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (admin as any)
    .from('profiles').select('tipo_actor').eq('id', user.id).maybeSingle()

  const acceso = accesoACampana(
    campana as CampanaAcceso,
    await contextoAcceso({ actorId: user.id, tipoActor: perfil?.tipo_actor, admin }),
  )

  // Ya tiene acceso: no hay nada que pedir. No es un error del que se postula —
  // puede haber apretado el botón con la pantalla vieja, después de que el
  // ejecutor lo aprobara por otro camino.
  if (acceso.ok) return { ok: true }
  if (!acceso.postulable) {
    return { error: 'Esta campaña no acepta postulaciones.' }
  }

  const { tipo, id: ejecutorId } = acceso.postulable
  const esRepo  = tipo === 'repositora'
  const tabla   = esRepo ? 'fixer_repo_solicitudes' : 'fixer_distri_solicitudes'
  const columna = esRepo ? 'repositora_id' : 'distri_id'

  // ── La ventana de 30 días ─────────────────────────────────────────────────
  // Se vuelve a mirar acá y no se confía en la pantalla: el botón se dibujó con
  // datos de cuando cargó, y entre eso y el click puede haber pasado un rechazo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: previa } = await (admin as any)
    .from(tabla)
    .select('id, estado, motivo_rechazo, rechazada_at')
    .eq('fixer_id', user.id)
    .eq(columna, ejecutorId)
    .maybeSingle()

  const estado = estadoPostulacion(previa)
  if (estado.estado === 'pendiente') return { ok: true }          // ya la mandó
  if (estado.estado === 'vinculado') return { ok: true }          // ya entró
  if (estado.estado === 'rechazada') return { error: textoPostulacion(estado) + '.' }

  const ahora = new Date().toISOString()
  // El upsert es por el UNIQUE (fixer_id, ejecutor). Y limpia el rechazo viejo:
  // dejarlo haría que `estadoPostulacion` siguiera viendo la marca y la bloqueara
  // a los 30 días de un "no" que ya quedó atrás.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from(tabla)
    .upsert(
      {
        fixer_id:       user.id,
        [columna]:      ejecutorId,
        estado:         'pendiente',
        iniciado_por:   'fixer',
        motivo_rechazo: null,
        rechazada_at:   null,
        updated_at:     ahora,
      },
      { onConflict: `fixer_id,${columna}` },
    )

  if (error) {
    console.error('[postularseACampana] no se pudo guardar:', error.message, { tabla, ejecutorId })
    return { error: 'No pudimos enviar tu postulación. Probá de nuevo.' }
  }

  // El ejecutor se entera. Sin esto la postulación se queda esperando a que
  // alguien entre a mirar la pestaña por casualidad.
  //
  // El nombre del fixer NO va en el aviso: el ejecutor lo ve en la pantalla de
  // solicitudes junto con el resto, y el alias existe justamente para que la
  // identidad no circule de más.
  const notif = {
    tipo:        'postulacion_fixer' as const,
    titulo:      'Un fixer quiere sumarse',
    mensaje:     `Se postuló a "${campana.nombre}". Revisalo en Fixers → Solicitudes.`,
    campanaId:   campanaId,
    linkDestino: esRepo ? '/repositora/fixers?tab=solicitudes' : '/distribuidora/fixers?tab=solicitudes',
  }
  await (esRepo
    ? crearNotificacionRepositora(ejecutorId, notif)
    : crearNotificacionDistri(ejecutorId, notif))

  revalidatePath('/gondolero/campanas')
  return { ok: true }
}
