'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cerrarVinculacion, previsualizarCierre, type ResumenCierre } from '@/lib/cerrar-vinculacion'
import { usuarioDeLaSesion } from '@/lib/actor-sesion'
import { exigirPertenencia } from '@/lib/pertenencia'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function solicitarVinculacion(
  distriId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que la distribuidora existe y está validada
  const { data: distri } = await admin
    .from('distribuidoras')
    .select('id, razon_social')
    .eq('id', distriId)
    .eq('validada', true)
    .single()

  if (!distri) return { error: 'Distribuidora no encontrada' }

  // Insertar solicitud (si ya existe una previa rechazada, se puede volver a solicitar)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .upsert(
      {
        gondolero_id: user.id,
        distri_id: distriId,
        estado: 'pendiente',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gondolero_id,distri_id' }
    )

  if (error) return { error: 'No se pudo enviar la solicitud. Intentá de nuevo.' }

  revalidatePath('/gondolero/perfil')
  return {}
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LAS SEIS DE VINCULACIÓN — el relevamiento del 25/9/2026
 *
 * Las seis recibían un `solicitudId` del cliente y **ninguna verificaba que
 * fuera suyo**. Con la sesión de cualquier gondolero se podía aceptar o
 * rechazar la vinculación de CUALQUIER otro.
 *
 * Es peor que leer datos ajenos, y por una razón concreta: **decide de quién
 * depende el trabajo de una persona.** Un vínculo aceptado o roto cambia qué
 * campañas ve, quién le aprueba las fotos y —vía `cerrarVinculacion`— si sus
 * bounties retenidos se pagan o se quedan retenidos.
 *
 * Y el rechazo es el ataque barato, porque **la víctima no se entera**: la
 * solicitud queda 'rechazada' y en pantalla eso es indistinguible de que la
 * distribuidora no la haya aprobado.
 *
 * ── LOS PARÁMETROS EXTRA SE FUERON, Y NO SE REEMPLAZARON POR UN CHEQUEO ─────
 * `gondoleroId`, `fixerId` y `distriId`/`repoId` **estaban en la fila**. O sea
 * que no hacía falta verificarlos: alcanza con leerlos de la solicitud. Eso
 * mata el IDOR y el parámetro de una vez, y deja una firma donde el error ya
 * no se puede cometer.
 *
 * El dueño se compara con `exigirPertenencia` (lib/pertenencia.ts), que es el
 * patrón de las actions de reinicio extraído: leer la fila, comparar contra la
 * sesión, cortar.
 * ══════════════════════════════════════════════════════════════════════════
 */

export async function aceptarVinculacionDistri(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'gondolero_distri_solicitudes', id: solicitudId,
    columna: 'gondolero_id', valor: userId, columnas: ['distri_id'],
    desde: 'perfil:aceptarVinculacionDistri',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }
  const distriId = sol.distri_id as string

  // Marcar solicitud como aprobada (fuente de verdad en nuevo modelo)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // Actualizar profiles.distri_id solo si no tiene ninguna distri principal aún
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', userId).single()
  if (!profile?.distri_id) {
    await admin.from('profiles').update({ distri_id: distriId }).eq('id', userId)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarVinculacionDistri(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'gondolero_distri_solicitudes', id: solicitudId,
    columna: 'gondolero_id', valor: userId,
    desde: 'perfil:rechazarVinculacionDistri',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }

  await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function aceptarVinculacionRepo(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'fixer_repo_solicitudes', id: solicitudId,
    columna: 'fixer_id', valor: userId, columnas: ['repositora_id'],
    desde: 'perfil:aceptarVinculacionRepo',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }
  const repoId = sol.repositora_id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // ── LA GUARDA QUE FALTABA ─────────────────────────────────────────────────
  // Sus dos hermanas escriben la columna **solo si está en null**; ésta la
  // pisaba siempre. Y pisarla no es cosmético: un fixer puede estar vinculado
  // a varias repositoras a la vez —el Walled Garden protege los datos de cada
  // ejecutor, no la exclusividad de la persona— así que sobreescribirla lo
  // movía de equipo sin desvincularlo de nada.
  //
  // Es exactamente lo que se corrigió el 22/9/2026 en `aprobarSolicitudFixer`,
  // del lado de la repositora. Este camino quedó sin el arreglo.
  //
  // El vínculo verdadero ya quedó arriba, en la tabla, que es la fuente.
  const { data: perfil } = await admin
    .from('profiles').select('repositora_id').eq('id', userId).maybeSingle()
  if (!(perfil as { repositora_id: string | null } | null)?.repositora_id) {
    await admin.from('profiles').update({ repositora_id: repoId }).eq('id', userId)
  }

  revalidatePath('/gondolero/perfil')
  revalidatePath('/repositora/fixers')
  return {}
}

export async function rechazarVinculacionRepo(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'fixer_repo_solicitudes', id: solicitudId,
    columna: 'fixer_id', valor: userId,
    desde: 'perfil:rechazarVinculacionRepo',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('fixer_repo_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function aceptarVinculacionDistri_Fixer(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'fixer_distri_solicitudes', id: solicitudId,
    columna: 'fixer_id', valor: userId, columnas: ['distri_id'],
    desde: 'perfil:aceptarVinculacionDistri_Fixer',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }
  const distriId = sol.distri_id as string

  const { error } = await admin
    .from('fixer_distri_solicitudes')
    .update({ estado: 'aprobada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  if (error) return { error: 'No se pudo completar la vinculación. Intentá de nuevo.' }

  // Actualizar distri_id en profile si no tiene ninguna aún
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', userId).single()
  if (!profile?.distri_id) {
    await admin.from('profiles').update({ distri_id: distriId }).eq('id', userId)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}

export async function rechazarVinculacionDistri_Fixer(
  solicitudId: string
): Promise<{ error?: string }> {
  const userId = await usuarioDeLaSesion()
  if (!userId) redirect('/auth')

  const admin = adminClient()
  const sol = await exigirPertenencia({
    admin, tabla: 'fixer_distri_solicitudes', id: solicitudId,
    columna: 'fixer_id', valor: userId,
    desde: 'perfil:rechazarVinculacionDistri_Fixer',
  })
  if (!sol) return { error: 'No encontramos esa invitación.' }

  await admin
    .from('fixer_distri_solicitudes')
    .update({ estado: 'rechazada', updated_at: new Date().toISOString() })
    .eq('id', solicitudId)

  revalidatePath('/gondolero/perfil')
  return {}
}

/**
 * Qué deja atrás si se va. Se muestra ANTES de confirmar.
 *
 * `iniciadoPor: 'gondolero'` no es un detalle: hace que el resumen diga que los
 * puntos retenidos **se quedan retenidos**, que es lo que efectivamente va a
 * pasar por este camino. Ver lib/cerrar-vinculacion.ts.
 */
export async function previsualizarDesvincularme(distriId: string): Promise<ResumenCierre> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  return previsualizarCierre({
    gondoleroId: user.id, distriId, admin: adminClient(), iniciadoPor: 'gondolero',
  })
}

export async function desvincularseDeDistri(distriId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Cerrar el trabajo en curso ANTES de cortar el vínculo.
  //
  // Hasta el 18/9/2026 este camino no cerraba nada: el gondolero se iba solo y
  // dejaba participaciones activas y bounties retenidos que ya nadie iba a
  // liberar. El camino de la distri, en cambio, ni siquiera dejaba desvincular
  // si había trabajo en curso. Dos comportamientos opuestos para el mismo hecho.
  //
  // Ahora los dos hacen lo mismo. Ver lib/cerrar-vinculacion.ts, incluido el
  // abuso que abre pagar los retenidos cuando el que se va es él.
  const cierre = await cerrarVinculacion({
    gondoleroId: user.id, distriId, admin, iniciadoPor: 'gondolero',
  })
  if (!cierre.ok) return { error: cierre.error }

  // Marcar la vinculación como terminada (histórico permanente)
  const { error } = await admin
    .from('gondolero_distri_solicitudes')
    .update({ estado: 'terminada', updated_at: new Date().toISOString() })
    .eq('gondolero_id', user.id)
    .eq('distri_id', distriId)

  if (error) return { error: 'No se pudo desvincular. Intentá de nuevo.' }

  // Si esta era la distri principal, asignar otra activa como principal (o null)
  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', user.id).single()
  if (profile?.distri_id === distriId) {
    const { data: otraDistri } = await admin
      .from('gondolero_distri_solicitudes')
      .select('distri_id')
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada')
      .neq('distri_id', distriId)
      .limit(1)
      .maybeSingle()

    await admin.from('profiles').update({ distri_id: otraDistri?.distri_id ?? null }).eq('id', user.id)
  }

  revalidatePath('/gondolero/perfil')
  return {}
}
