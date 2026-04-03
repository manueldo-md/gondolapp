import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Settings } from 'lucide-react'
import { ConfigPanel } from './config-panel'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface ConfigRow {
  clave: string
  valor: string
  tipo: string
  descripcion: string
  seccion: string
  updated_at: string | null
  updated_by: string | null
  updater_nombre: string | null
}

export default async function ConfiguracionPage() {
  const admin = adminClient()

  const { data: rows } = await admin
    .from('configuracion')
    .select('clave, valor, tipo, descripcion, seccion, updated_at, updated_by')
    .order('seccion')
    .order('clave')

  // Enrich with updater names
  const updaterIds = [...new Set((rows ?? []).map((r: { updated_by: string | null }) => r.updated_by).filter(Boolean))]
  const updaterMap: Record<string, string> = {}
  if (updaterIds.length > 0) {
    const { data: updaters } = await admin
      .from('profiles')
      .select('id, nombre')
      .in('id', updaterIds)
    ;(updaters ?? []).forEach((u: { id: string; nombre: string }) => {
      updaterMap[u.id] = u.nombre
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: ConfigRow[] = (rows ?? []).map((r: any) => ({
    ...r,
    tipo: r.tipo ?? 'numero',
    descripcion: r.descripcion ?? r.clave,
    seccion: r.seccion ?? 'operacion',
    updated_at: r.updated_at ?? null,
    updated_by: r.updated_by ?? null,
    updater_nombre: r.updated_by ? (updaterMap[r.updated_by] ?? null) : null,
  }))

  const secciones = [
    { key: 'fotos',      label: 'Fotos',      emoji: '📷' },
    { key: 'gps',        label: 'GPS',        emoji: '📍' },
    { key: 'economia',   label: 'Economía',   emoji: '💰' },
    { key: 'niveles',    label: 'Niveles',    emoji: '⭐' },
    { key: 'operacion',  label: 'Operación',  emoji: '⚙️' },
    { key: 'compresion', label: 'Compresión', emoji: '🗜️' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-[#1E1B4B] rounded-xl flex items-center justify-center shrink-0">
          <Settings size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
          <p className="text-sm text-gray-500 mt-0.5">Parámetros globales del sistema</p>
        </div>
      </div>

      <ConfigPanel config={config} secciones={secciones} />
    </div>
  )
}
