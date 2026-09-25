'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'
import type { TipoActor } from '@/types'
import { generarAlias } from '@/lib/aliases'
import { appUrl } from '@/lib/app-url'


/**
 * El código personal NO se toca acá, y es deliberado: lo reasigna el trigger
 * `profiles_sincronizar_codigo` (migración 20260923100000), que corre sobre
 * cualquier UPDATE de `tipo_actor` venga de donde venga.
 *
 * Hasta esa migración esta función no lo tocaba **porque nadie se había
 * acordado**, y el efecto era que un gondolero convertido en marca se quedaba
 * con su GND y seguía apareciendo en las búsquedas por código de los paneles de
 * vinculación. Que la regla la haga cumplir la base es lo que cierra eso para
 * los dos caminos —este y `crearUsuario`— y para los que no existen todavía.
 */
export async function cambiarTipoActor(
  userId: string,
  nuevoTipo: TipoActor,
): Promise<{ error?: string }> {
  const admin = await getAdmin()
  // Limpiar distri_id/marca_id si el nuevo tipo no los usa
  const updateData: Record<string, unknown> = { tipo_actor: nuevoTipo }
  if (nuevoTipo !== 'gondolero' && nuevoTipo !== 'distribuidora') {
    updateData.distri_id = null
  }
  if (nuevoTipo !== 'marca') {
    updateData.marca_id = null
  }

  // Se chequea el error: es una de las 137 escrituras que lo ignoraban. Un
  // fallo silencioso acá deja al usuario con el tipo VIEJO y al admin creyendo
  // que lo cambió — y desde la migración del prefijo, el trigger tampoco corre,
  // así que el código queda del tipo equivocado sin que nada avise.
  const { error } = await admin.from('profiles').update(updateData).eq('id', userId)
  if (error) return { error: `No se pudo cambiar el tipo: ${error.message}` }

  revalidatePath('/admin/usuarios')
  return {}
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
      redirectTo: `${appUrl()}/auth/nueva-password`,
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
/**
 * Asigna alias a gondoleros y fixers que no tengan uno.
 *
 * Reporta asignados y fallidos POR SEPARADO: la versión anterior contaba solo
 * los éxitos y descartaba los errores en un `catch` vacío, así que una corrida
 * que arreglaba la mitad decía "12 asignados" y los otros 12 no aparecían en
 * ningún lado. Mismo criterio que asignarCodigosExistentes.
 */
export async function asignarAliasExistentes(): Promise<{
  asignados: number
  fallidos: number
  detalle: string[]
  error?: string
}> {
  const admin = await getAdmin()

  // Obtener todos los gondoleros y fixers sin alias
  const { data: gondoleros, error } = await admin
    .from('profiles')
    .select('id, nombre')
    .in('tipo_actor', ['gondolero', 'fixer'])
    .is('alias', null)

  if (error) return { asignados: 0, fallidos: 0, detalle: [], error: error.message }
  if (!gondoleros || gondoleros.length === 0) return { asignados: 0, fallidos: 0, detalle: [] }

  let asignados = 0
  const detalle: string[] = []

  // Secuencial a propósito: generarAlias mira los alias ya escritos para evitar
  // repetidos, así que en paralelo dos perfiles podrían llevarse el mismo.
  for (const gondolero of gondoleros) {
    const etiqueta = gondolero.nombre || gondolero.id
    try {
      const alias = await generarAlias(admin)
      const { error: updateError } = await admin
        .from('profiles')
        .update({ alias })
        .eq('id', gondolero.id)
      if (updateError) {
        detalle.push(etiqueta)
        console.error('[asignarAliasExistentes] %s: %s', etiqueta, updateError.message)
      } else {
        asignados++
      }
    } catch (e) {
      detalle.push(etiqueta)
      console.error('[asignarAliasExistentes] %s: %s', etiqueta, e instanceof Error ? e.message : String(e))
    }
  }

  revalidatePath('/admin/usuarios')
  return { asignados, fallidos: detalle.length, detalle }
}

/**
 * Asigna código a gondoleros y fixers que no tengan uno, o que tengan uno del
 * formato viejo. Toda la lógica vive en la función SQL backfill_codigos_gondolero,
 * que reintenta ante colisión contra la columna UNIQUE.
 *
 * A diferencia de asignarAliasExistentes, esto NO se traga los errores: devuelve
 * fallidos aparte de asignados, con el detalle de quiénes quedaron sin código. Un
 * backfill que arregla la mitad y reporta solo los éxitos deja creer que terminó.
 */
export async function asignarCodigosExistentes(): Promise<{
  asignados: number
  fallidos: number
  detalle: string[]
  error?: string
}> {
  const admin = await getAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc('backfill_codigos_gondolero')

  if (error) return { asignados: 0, fallidos: 0, detalle: [], error: error.message }

  // La función devuelve una sola fila (RETURNS TABLE + un RETURN NEXT).
  const fila = Array.isArray(data) ? data[0] : data
  if (!fila) return { asignados: 0, fallidos: 0, detalle: [] }

  revalidatePath('/admin/usuarios')
  return {
    asignados: fila.asignados ?? 0,
    fallidos:  fila.fallidos ?? 0,
    detalle:   (fila.detalle_fallidos ?? []) as string[],
  }
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
  repositora_id?: string | null
}): Promise<{ error?: string }> {
  const admin = await getAdmin()

  // Si es marca o distribuidora nueva (sin id vinculado), crear el registro primero
  let distriId    = payload.distri_id    || null
  let marcaId     = payload.marca_id     || null
  let repositoraId = payload.repositora_id || null

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

  if (payload.tipo_actor === 'repositora' && !repositoraId) {
    const { data: nuevaRepo, error: repoError } = await admin
      .from('repositoras')
      .insert({ razon_social: payload.nombre, validada: false })
      .select('id')
      .single()
    if (repoError) return { error: 'No se pudo crear la repositora: ' + repoError.message }
    repositoraId = nuevaRepo.id
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
      repositora_id: repositoraId,
    },
  })

  if (authError) return { error: authError.message }

  // Asegurarse que el profile quede bien (por si el trigger no corrió aún)
  const profileUpdate: Record<string, unknown> = {
    tipo_actor: payload.tipo_actor,
    nombre: payload.nombre,
    distri_id: distriId,
    marca_id: marcaId,
    repositora_id: repositoraId,
  }

  // El código personal NO se escribe acá. Lo pone `handle_new_user()` al alta
  // —siempre GND, porque la whitelist fuerza tipo_actor='gondolero'— y lo
  // CORRIGE el trigger `profiles_sincronizar_codigo` en el UPDATE de abajo:
  // FXR si el tipo real es fixer, NULL si es una empresa.
  //
  // Antes del 23/9/2026 el `codigo_gondolero: null` de las empresas se escribía
  // a mano justo acá. Se sacó porque era la mitad de la regla: `cambiarTipoActor`
  // —el otro camino que cambia el tipo— no lo hacía, y ahí el GND heredado
  // quedaba puesto. Con el trigger, los dos caminos quedan iguales sin que
  // ninguno tenga que acordarse.
  if (payload.tipo_actor === 'gondolero' || payload.tipo_actor === 'fixer') {
    profileUpdate.alias = await generarAlias(admin)
  }

  // Se chequea el error: es una de las 137 escrituras que lo ignoraban, y es la
  // que decide QUÉ ES este usuario. Si falla, la cuenta queda creada en auth
  // como gondolero con código GND —no como la marca que el admin quiso crear— y
  // el panel no muestra nada. Peor que fallar: queda un actor equivocado suelto.
  const { error: updateError } = await admin
    .from('profiles').update(profileUpdate).eq('id', authData.user.id)
  if (updateError) {
    return { error: `El usuario se creó pero quedó mal configurado: ${updateError.message}. Cambiale el tipo desde la lista.` }
  }

  revalidatePath('/admin/usuarios')
  revalidatePath('/admin/marcas')
  revalidatePath('/admin/distribuidoras')
  revalidatePath('/admin/repositoras')
  return {}
}
