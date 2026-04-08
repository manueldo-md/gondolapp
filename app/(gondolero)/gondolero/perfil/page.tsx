import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { User } from 'lucide-react'
import type { NivelGondolero } from '@/types'
import { getConfig } from '@/lib/config'
import { calcularNivelMensual } from '@/lib/nivel'
import { LocalidadesSelector } from './zonas-selector'
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

  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

  const [profileRes, gondoleroLocalidadesRes, fotosEsteMesRes, config] = await Promise.all([
    admin.from('profiles')
      .select('nombre, alias, nivel, distri_id, celular, codigo_gondolero, tipo_actor')
      .eq('id', user.id).single(),
    admin.from('gondolero_localidades').select('localidad_id').eq('gondolero_id', user.id),
    admin.from('fotos')
      .select('id', { count: 'exact', head: true })
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada')
      .gte('created_at', inicioMes.toISOString()),
    getConfig(),
  ])

  const profile = profileRes.data
  const localidadesActuales = (gondoleroLocalidadesRes.data ?? []).map((gl: { localidad_id: number }) => gl.localidad_id)

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

  // Invitaciones de repositoras y distribuidoras a fixers
  let repoInvitacionesPendientes: { id: string; repo_id: string; repo_nombre: string }[] = []
  let distriFixerInvitacionesPendientes: { id: string; distri_id: string; distri_nombre: string }[] = []
  if (profile?.tipo_actor === 'fixer') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: repoSols } = await (admin as any)
        .from('fixer_repo_solicitudes')
        .select('id, repositora_id, repositora:repositoras!repositora_id(razon_social)')
        .eq('fixer_id', user.id)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false })
      for (const s of repoSols ?? []) {
        const rn = Array.isArray(s.repositora)
          ? (s.repositora as { razon_social: string }[])[0]?.razon_social
          : (s.repositora as { razon_social: string } | null)?.razon_social
        repoInvitacionesPendientes.push({ id: s.id, repo_id: s.repositora_id, repo_nombre: rn ?? 'Repositora' })
      }
    } catch { /* ignore */ }

    try {
      const { data: distriSols } = await admin
        .from('fixer_distri_solicitudes')
        .select('id, distri_id, distri:distribuidoras!distri_id(razon_social)')
        .eq('fixer_id', user.id)
        .eq('estado', 'pendiente')
        .eq('iniciado_por', 'distri')
        .order('created_at', { ascending: false })
      for (const s of distriSols ?? []) {
        const dn = Array.isArray(s.distri)
          ? (s.distri as { razon_social: string }[])[0]?.razon_social
          : (s.distri as { razon_social: string } | null)?.razon_social
        distriFixerInvitacionesPendientes.push({ id: s.id, distri_id: s.distri_id, distri_nombre: dn ?? 'Distribuidora' })
      }
    } catch { /* ignore */ }
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

  // Nivel calculado dinámicamente del mes en curso (fuente de verdad)
  const fotosEsteMes = fotosEsteMesRes.count ?? 0
  const nivel = calcularNivelMensual(
    fotosEsteMes,
    config.niveles.fotosCasualAActivo,
    config.niveles.fotosActivoAPro,
  )
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
        <ColapsableSection
          title="Mis zonas de trabajo"
          badge={localidadesActuales.length > 0 ? `${localidadesActuales.length} zona${localidadesActuales.length !== 1 ? 's' : ''}` : null}
          defaultOpen={false}
        >
          <LocalidadesSelector localidadesActuales={localidadesActuales} />
        </ColapsableSection>

        {/* ── Mi distribuidora / organización — colapsable, cerrada por defecto ── */}
        {/* Incluye código personal siempre (aunque sea null) */}
        <ColapsableSection
          title={
            profile?.tipo_actor === 'fixer'
              ? 'Mi organización'
              : distrisActivas.length > 1 ? 'Mis distribuidoras' : 'Mi distribuidora'
          }
          badge={(() => {
            const totalPending = invitacionesPendientes.length + repoInvitacionesPendientes.length + distriFixerInvitacionesPendientes.length
            if (totalPending > 0) return totalPending
            if (distrisActivas.length > 1) return distrisActivas.length
            return null
          })()}
          badgeColor={(invitacionesPendientes.length + repoInvitacionesPendientes.length + distriFixerInvitacionesPendientes.length) > 0 ? 'red' : 'verde'}
          defaultOpen={false}
        >
          <CodigoGondolero codigo={profile?.codigo_gondolero ?? null} />
          <DistriSection
            distrisActivas={distrisActivas}
            solicitudPendiente={solicitudPendiente}
            invitacionesPendientes={invitacionesPendientes}
            gondoleroId={user.id}
            repoInvitacionesPendientes={repoInvitacionesPendientes}
            distriFixerInvitacionesPendientes={distriFixerInvitacionesPendientes}
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
