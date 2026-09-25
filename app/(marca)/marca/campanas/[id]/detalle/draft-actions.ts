'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { CampoBloque } from '@/components/shared/campos-bloque-builder'
import { filaBloqueCampo } from '@/lib/campana-altas'
import { crearNotificacionAdmin } from '@/lib/notificaciones'
import { marcaDeLaSesion } from '@/lib/actor-sesion'
import { exigirPertenencia } from '@/lib/pertenencia'
import { redirect } from 'next/navigation'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}


/**
 * ══════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NO TENÍA UN SOLO `getUser()`
 *
 * Relevado el 25/9/2026: las cuatro actions recibían un `campanaId` del
 * cliente y escribían sobre `campanas` **sin pedir sesión — ni autenticación,
 * ni pertenencia**. Bastaba con postear. Su gemelo de distribuidora estaba
 * igual.
 *
 * Y no es una fila: `republicarCampanaMarca` limpia el draft, puede subir el
 * bounty, inserta localidades y **crea bloques y campos nuevos**. Medido el
 * mismo día: 22 campañas activas en dev y 7 en producción, con 24 bloques, 47
 * campos y **237 misiones vivas** colgando en dev (138 en prod). Cambiarle los
 * bloques a una campaña activa le cambia el formulario al gondolero que la
 * está por completar, en el comercio.
 *
 * Ahora cada una deriva la marca de la SESIÓN y exige que la campaña sea suya,
 * con `exigirPertenencia` — el patrón de las actions de reinicio, extraído a
 * lib/pertenencia.ts.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** La campaña, si es de la marca de la sesión. Si no, tira. */
async function exigirCampanaDeLaMarca(campanaId: string, desde: string, columnas: string[] = []) {
  const db = admin()
  const marcaId = await marcaDeLaSesion(db)
  if (!marcaId) redirect('/auth')
  const fila = await exigirPertenencia({
    admin: db, tabla: 'campanas', id: campanaId,
    columna: 'marca_id', valor: marcaId, columnas, desde,
  })
  return { db, fila }
}

export interface DraftData {
  instruccion: string
  puntos: number
  nuevasZonas: { id: string; nombre: string }[]
  nuevosBloques: { instruccion: string; campos: CampoBloque[] }[]
}

export async function guardarBorradorMarca(campanaId: string, data: DraftData) {
  const { db } = await exigirCampanaDeLaMarca(campanaId, 'marca/draft:guardarBorradorMarca')
  await db.from('campanas').update({
    draft_descripcion: data.instruccion,
    draft_bounty: data.puntos,
    draft_zonas: data.nuevasZonas,
    draft_bloques: data.nuevosBloques,
    tiene_draft: true,
  }).eq('id', campanaId)
  revalidatePath(`/marca/campanas/${campanaId}/detalle`)
}

export async function republicarCampanaMarca(campanaId: string): Promise<{ error?: string }> {
  const { fila } = await exigirCampanaDeLaMarca(campanaId, 'marca/draft:republicarCampanaMarca',
    ['puntos_por_mision', 'puntos_por_foto', 'draft_descripcion', 'draft_bounty', 'draft_zonas', 'draft_bloques'])
  if (!fila) return { error: 'Campaña no encontrada' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = fila as any

  // Validate: bounty can only increase
  // Usar puntos_por_mision si existe, fallback a puntos_por_foto para campañas legacy
  const puntosActuales = c.puntos_por_mision > 0 ? c.puntos_por_mision : c.puntos_por_foto
  console.log('[draft] puntosActuales:', puntosActuales,
    'draft_bounty:', c.draft_bounty,
    'puntos_por_mision:', c.puntos_por_mision,
    'puntos_por_foto:', c.puntos_por_foto)
  if (c.draft_bounty !== null && c.draft_bounty < puntosActuales) {
    return { error: 'No podés reducir el bounty por misión' }
  }

  // Build updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    tiene_draft: false,
    draft_descripcion: null,
    draft_zonas: null,
    draft_bounty: null,
    draft_bloques: null,
  }
  if (c.draft_descripcion !== null) updates.instruccion = c.draft_descripcion
  if (c.draft_bounty !== null && c.draft_bounty !== puntosActuales) {
    updates.puntos_por_mision = c.draft_bounty
  }

  await admin().from('campanas').update(updates).eq('id', campanaId)

  // Insert new zones into campana_localidades (nuevo sistema geográfico)
  if (Array.isArray(c.draft_zonas) && c.draft_zonas.length > 0) {
    const { data: existing } = await admin().from('campana_localidades').select('localidad_id').eq('campana_id', campanaId)
    const existingIds = new Set((existing ?? []).map((z: { localidad_id: number }) => String(z.localidad_id)))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toInsert = (c.draft_zonas as any[]).filter((z: any) => !existingIds.has(String(z.id)))
    if (toInsert.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin().from('campana_localidades').insert(toInsert.map((z: any) => ({ campana_id: campanaId, localidad_id: Number(z.id) })))
    }
  }

  // Insert new bloques with fields
  if (Array.isArray(c.draft_bloques) && c.draft_bloques.length > 0) {
    const { data: existingBloques } = await admin()
      .from('bloques_foto').select('orden').eq('campana_id', campanaId)
      .order('orden', { ascending: false }).limit(1)
    const maxOrden = (existingBloques?.[0] as { orden: number } | undefined)?.orden ?? 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const [i, b] of (c.draft_bloques as any[]).entries()) {
      const { data: bloque } = await admin().from('bloques_foto').insert({
        campana_id: campanaId,
        instruccion: b.instruccion,
        orden: maxOrden + i + 1,
      }).select('id').single()

      if (bloque?.id && Array.isArray(b.campos) && b.campos.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin().from('bloque_campos').insert(b.campos.map((campo: CampoBloque, j: number) => filaBloqueCampo(campo, bloque.id, j + 1)))
      }
    }
  }

  revalidatePath(`/marca/campanas/${campanaId}/detalle`)
  return {}
}

export async function reenviarParaRevision(campanaId: string): Promise<{ error?: string }> {
  const { fila } = await exigirCampanaDeLaMarca(campanaId, 'marca/draft:reenviarParaRevision', ['nombre', 'estado'])
  if (!fila) return { error: 'Campaña no encontrada' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = fila as any
  if (c.estado !== 'pendiente_cambios' && c.estado !== 'borrador') {
    return { error: 'La campaña no puede ser reenviada en su estado actual' }
  }

  await admin()
    .from('campanas')
    .update({ estado: 'pendiente_aprobacion', motivo_rechazo: null })
    .eq('id', campanaId)

  crearNotificacionAdmin({
    tipo:        'admin_campana_pendiente',
    titulo:      'Campaña reenviada para revisión',
    mensaje:     `"${c.nombre}" fue corregida y está pendiente de aprobación.`,
    campanaId:   campanaId,
    linkDestino: `/admin/campanas`,
  }).catch(() => { /* no bloquear el flujo */ })

  revalidatePath(`/marca/campanas/${campanaId}/detalle`)
  return {}
}

export async function descartarCambiosMarca(campanaId: string) {
  const { db } = await exigirCampanaDeLaMarca(campanaId, 'marca/draft:descartarCambiosMarca')
  await db.from('campanas').update({
    tiene_draft: false,
    draft_descripcion: null,
    draft_zonas: null,
    draft_bounty: null,
    draft_bloques: null,
  }).eq('id', campanaId)
  revalidatePath(`/marca/campanas/${campanaId}/detalle`)
}
