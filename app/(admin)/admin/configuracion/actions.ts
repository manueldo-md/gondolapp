'use server'
import { getAdmin, getAdminConUsuario } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'


export async function guardarConfigCompresion(
  maxKb: number,
  maxWidth: number,
  calidad: number
): Promise<{ error?: string }> {
  const admin = await getAdmin()

  const upserts = [
    { clave: 'compresion_max_kb',    valor: String(maxKb),    descripcion: 'Tamaño máximo de foto en KB tras compresión' },
    { clave: 'compresion_max_width', valor: String(maxWidth), descripcion: 'Ancho máximo en px' },
    { clave: 'compresion_calidad',   valor: String(calidad),  descripcion: 'Calidad JPEG inicial (0.1–1.0)' },
  ]

  const { error } = await admin
    .from('configuracion')
    .upsert(upserts, { onConflict: 'clave' })

  if (error) return { error: error.message }
  revalidatePath('/admin/configuracion')
  return {}
}

export async function guardarConfiguracion(clave: string, valor: string) {
  // Tenía el bloque inline, sin nombre, así que era la copia que ningún grep
  // de `getAdmin` encontraba. Ver lib/admin-sesion.ts.
  const { admin, userId } = await getAdminConUsuario()

  const { error } = await admin
    .from('configuracion')
    .update({
      valor,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq('clave', clave)

  if (error) return { error: error.message }

  revalidatePath('/admin/configuracion')
  return { ok: true }
}
