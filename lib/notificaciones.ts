import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * ── ESTA UNIÓN Y EL CHECK DE LA BASE SON LA MISMA LISTA, ESCRITA DOS VECES ──
 *
 * `notificaciones_tipo_check` en Postgres tiene que aceptar exactamente esto.
 * Si se agrega un tipo acá y no allá, el insert **rebota y no se nota**: los
 * inserts de notificación no pueden hacer fallar la acción que los dispara, así
 * que un fallo suyo es siempre silencioso por diseño.
 *
 * No es hipotético. Hasta el 24/9/2026 el CHECK rechazaba CUATRO tipos que el
 * código escribía —`vinculacion_invitacion` entre ellos— y **ningún gondolero ni
 * fixer recibió nunca el aviso de que lo habían invitado**. Cero filas de ese
 * tipo en la base, con vínculos aprobados existiendo.
 *
 * `scripts/probar-notificaciones.mjs` compara esta unión contra el CHECK de la
 * base viva y se pone rojo si se separan. Es la única defensa que hay.
 */
export type TipoNotificacion =
  // Gondolero / fixer
  | 'foto_aprobada' | 'foto_rechazada' | 'nivel_subido'
  | 'mision_aprobada' | 'puntos_acreditados' | 'nueva_campana_disponible' | 'comercio_validado'
  | 'solicitud_aprobada' | 'solicitud_rechazada' | 'desvinculacion_distri'
  | 'desvinculacion_repositora'
  // Vinculación (los cuatro que el CHECK rechazaba hasta el 24/9/2026)
  | 'vinculacion_invitacion' | 'vinculacion_invitacion_enviada' | 'vinculacion_nueva'
  // Postulación de fixers a campañas
  | 'postulacion_fixer'
  // Marca
  | 'campana_aprobada' | 'campana_rechazada' | 'nueva_mision_recibida'
  | 'campana_por_vencer' | 'nueva_distribuidora_vinculada' | 'distribuidora_termino_relacion'
  // Distribuidora
  | 'campana_marca_pendiente' | 'gondolero_solicitud_vinculacion' | 'gondolero_completo_mision'
  | 'comercio_pendiente_validacion' | 'marca_solicitud_reinicio_relacion' | 'campana_por_vencer_distri'
  // Admin
  | 'admin_campana_pendiente' | 'admin_comercio_pendiente' | 'admin_error_reportado'
  | 'campana_cerrada_por_tope'
  // Corrección de ubicación de comercios
  | 'comercio_ubicacion_reportada' | 'comercio_rechazado'
  // Cambios solicitados
  | 'cambios_solicitados'

interface NotifBase {
  tipo: TipoNotificacion
  titulo: string
  mensaje?: string
  campanaId?: string
  linkDestino?: string
}

/**
 * Para un gondolero o un fixer. `notificaciones.gondolero_id` guarda a los dos
 * —la columna se llama así desde antes de que existieran los fixers— y lo que
 * los distingue es `actor_tipo`.
 *
 * ── POR QUÉ IMPORTA PASAR EL TIPO BIEN ──────────────────────────────────────
 * `actor_tipo` tiene su propio CHECK, y hasta el 24/9/2026 **no aceptaba
 * `'fixer'`**. Tres escrituras lo usaban igual —las de aprobar, rechazar y
 * desvincular a un fixer— así que rebotaban enteras aunque el `tipo` fuera
 * válido. Un fixer aprobado nunca se enteró de que lo habían aprobado.
 */
export async function crearNotificacionActor(
  actorId: string,
  esFixer: boolean,
  notif: NotifBase,
): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    gondolero_id: actorId,
    actor_id:     actorId,
    actor_tipo:   esFixer ? 'fixer' : 'gondolero',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) {
    console.error('[notificaciones] crearNotificacionActor error:', error.message,
      { actorId, esFixer, tipo: notif.tipo })
  }
  return { error: error?.message ?? null }
}

/** Para una repositora (por `actor_id = repositora_id`). */
export async function crearNotificacionRepositora(
  repositoraId: string,
  notif: NotifBase,
): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    actor_id:     repositoraId,
    actor_tipo:   'repositora',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) {
    console.error('[notificaciones] crearNotificacionRepositora error:', error.message,
      { repositoraId, tipo: notif.tipo })
  }
  return { error: error?.message ?? null }
}

// Para gondolero (backward compat)
export async function crearNotificacionGondolero(
  gondoleroId: string,
  notif: NotifBase
): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    gondolero_id: gondoleroId,
    actor_id:     gondoleroId,
    actor_tipo:   'gondolero',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) console.error('[notificaciones] crearNotificacionGondolero error:', error.message, { gondoleroId, tipo: notif.tipo })
  return { error: error?.message ?? null }
}

// Para marca (por actor_id = marca_id)
export async function crearNotificacionMarca(
  marcaId: string,
  notif: NotifBase
): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    actor_id:     marcaId,
    actor_tipo:   'marca',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) console.error('[notificaciones] crearNotificacionMarca error:', error.message, { marcaId, tipo: notif.tipo })
  return { error: error?.message ?? null }
}

// Para distribuidora (por actor_id = distri_id)
export async function crearNotificacionDistri(
  distriId: string,
  notif: NotifBase
): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    actor_id:     distriId,
    actor_tipo:   'distribuidora',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) console.error('[notificaciones] crearNotificacionDistri error:', error.message, { distriId, tipo: notif.tipo })
  return { error: error?.message ?? null }
}

// Para admin (broadcast — actor_tipo = 'admin', actor_id = null)
export async function crearNotificacionAdmin(notif: NotifBase): Promise<{ error: string | null }> {
  const db = adminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from('notificaciones').insert({
    actor_tipo:   'admin',
    tipo:         notif.tipo,
    titulo:       notif.titulo,
    mensaje:      notif.mensaje ?? null,
    campana_id:   notif.campanaId ?? null,
    link_destino: notif.linkDestino ?? null,
  })
  if (error) console.error('[notificaciones] crearNotificacionAdmin error:', error.message, { tipo: notif.tipo })
  return { error: error?.message ?? null }
}

// Agrupación: verificar si ya existe notificación del mismo tipo+campaña en la última hora
// Evita spam cuando se envían muchas misiones en poco tiempo
export async function existeNotifReciente(
  actorId: string,
  actorTipo: string,
  tipo: TipoNotificacion,
  campanaId: string
): Promise<boolean> {
  const db = adminClient()
  const hace15min = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('actor_id', actorId)
    .eq('actor_tipo', actorTipo)
    .eq('tipo', tipo)
    .eq('campana_id', campanaId)
    .gte('created_at', hace15min)

  return (count ?? 0) > 0
}
