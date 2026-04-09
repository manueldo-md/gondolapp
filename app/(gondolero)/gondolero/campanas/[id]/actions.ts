'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

const NIVEL_ORDEN: Record<string, number> = { casual: 0, activo: 1, pro: 2 }

export async function unirseACampana(campanaId: string): Promise<{ error: string } | void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verificar campaña activa y validar restricciones
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('id, fecha_limite_inscripcion, tope_total_comercios, comercios_relevados, nivel_minimo, financiada_por, distri_id, marca_id, actor_campana')
    .eq('id', campanaId)
    .eq('estado', 'activa')
    .single() as {
      data: {
        id: string
        fecha_limite_inscripcion: string | null
        tope_total_comercios: number | null
        comercios_relevados: number
        nivel_minimo: string | null
        financiada_por: string
        distri_id: string | null
        marca_id: string | null
        actor_campana: string | null
      } | null
    }

  if (!campana) return { error: 'La campaña no está disponible.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfilUsuario } = await (admin as any)
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .single() as { data: { tipo_actor: string } | null }

  const esFixer = perfilUsuario?.tipo_actor === 'fixer'

  // ── Validar que el tipo de actor coincide con la campaña ─────────────────────
  if (campana.actor_campana === 'fixer' && !esFixer) {
    return { error: 'Esta campaña es exclusiva para fixers.' }
  }
  if (campana.actor_campana === 'gondolero' && esFixer) {
    return { error: 'Esta campaña es exclusiva para gondoleros.' }
  }

  // ── Validar acceso según financiador ─────────────────────────────────────────
  // Usa la tabla de vinculación correcta según tipo_actor
  const tablaVinculacion = esFixer ? 'fixer_distri_solicitudes' : 'gondolero_distri_solicitudes'
  const columnaId = esFixer ? 'fixer_id' : 'gondolero_id'

  if (campana.financiada_por === 'distri' && campana.distri_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: vinculacion } = await (admin as any)
      .from(tablaVinculacion)
      .select('id')
      .eq(columnaId, user.id)
      .eq('distri_id', campana.distri_id)
      .eq('estado', 'aprobada')
      .maybeSingle()

    if (!vinculacion) {
      return { error: esFixer
        ? 'Esta campaña es exclusiva para fixers vinculados a esa distribuidora.'
        : 'Esta campaña es exclusiva para gondoleros vinculados a esa distribuidora.' }
    }
  }

  if (campana.financiada_por === 'marca') {
    if (campana.distri_id) {
      // Campaña ejecutada por una distri específica → el participante debe estar vinculado a ESA distri
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: vinculacion } = await (admin as any)
        .from(tablaVinculacion)
        .select('id')
        .eq(columnaId, user.id)
        .eq('distri_id', campana.distri_id)
        .eq('estado', 'aprobada')
        .maybeSingle()

      if (!vinculacion) {
        return { error: esFixer
          ? 'Esta campaña es exclusiva para fixers de la distribuidora que la ejecuta.'
          : 'Esta campaña es exclusiva para gondoleros de la distribuidora que la ejecuta.' }
      }
    } else if (campana.marca_id) {
      // Campaña de marca sin distri específica → cualquier distri vinculada a esa marca
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: misDistrisRows } = await (admin as any)
        .from(tablaVinculacion)
        .select('distri_id')
        .eq(columnaId, user.id)
        .eq('estado', 'aprobada')

      const misDistriIds = ((misDistrisRows ?? []) as { distri_id: string }[]).map(d => d.distri_id)

      if (misDistriIds.length === 0) {
        return { error: 'Esta campaña es exclusiva para participantes de distribuidoras vinculadas a esta marca.' }
      }

      const { data: relacion } = await admin
        .from('marca_distri_relaciones')
        .select('id')
        .eq('marca_id', campana.marca_id)
        .in('distri_id', misDistriIds)
        .eq('estado', 'activa')
        .limit(1)

      if (!relacion?.length) {
        return { error: 'Esta campaña es exclusiva para participantes de distribuidoras vinculadas a esta marca.' }
      }
    }
  }
  // ── Fin validación de acceso ─────────────────────────────────────────────────

  // Validar fecha límite de inscripción
  if (campana.fecha_limite_inscripcion && new Date(campana.fecha_limite_inscripcion) < new Date()) {
    return { error: 'El período de inscripción ya cerró.' }
  }

  // Validar tope total de comercios
  if (campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios) {
    return { error: 'Esta campaña ya alcanzó su cupo máximo.' }
  }

  // Validar nivel del gondolero
  const nivelMinimo = campana.nivel_minimo ?? 'casual'
  if (nivelMinimo !== 'casual') {
    const { data: profile } = await admin
      .from('profiles')
      .select('nivel')
      .eq('id', user.id)
      .single() as { data: { nivel: string } | null }

    const gondoleroNivel = profile?.nivel ?? 'casual'
    if ((NIVEL_ORDEN[gondoleroNivel] ?? 0) < (NIVEL_ORDEN[nivelMinimo] ?? 0)) {
      const NIVEL_LABEL: Record<string, string> = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }
      return { error: `Esta campaña requiere nivel ${NIVEL_LABEL[nivelMinimo] ?? nivelMinimo}. Tu nivel actual es ${NIVEL_LABEL[gondoleroNivel] ?? gondoleroNivel}.` }
    }
  }

  // Buscar cualquier participación existente (cualquier estado)
  const { data: existente, error: existenteError } = await admin
    .from('participaciones')
    .select('id, estado')
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .maybeSingle()

  console.log('[unirse] existente:', existente, 'error:', existenteError)

  if (existente?.estado === 'activa') {
    redirect(`/gondolero/captura?campana=${campanaId}`)
  }

  if (existente) {
    // Ya existe fila (completada/abandonada) → UPDATE para reactivar
    console.log('[unirse] haciendo UPDATE de id:', existente.id)
    const { error } = await admin
      .from('participaciones')
      .update({
        estado:                'activa',
        comercios_completados: 0,
        puntos_acumulados:     0,
        joined_at:             new Date().toISOString(),
      })
      .eq('id', existente.id)

    console.log('[unirse] UPDATE error:', error)
    if (error) return { error: `No pudimos reactivar tu inscripción: ${error.message}` }
  } else {
    // Primera vez → INSERT
    console.log('[unirse] haciendo INSERT')
    const { error } = await admin
      .from('participaciones')
      .insert({
        campana_id:            campanaId,
        gondolero_id:          user.id,
        estado:                'activa',
        comercios_completados: 0,
        puntos_acumulados:     0,
      })

    console.log('[unirse] INSERT error:', error)
    if (error) return { error: `No pudimos inscribirte: ${error.message}` }
  }

  revalidatePath('/gondolero/misiones')
  revalidatePath('/gondolero/campanas')
  redirect(`/gondolero/captura?campana=${campanaId}`)
}

// Acción temporal para probar unión sin redirect
export async function soloUnirse(campanaId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada.' }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: existente } = await admin
    .from('participaciones')
    .select('id, estado')
    .eq('campana_id', campanaId)
    .eq('gondolero_id', user.id)
    .maybeSingle()

  console.log('[soloUnirse] existente:', existente)

  if (existente?.estado === 'activa') return { ok: true }

  if (existente) {
    const { error } = await admin
      .from('participaciones')
      .update({ estado: 'activa', comercios_completados: 0, puntos_acumulados: 0, joined_at: new Date().toISOString() })
      .eq('id', existente.id)
    console.log('[soloUnirse] UPDATE error:', error)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from('participaciones')
      .insert({ campana_id: campanaId, gondolero_id: user.id, estado: 'activa', comercios_completados: 0, puntos_acumulados: 0 })
    console.log('[soloUnirse] INSERT error:', error)
    if (error) return { error: error.message }
  }

  revalidatePath(`/gondolero/campanas/${campanaId}`)
  return { ok: true }
}
