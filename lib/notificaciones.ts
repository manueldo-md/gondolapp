import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type TipoNotificacion =
  // Gondolero
  | 'foto_aprobada' | 'foto_rechazada' | 'nivel_subido'
  | 'mision_aprobada' | 'puntos_acreditados' | 'nueva_campana_disponible' | 'comercio_validado'
  // Marca
  | 'campana_aprobada' | 'campana_rechazada' | 'nueva_mision_recibida'
  | 'campana_por_vencer' | 'nueva_distribuidora_vinculada' | 'distribuidora_termino_relacion'
  // Distribuidora
  | 'campana_marca_pendiente' | 'gondolero_solicitud_vinculacion' | 'gondolero_completo_mision'
  | 'comercio_pendiente_validacion' | 'marca_solicitud_reinicio_relacion' | 'campana_por_vencer_distri'
  // Admin
  | 'admin_campana_pendiente' | 'admin_comercio_pendiente' | 'admin_error_reportado'

interface NotifBase {
  tipo: TipoNotificacion
  titulo: string
  mensaje?: string
  campanaId?: string
  linkDestino?: string
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
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (db as any)
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('actor_id', actorId)
    .eq('actor_tipo', actorTipo)
    .eq('tipo', tipo)
    .eq('campana_id', campanaId)
    .gte('created_at', haceUnaHora)

  return (count ?? 0) > 0
}
