'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  validarComercioYCrearMision,
  rechazarComercioConMotivo,
} from '@/lib/validacion-comercio'
import { distriPuedeTocarComercio } from '@/lib/comercios-pendientes-distri'
import { distriDeLaSesion } from '@/lib/actor-sesion'

/**
 * Validación de comercios — panel de distribuidora.
 *
 * Misma regla que el panel de admin (`lib/validacion-comercio.ts`); lo único
 * propio es el permiso: la distri solo toca los comercios que su bandeja le
 * muestra, o sea los cargados por SUS gondoleros.
 */

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * El permiso vive en `lib/comercios-pendientes-distri.ts`, al lado del criterio
 * de la LISTA, para que no se puedan separar. Acá solo se llama.
 */
async function puedeTocar(comercioId: string, distriId: string): Promise<boolean> {
  return distriPuedeTocarComercio(comercioId, distriId, adminClient())
}

function revalidar() {
  revalidatePath('/distribuidora/comercios/pendientes')
  revalidatePath('/distribuidora/comercios')
  revalidatePath('/distribuidora/dashboard')
}

export async function aprobarComercioDistri(id: string) {
  // El id de la distri sale de la SESIÓN y exige tipo_actor = 'distribuidora':
  // un gondolero también tiene `distri_id` cargado —es su distri principal— y
  // hasta ahora lo único que lo mantenía fuera de acá era el middleware.
  const distriId = await distriDeLaSesion(adminClient())
  if (!distriId) redirect('/auth')

  if (!(await puedeTocar(id, distriId))) {
    return { error: 'No tenés permiso para aprobar este comercio.' }
  }

  const resultado = await validarComercioYCrearMision(id, adminClient())
  revalidar()

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true, puntos: resultado.puntos ?? 0 }
}

export async function rechazarComercioDistri(id: string, motivo?: string) {
  // El id de la distri sale de la SESIÓN y exige tipo_actor = 'distribuidora':
  // un gondolero también tiene `distri_id` cargado —es su distri principal— y
  // hasta ahora lo único que lo mantenía fuera de acá era el middleware.
  const distriId = await distriDeLaSesion(adminClient())
  if (!distriId) redirect('/auth')

  if (!(await puedeTocar(id, distriId))) {
    return { error: 'No tenés permiso para rechazar este comercio.' }
  }

  const resultado = await rechazarComercioConMotivo(id, motivo, adminClient())
  revalidar()

  if (!resultado.ok) return { error: resultado.error }
  return { ok: true }
}

/**
 * Escribe la localidad DEFINITIVA del comercio.
 *
 * ETAPA 5: es lo único que convierte la sugerencia del servidor en dato. El
 * geocoding acierta 8 de cada 9 veces que resuelve, pero **la novena apunta a
 * otra localidad** y ese caso no lo detecta ninguna lógica — la respuesta es
 * internamente consistente. Lo detecta quien conoce la zona, mirando.
 *
 * La sugerencia NO se borra: comparar las dos columnas es la única forma de
 * medir con qué frecuencia el geocoding acierta en la vida real, que es el
 * número que decidiría algún día si puede escribir solo.
 */
export async function asignarLocalidadDistri(comercioId: string, localidadId: number) {
  // El id de la distri sale de la SESIÓN y exige tipo_actor = 'distribuidora':
  // un gondolero también tiene `distri_id` cargado —es su distri principal— y
  // hasta ahora lo único que lo mantenía fuera de acá era el middleware.
  const distriId = await distriDeLaSesion(adminClient())
  if (!distriId) redirect('/auth')

  if (!(await puedeTocar(comercioId, distriId))) {
    return { error: 'No tenés permiso para editar este comercio.' }
  }

  // No se confía en el id que llega del cliente: tiene que existir. Sin esto,
  // un número cualquiera entraría y la FK lo rebotaría con un error ilegible.
  const admin = adminClient()
  const { data: loc } = await admin
    .from('localidades').select('id').eq('id', localidadId).maybeSingle()
  if (!loc) return { error: 'Esa localidad no existe.' }

  // supabase-js devuelve el error en .error y no lo lanza. Sin este chequeo,
  // una asignación que falla se vería igual que una que anduvo.
  const { error } = await admin
    .from('comercios').update({ localidad_id: localidadId }).eq('id', comercioId)
  if (error) {
    console.error('[localidad] No se pudo asignar:', error.message)
    return { error: 'No se pudo guardar la localidad.' }
  }

  revalidar()
  return { ok: true }
}
