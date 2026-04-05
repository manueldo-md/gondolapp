'use server'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type { CampoBloque } from '@/components/shared/campos-bloque-builder'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface DraftData {
  instruccion: string
  puntos: number
  nuevasZonas: { id: string; nombre: string }[]
  nuevosBloques: { instruccion: string; tipo_contenido: string; campos: CampoBloque[] }[]
}

export async function guardarBorradorDistri(campanaId: string, data: DraftData) {
  await admin().from('campanas').update({
    draft_descripcion: data.instruccion,
    draft_bounty: data.puntos,
    draft_zonas: data.nuevasZonas,
    draft_bloques: data.nuevosBloques,
    tiene_draft: true,
  }).eq('id', campanaId)
  revalidatePath(`/distribuidora/campanas/${campanaId}/detalle`)
}

export async function republicarCampanaDistri(campanaId: string): Promise<{ error?: string }> {
  const { data: c } = await admin()
    .from('campanas')
    .select('puntos_por_foto, draft_descripcion, draft_bounty, draft_zonas, draft_bloques')
    .eq('id', campanaId)
    .single()

  if (!c) return { error: 'Campaña no encontrada' }

  if (c.draft_bounty !== null && c.draft_bounty < c.puntos_por_foto) {
    return { error: 'No podés reducir el bounty por foto' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {
    tiene_draft: false,
    draft_descripcion: null,
    draft_zonas: null,
    draft_bounty: null,
    draft_bloques: null,
  }
  if (c.draft_descripcion !== null) updates.instruccion = c.draft_descripcion
  if (c.draft_bounty !== null && c.draft_bounty !== c.puntos_por_foto) {
    updates.puntos_por_foto = c.draft_bounty
  }

  await admin().from('campanas').update(updates).eq('id', campanaId)

  if (Array.isArray(c.draft_zonas) && c.draft_zonas.length > 0) {
    const { data: existing } = await admin().from('campana_zonas').select('zona_id').eq('campana_id', campanaId)
    const existingIds = new Set((existing ?? []).map((z: { zona_id: string }) => z.zona_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toInsert = (c.draft_zonas as any[]).filter((z: any) => !existingIds.has(z.id))
    if (toInsert.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await admin().from('campana_zonas').insert(toInsert.map((z: any) => ({ campana_id: campanaId, zona_id: z.id })))
    }
  }

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
        tipo_contenido: b.tipo_contenido,
        orden: maxOrden + i + 1,
      }).select('id').single()

      if (bloque?.id && Array.isArray(b.campos) && b.campos.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await admin().from('bloque_campos').insert(b.campos.map((campo: any, j: number) => ({
          bloque_id: bloque.id,
          tipo: campo.tipo,
          pregunta: campo.pregunta,
          opciones: campo.opciones,
          obligatorio: campo.obligatorio,
          orden: j + 1,
        })))
      }
    }
  }

  revalidatePath(`/distribuidora/campanas/${campanaId}/detalle`)
  return {}
}

export async function descartarCambiosDistri(campanaId: string) {
  await admin().from('campanas').update({
    tiene_draft: false,
    draft_descripcion: null,
    draft_zonas: null,
    draft_bounty: null,
    draft_bloques: null,
  }).eq('id', campanaId)
  revalidatePath(`/distribuidora/campanas/${campanaId}/detalle`)
}
