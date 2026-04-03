'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function reportarError(params: {
  url: string
  descripcion: string
  errorTecnico?: string
  contexto?: Record<string, unknown>
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: profile } = await admin
      .from('profiles')
      .select('tipo_actor')
      .eq('id', user.id)
      .single()

    await admin.from('errores_reportados').insert({
      usuario_id:    user.id,
      tipo_actor:    profile?.tipo_actor ?? null,
      url:           params.url,
      descripcion:   params.descripcion,
      error_tecnico: params.errorTecnico ?? null,
      contexto:      params.contexto ?? null,
    })

    return { ok: true }
  } catch {
    return { ok: false }
  }
}
