import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { User } from 'lucide-react'
import type { NivelGondolero } from '@/types'
import { ZonasSelector } from './zonas-selector'
import { DatosForm } from './datos-form'
import { PasswordForm } from './password-form'
import { LogoutButton } from './logout-button'
import { DistriSection } from './distri-section'
import { CodigoGondolero } from './codigo-gondolero'
import { ColapsableSection } from './colapsable-section'

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
      .select('nombre, alias, nivel, distri_id, celular, codigo_gondolero')
      .eq('id', user.id).single(),
    admin.from('zonas').select('id, nombre, tipo').order('tipo').order('nombre'),
    admin.from('gondolero_zonas').select('zona_id').eq('gondolero_id', user.id),
  ])

  const profile = profileRes.data
  const todasLasZonas = zonasRes.data ?? []
  const zonasActuales = (gondoleroZonasRes.data ?? []).map((gz: { zona_id: string }) => gz.zona_id)

  // Distribuidoras activas (muchas a muchas, fuente = solicitudes estado='aprobada')
  let distrisActivas: { solicitudId: string; distri_id: string; distri_nombre: string }[] = []
  let solicitudPendiente: { distri_id: string; distri_nombre: string } | null = null
  let invitacionesPendientes: { id: string; distri_id: string; distri_nombre: string }[] = []
  try {
    const { data: solicitudesData } = await admin
      .from('gondolero_distri_solicitudes')
      .select('id, distri_id, estado, iniciado_por, distri:distribuidoras(razon_social)')
      .eq('gondolero_id', user.id)
      .in('estado', ['aprobada', 'pendiente'])
      .order('created_at', { ascending: false })

    for (const s of solicitudesData ?? []) {
      const sd = s as { id: string; distri_id: string; estado: string; iniciado_por: string | null; distri: { razon_social: string } | { razon_social: string }[] | null }
      const distriNombre = Array.isArray(sd.distri)
        ? (sd.distri as { razon_social: string }[])[0]?.razon_social
        : (sd.distri as { razon_social: string } | null)?.razon_social
      const nombre = distriNombre ?? 'Distribuidora'

      if (sd.estado === 'aprobada') {
        distrisActivas.push({ solicitudId: sd.id, distri_id: sd.distri_id, distri_nombre: nombre })
      } else if (sd.estado === 'pendiente') {
        if (sd.iniciado_por === 'distri') {
          invitacionesPendientes.push({ id: sd.id, distri_id: sd.distri_id, distri_nombre: nombre })
        } else if (!solicitudPendiente) {
          solicitudPendiente = { distri_id: sd.distri_id, distri_nombre: nombre }
        }
      }
    }
  } catch {
    // Tabla puede no existir aún en la DB — ignorar
  }

  // Nombre de la distri principal (profiles.distri_id) para el header
  let distriPrincipalNombre: string | null = null
  if (profile?.distri_id) {
    const found = distrisActivas.find(d => d.distri_id === profile.distri_id)
    distriPrincipalNombre = found?.distri_nombre ?? null
    if (!distriPrincipalNombre && distrisActivas.length > 0) {
      distriPrincipalNombre = distrisActivas[0].distri_nombre
    }
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
            {distriPrincipalNombre && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">🚛 {distriPrincipalNombre}{distrisActivas.length > 1 ? ` +${distrisActivas.length - 1}` : ''}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        {/* ── Mis zonas de trabajo — colapsable, cerrada por defecto ── */}
        {todasLasZonas.length > 0 && (
          <ColapsableSection
            title="Mis zonas de trabajo"
            badge={zonasActuales.length > 0 ? `${zonasActuales.length} zona${zonasActuales.length !== 1 ? 's' : ''}` : null}
            defaultOpen={false}
          >
            <ZonasSelector
              todasLasZonas={todasLasZonas as { id: string; nombre: string; tipo: string }[]}
              zonasActuales={zonasActuales}
            />
          </ColapsableSection>
        )}

        {/* ── Mi código de gondolero ── */}
        {profile?.codigo_gondolero && (
          <CodigoGondolero codigo={profile.codigo_gondolero} />
        )}

        {/* ── Mis distribuidoras — colapsable, cerrada por defecto ── */}
        <ColapsableSection
          title={distrisActivas.length > 1 ? 'Mis distribuidoras' : 'Mi distribuidora'}
          badge={
            invitacionesPendientes.length > 0
              ? invitacionesPendientes.length
              : distrisActivas.length > 0
                ? distrisActivas.length > 1 ? distrisActivas.length : null
                : null
          }
          badgeColor={invitacionesPendientes.length > 0 ? 'red' : 'verde'}
          defaultOpen={false}
        >
          <DistriSection
            distrisActivas={distrisActivas}
            solicitudPendiente={solicitudPendiente}
            invitacionesPendientes={invitacionesPendientes}
            gondoleroId={user.id}
          />
        </ColapsableSection>

        {/* ── Mis datos — abierta por defecto ── */}
        <ColapsableSection title="Mis datos" defaultOpen={true}>
          <DatosForm
            nombre={profile?.nombre ?? ''}
            celular={profile?.celular ?? ''}
            email={user.email ?? ''}
          />
        </ColapsableSection>

        {/* ── Seguridad — colapsable, cerrada por defecto ── */}
        <ColapsableSection title="Seguridad" defaultOpen={false}>
          <PasswordForm email={user.email ?? ''} />
        </ColapsableSection>

        {/* ── Cuenta ── */}
        <div className="space-y-3 pt-2">
          <LogoutButton />
          <p className="text-center text-[11px] text-gray-300">GondolApp v1.0</p>
        </div>

      </div>
    </div>
  )
}
