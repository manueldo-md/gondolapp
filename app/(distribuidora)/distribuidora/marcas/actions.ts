'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { appUrl } from '@/lib/app-url'
import { distriDeLaSesion } from '@/lib/actor-sesion'
import { exigirPertenencia } from '@/lib/pertenencia'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * **La única de los cuatro `generarLink*` que usaba el parámetro crudo.**
 *
 * Sus tres hermanas —`generarLinkInvitacionMarca`, `…Repo`, `…DistriRepo`—
 * leen el id del perfil y descartan el parámetro; una hasta lo dice en un
 * comentario: *"Usar siempre el marca_id del perfil, no el parámetro del
 * cliente"*. Ésta lo insertaba tal cual.
 *
 * O sea que cualquier autenticado podía **acuñar un token de invitación a
 * nombre de cualquier distribuidora**. El que abriera el link se vinculaba a
 * ella. No es una fuga de datos: es suplantación.
 *
 * `distriId` salió de la firma, como en las otras tres — donde no era un
 * agujero pero sí un parámetro muerto, que es la trampa para el próximo.
 */
export async function generarLinkInvitacionDistri(
  distriNombre: string
): Promise<{ link?: string; error?: string }> {
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const token = crypto.randomUUID().replace(/-/g, '').substring(0, 24)
  const expiraAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('marca_distri_tokens').insert({
    token,
    iniciado_por: 'distri',
    distri_id: distriId,
    expira_at: expiraAt,
  })

  console.log('[generarLinkDistri] distriId:', distriId)
  console.log('[generarLinkDistri] insert error:', error)

  if (error) return { error: `No se pudo generar el link: ${error.message}` }

  const baseUrl = appUrl()
  const link = `${baseUrl}/vinculacion-marca?token=${token}`
  console.log('[generarLinkDistri] link generado:', link)
  return { link }
}

export async function verificarTerminarRelacionDistri(
  relacionId: string
): Promise<{ campanasBloqueantes: { id: string; nombre: string }[] }> {
  const admin = adminClient()

  const { data: rel } = await admin
    .from('marca_distri_relaciones')
    .select('marca_id, distri_id')
    .eq('id', relacionId)
    .single()

  if (!rel?.marca_id || !rel?.distri_id) return { campanasBloqueantes: [] }

  const { data: campanas } = await admin
    .from('campanas')
    .select('id, nombre')
    .eq('marca_id', rel.marca_id)
    .eq('distri_id', rel.distri_id)
    .in('estado', ['activa', 'pendiente_aprobacion'])

  return { campanasBloqueantes: (campanas ?? []) as { id: string; nombre: string }[] }
}

/**
 * Corta la relación con una marca.
 *
 * Hasta el 25/9/2026: `getUser()` y `update(…).eq('id', relacionId)`. **No
 * miraba de quién era la relación**, así que cualquier autenticado podía
 * cortar cualquier vínculo comercial del sistema — en producción son las 6
 * relaciones marca↔distri, todas activas.
 *
 * Ahora usa el patrón de las actions de REINICIO, que en este mismo dominio ya
 * lo hacían bien: leer la fila, comparar el dueño contra la sesión, cortar.
 * Ver lib/pertenencia.ts.
 */
export async function terminarRelacionDistri(
  relacionId: string
): Promise<{ error?: string }> {
  const admin = adminClient()
  const distriId = await distriDeLaSesion(admin)
  if (!distriId) redirect('/auth')

  const rel = await exigirPertenencia({
    admin, tabla: 'marca_distri_relaciones', id: relacionId,
    columna: 'distri_id', valor: distriId, desde: 'distri/marcas:terminarRelacionDistri',
  })
  if (!rel) return { error: 'No encontramos esa relación.' }

  const now = new Date().toISOString()

  const { error } = await admin
    .from('marca_distri_relaciones')
    .update({ estado: 'terminada', fecha_fin: now, updated_at: now })
    .eq('id', relacionId)

  if (error) return { error: 'No se pudo terminar la relación' }

  revalidatePath('/distribuidora/marcas')
  return {}
}
