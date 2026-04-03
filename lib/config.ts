import { createClient as createAdminClient } from '@supabase/supabase-js'

export interface ConfigCompresion {
  maxSizeMB: number
  maxWidth: number
  calidad: number
}

const DEFAULTS: ConfigCompresion = {
  maxSizeMB: 0.25,
  maxWidth:  1024,
  calidad:   0.70,
}

/**
 * Lee la configuración de compresión desde la tabla `configuracion`.
 * Usar solo en el servidor (server actions, server components).
 */
export async function getConfigCompresion(): Promise<ConfigCompresion> {
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await admin
      .from('configuracion')
      .select('clave, valor')
      .in('clave', ['compresion_max_kb', 'compresion_max_width', 'compresion_calidad'])

    if (!data) return DEFAULTS

    const map: Record<string, string> = {}
    for (const row of data) map[row.clave] = row.valor

    return {
      maxSizeMB: parseFloat(map['compresion_max_kb']  ?? '250') / 1000,
      maxWidth:  parseInt(map['compresion_max_width'] ?? '1024', 10),
      calidad:   parseFloat(map['compresion_calidad'] ?? '0.70'),
    }
  } catch {
    return DEFAULTS
  }
}
