import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { User } from 'lucide-react'
import type { NivelGondolero } from '@/types'
import { ZonasSelector } from './zonas-selector'
import { DatosForm } from './datos-form'
import { PasswordForm } from './password-form'
import { LogoutButton } from './logout-button'

const NIVEL_COLOR: Record<NivelGondolero, string> = {
  casual: 'bg-gray-100 text-gray-600',
  activo: 'bg-blue-100 text-blue-700',
  pro:    'bg-amber-100 text-amber-700',
}
const NIVEL_LABEL: Record<NivelGondolero, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}

export default async function PerfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [profileRes, zonasRes, gondoleroZonasRes] = await Promise.all([
    admin.from('profiles')
      .select('nombre, alias, nivel, distri_id, celular')
      .eq('id', user.id).single(),
    admin.from('zonas').select('id, nombre, tipo').order('tipo').order('nombre'),
    admin.from('gondolero_zonas').select('zona_id').eq('gondolero_id', user.id),
  ])

  const profile = profileRes.data
  const todasLasZonas = zonasRes.data ?? []
  const zonasActuales = (gondoleroZonasRes.data ?? []).map((gz: { zona_id: string }) => gz.zona_id)

  // Nombre de distribuidora si está vinculado
  let distriNombre: string | null = null
  if (profile?.distri_id) {
    const { data: distri } = await admin
      .from('distribuidoras').select('razon_social').eq('id', profile.distri_id).single()
    distriNombre = distri?.razon_social ?? null
  }

  const nivel = (profile?.nivel ?? 'casual') as NivelGondolero
  const nombre = profile?.nombre ?? 'Gondolero'
  const inicial = nombre.charAt(0).toUpperCase()

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4">
        <div className="flex items-center gap-2 mb-4">
          <User size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Perfil</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gondo-verde-400 flex items-center justify-center shrink-0">
            <span className="text-white text-2xl font-bold">{inicial}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900 truncate">{nombre}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[nivel]}`}>
                {NIVEL_LABEL[nivel]}
              </span>
            </div>
            {profile?.alias && (
              <p className="text-sm text-gray-400">@{profile.alias}</p>
            )}
            {distriNombre && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">🚛 {distriNombre}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        {/* ── Mis zonas de trabajo ── */}
        {todasLasZonas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <ZonasSelector
              todasLasZonas={todasLasZonas as { id: string; nombre: string; tipo: string }[]}
              zonasActuales={zonasActuales}
            />
          </div>
        )}

        {/* ── Mis datos ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Mis datos</h2>
          <DatosForm
            nombre={profile?.nombre ?? ''}
            celular={profile?.celular ?? ''}
            email={user.email ?? ''}
          />
        </div>

        {/* ── Seguridad ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Seguridad</h2>
          <PasswordForm email={user.email ?? ''} />
        </div>

        {/* ── Cuenta ── */}
        <div className="space-y-3 pt-2">
          <LogoutButton />
          <p className="text-center text-[11px] text-gray-300">GondolApp v1.0</p>
        </div>

      </div>
    </div>
  )
}
