'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getConfig } from '@/lib/config'
import { NIVEL_LABEL, cumpleNivelMinimo } from '@/lib/nivel'
import { nivelMaximoAlcanzado } from '@/lib/nivel-maximo'
import { accesoACampana } from '@/lib/acceso-campana'
import { contextoAcceso } from '@/lib/utils-distri'

/**
 * Todo lo que hay que cumplir para entrar a una campaña, en un solo lugar.
 *
 * ── POR QUÉ SE EXTRAJO ──────────────────────────────────────────────────────
 * `unirseACampana` tenía seis controles y `soloUnirse` —la otra acción de este
 * mismo archivo, la que llama el botón de "Unirme"— **no tenía ninguno**: creaba
 * o reactivaba la participación y listo. Ni campaña activa, ni vigencia, ni
 * nivel, ni vínculo. Una puerta sin control al lado de otra con seis no tiene
 * defensa: la que se usa termina siendo la que no valida.
 *
 * El acceso según financiador ya no se resuelve acá: vive en
 * `lib/acceso-campana.ts` porque estaba escrito tres veces —esta, la lista y el
 * detalle— y las tres diferían.
 */
async function validarUnion(
  campanaId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<{ error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campana } = await (admin as any)
    .from('campanas')
    .select('id, fecha_limite_inscripcion, tope_total_comercios, comercios_relevados, nivel_minimo, financiada_por, via_ejecucion, distri_id, repositora_id, marca_id, actor_campana')
    .eq('id', campanaId)
    .eq('estado', 'activa')
    .maybeSingle() as {
      data: {
        id: string
        fecha_limite_inscripcion: string | null
        tope_total_comercios: number | null
        comercios_relevados: number
        nivel_minimo: string | null
        financiada_por: string | null
        via_ejecucion: string | null
        distri_id: string | null
        repositora_id: string | null
        marca_id: string | null
        actor_campana: string | null
      } | null
    }

  if (!campana) return { error: 'La campaña no está disponible.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfilUsuario } = await (admin as any)
    .from('profiles')
    .select('tipo_actor')
    .eq('id', userId)
    .maybeSingle() as { data: { tipo_actor: string | null } | null }

  // ── Acceso: tipo de actor + financiador ───────────────────────────────────
  const acceso = accesoACampana(
    campana,
    await contextoAcceso({ actorId: userId, tipoActor: perfilUsuario?.tipo_actor, admin }),
  )
  if (!acceso.ok) return { error: acceso.mensaje }

  // ── Fecha límite de inscripción ───────────────────────────────────────────
  if (campana.fecha_limite_inscripcion && new Date(campana.fecha_limite_inscripcion) < new Date()) {
    return { error: 'El período de inscripción ya cerró.' }
  }

  // ── Tope total de comercios ───────────────────────────────────────────────
  if (campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios) {
    return { error: 'Esta campaña ya alcanzó su cupo máximo.' }
  }

  // ── Nivel ─────────────────────────────────────────────────────────────────
  //
  // El nivel que abre el gate es el MÁXIMO alcanzado —el mejor mes de toda su
  // historia—, no el del mes en curso: el privilegio ganado no se pierde por
  // dejar de trabajar un mes. Ver lib/nivel-maximo.ts.
  const nivelMinimo = campana.nivel_minimo ?? 'casual'
  if (nivelMinimo !== 'casual') {
    const config = await getConfig()
    const gondoleroNivel = await nivelMaximoAlcanzado(userId, admin, {
      activo: config.niveles.fotosCasualAActivo,
      pro:    config.niveles.fotosActivoAPro,
    })

    // `null` no es "casual": es que la consulta falló. Acusarlo de no tener el
    // nivel sería rechazarlo tardíamente por un problema de infraestructura, con
    // un mensaje que además le echa la culpa. El error dice lo que pasó.
    if (gondoleroNivel === null) {
      return { error: 'No pudimos verificar tu nivel en este momento. Probá de nuevo en unos segundos.' }
    }
    if (!cumpleNivelMinimo(gondoleroNivel, nivelMinimo)) {
      return { error: `Esta campaña requiere nivel ${NIVEL_LABEL[nivelMinimo] ?? nivelMinimo}. Tu nivel actual es ${NIVEL_LABEL[gondoleroNivel] ?? gondoleroNivel}.` }
    }
  }

  return {}
}

// `unirseACampana` se borró el 22/9/2026. No la llamaba NADIE — el único botón
// de unirse usa `soloUnirse`, verificado con grep sobre todo el repo.
//
// No se dejó "por las dudas" a propósito: una función muerta con los controles
// adentro es la que alguien va a "arreglar" algún día creyendo que es la que
// corre, y el arreglo no va a tener efecto. Lo que valía la pena —los seis
// controles— ya está en `validarUnion`, que `soloUnirse` comparte.
//
// Hacía además un `redirect()` a captura, que es lo único que no sobrevive:
// el botón actual navega desde el cliente.

/**
 * Unirse sin redirect. La llama el botón "Unirme" del detalle de campaña.
 *
 * Hasta el 18/9/2026 no validaba NADA: creaba la participación y devolvía ok.
 * Ahora usa `validarUnion`, que tiene los seis controles. Dos puertas al mismo
 * lugar no pueden pedir cosas distintas — la que se usa termina siendo la que
 * no valida. Desde el 22/9/2026 hay UNA sola puerta: `unirseACampana` se borró
 * por no tener llamadores.
 */
export async function soloUnirse(campanaId: string): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sesión expirada.' }

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const permiso = await validarUnion(campanaId, user.id, admin)
  if (permiso.error) return { error: permiso.error }

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
