'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoActor } from '@/types'
import { generarAlias } from '@/lib/aliases'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function cambiarTipoActor(userId: string, nuevoTipo: TipoActor) {
  const admin = await getAdmin()
  // Limpiar distri_id/marca_id si el nuevo tipo no los usa
  const updateData: Record<string, unknown> = { tipo_actor: nuevoTipo }
  if (nuevoTipo !== 'gondolero' && nuevoTipo !== 'distribuidora') {
    updateData.distri_id = null
  }
  if (nuevoTipo !== 'marca') {
    updateData.marca_id = null
  }
  await admin.from('profiles').update(updateData).eq('id', userId)
  revalidatePath('/admin/usuarios')
}

export async function cambiarPasswordAdmin(
  userId: string,
  nuevaPassword: string
): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.auth.admin.updateUserById(userId, { password: nuevaPassword })
  if (error) return { error: error.message }
  revalidatePath('/admin/usuarios')
  return {}
}

export async function enviarEmailRecuperacion(
  userId: string,
  email: string
): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/nueva-password`,
    },
  })
  if (error) return { error: error.message }
  return {}
}

export async function toggleActivarCuenta(
  userId: string,
  activar: boolean
): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: activar ? 'none' : '876600h',
  })
  if (authError) return { error: authError.message }
  // Actualizar activo en profiles (requiere migration 004)
  await admin.from('profiles').update({ activo: activar }).eq('id', userId)
  revalidatePath('/admin/usuarios')
  return {}
}

export async function editarPerfilAdmin(
  userId: string,
  datos: {
    nombre: string
    celular?: string
    distri_id?: string | null
    marca_id?: string | null
    razon_social?: string | null
    cuit?: string | null
  }
): Promise<{ error?: string }> {
  const admin = await getAdmin()

  // Actualizar profile
  const { error } = await admin
    .from('profiles')
    .update({
      nombre:    datos.nombre.trim(),
      celular:   datos.celular?.trim() || null,
      distri_id: datos.distri_id || null,
      marca_id:  datos.marca_id  || null,
    })
    .eq('id', userId)
  if (error) return { error: error.message }

  // Actualizar entidad distribuidora si corresponde
  if (datos.distri_id && (datos.razon_social !== undefined || datos.cuit !== undefined)) {
    const entityUpdate: Record<string, unknown> = {}
    if (datos.razon_social !== undefined) entityUpdate.razon_social = datos.razon_social?.trim() || null
    if (datos.cuit !== undefined) entityUpdate.cuit = datos.cuit?.trim() || null
    await admin.from('distribuidoras').update(entityUpdate).eq('id', datos.distri_id)
  }

  // Actualizar entidad marca si corresponde
  if (datos.marca_id && (datos.razon_social !== undefined || datos.cuit !== undefined)) {
    const entityUpdate: Record<string, unknown> = {}
    if (datos.razon_social !== undefined) entityUpdate.razon_social = datos.razon_social?.trim() || null
    if (datos.cuit !== undefined) entityUpdate.cuit = datos.cuit?.trim() || null
    await admin.from('marcas').update(entityUpdate).eq('id', datos.marca_id)
  }

  revalidatePath('/admin/usuarios')
  return {}
}

/**
 * Asigna alias únicos a todos los gondoleros que aún no tienen uno.
 * Retorna la cantidad de aliases asignados.
 */
export async function asignarAliasExistentes(): Promise<{ asignados: number; error?: string }> {
  const admin = await getAdmin()

  // Obtener todos los gondoleros sin alias
  const { data: gondoleros, error } = await admin
    .from('profiles')
    .select('id')
    .eq('tipo_actor', 'gondolero')
    .is('alias', null)

  if (error) return { asignados: 0, error: error.message }
  if (!gondoleros || gondoleros.length === 0) return { asignados: 0 }

  let asignados = 0

  // Asignar alias a cada gondolero secuencialmente para garantizar unicidad
  for (const gondolero of gondoleros) {
    try {
      const alias = await generarAlias(admin)
      const { error: updateError } = await admin
        .from('profiles')
        .update({ alias })
        .eq('id', gondolero.id)
      if (!updateError) asignados++
    } catch {
      // Continuar con el siguiente si falla uno
    }
  }

  revalidatePath('/admin/usuarios')
  return { asignados }
}

export async function eliminarUsuario(userId: string): Promise<{ error?: string }> {
  const admin = await getAdmin()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath('/admin/usuarios')
  return {}
}

export async function crearUsuario(payload: {
  email: string
  password: string
  nombre: string
  tipo_actor: TipoActor
  distri_id?: string | null
  marca_id?: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()

  // Si es marca o distribuidora nueva (sin id vinculado), crear el registro primero
  let distriId = payload.distri_id || null
  let marcaId  = payload.marca_id  || null

  if (payload.tipo_actor === 'distribuidora' && !distriId) {
    const { data: nuevaDistri, error: distriError } = await admin
      .from('distribuidoras')
      .insert({ razon_social: payload.nombre, validada: false })
      .select('id')
      .single()
    if (distriError) return { error: 'No se pudo crear la distribuidora: ' + distriError.message }
    distriId = nuevaDistri.id
  }

  if (payload.tipo_actor === 'marca' && !marcaId) {
    const { data: nuevaMarca, error: marcaError } = await admin
      .from('marcas')
      .insert({ razon_social: payload.nombre, validada: false })
      .select('id')
      .single()
    if (marcaError) return { error: 'No se pudo crear la marca: ' + marcaError.message }
    marcaId = nuevaMarca.id
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: {
      tipo_actor: payload.tipo_actor,
      nombre: payload.nombre,
      distri_id: distriId,
      marca_id: marcaId,
    },
  })

  if (authError) return { error: authError.message }

  // Asegurarse que el profile quede bien (por si el trigger no corrió aún)
  await admin.from('profiles').update({
    tipo_actor: payload.tipo_actor,
    nombre: payload.nombre,
    distri_id: distriId,
    marca_id: marcaId,
  }).eq('id', authData.user.id)

  revalidatePath('/admin/usuarios')
  revalidatePath('/admin/marcas')
  revalidatePath('/admin/distribuidoras')
  return {}
}
