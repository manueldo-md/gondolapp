import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PackageX, Store, Megaphone, UserX } from 'lucide-react'
import { diasRestantes, calcularPorcentaje, tiempoRelativo } from '@/lib/utils'

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AlertasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = makeAdmin()

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()
  const distriId = profile?.distri_id
  if (!distriId) redirect('/auth')

  const { data: gondoleroRows } = await admin
    .from('profiles')
    .select('id, nombre, alias')
    .eq('distri_id', distriId)
    .eq('tipo_actor', 'gondolero')
  const gondoleroIds = (gondoleroRows ?? []).map((g: { id: string }) => g.id)

  // Date helpers
  const sieteAtras       = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  const treintaAtras     = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sesentaAtras     = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  const catorceDiasAtras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const tresDiasAdelante = new Date(Date.now() + 3  * 24 * 60 * 60 * 1000)

  // ── TIPO 1: Quiebre de stock ───────────────────────────────────────────────
  interface Quiebre { comercioId: string; nombre: string; veces: number; ultimaVez: string }
  let quiebres: Quiebre[] = []

  if (gondoleroIds.length > 0) {
    const { data: qRaw } = await admin
      .from('fotos')
      .select('comercio_id, created_at, comercios(nombre)')
      .in('gondolero_id', gondoleroIds)
      .eq('declaracion', 'producto_no_encontrado')
      .eq('estado', 'aprobada')
      .gte('created_at', sieteAtras.toISOString())
      .order('created_at', { ascending: false })
      .limit(500)

    const qMap = new Map<string, Quiebre>()
    for (const f of qRaw ?? []) {
      const fo = f as unknown as { comercio_id: string; created_at: string; comercios: { nombre: string } | null }
      const entry = qMap.get(fo.comercio_id)
      if (entry) {
        entry.veces++
      } else {
        qMap.set(fo.comercio_id, {
          comercioId: fo.comercio_id,
          nombre:     fo.comercios?.nombre ?? 'Comercio',
          veces:      1,
          ultimaVez:  fo.created_at,
        })
      }
    }
    quiebres = Array.from(qMap.values()).sort((a, b) => b.veces - a.veces)
  }

  // ── TIPO 2: Comercios sin visita ──────────────────────────────────────────
  interface ComercioSinVisita { id: string; nombre: string; diasSinVisita: number }
  let sinVisita: ComercioSinVisita[] = []

  if (gondoleroIds.length > 0) {
    // Fotos en los últimos 60 días
    const { data: fotasRec } = await admin
      .from('fotos')
      .select('comercio_id, created_at')
      .in('gondolero_id', gondoleroIds)
      .gte('created_at', sesentaAtras.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000)

    // Última visita por comercio
    const lastVisitMap = new Map<string, Date>()
    for (const f of fotasRec ?? []) {
      const fo = f as { comercio_id: string; created_at: string }
      if (!lastVisitMap.has(fo.comercio_id)) {
        lastVisitMap.set(fo.comercio_id, new Date(fo.created_at))
      }
    }

    // Filtrar los que no fueron visitados en 30 días
    const sinVisitaEntries = [...lastVisitMap.entries()]
      .filter(([, d]) => d < treintaAtras)
      .sort((a, b) => a[1].getTime() - b[1].getTime())
      .slice(0, 50)

    if (sinVisitaEntries.length > 0) {
      const sinVisitaIds = sinVisitaEntries.map(([id]) => id)
      const { data: comerciosData } = await admin
        .from('comercios')
        .select('id, nombre')
        .in('id', sinVisitaIds)

      const comMap = new Map((comerciosData ?? []).map((c: { id: string; nombre: string }) => [c.id, c.nombre]))
      sinVisita = sinVisitaEntries.map(([id, fecha]) => ({
        id,
        nombre:        comMap.get(id) ?? 'Comercio',
        diasSinVisita: Math.floor((Date.now() - fecha.getTime()) / (24 * 60 * 60 * 1000)),
      }))
    }
  }

  // ── TIPO 3: Campañas en riesgo ────────────────────────────────────────────
  const { data: campanasRaw } = await admin
    .from('campanas')
    .select('id, nombre, objetivo_comercios, comercios_relevados, fecha_fin')
    .eq('distri_id', distriId)
    .eq('estado', 'activa')
    .not('fecha_fin', 'is', null)
    .not('objetivo_comercios', 'is', null)
    .order('fecha_fin', { ascending: true })

  const campanasRiesgo = (campanasRaw ?? []).filter(c =>
    new Date(c.fecha_fin!) < tresDiasAdelante &&
    (c.comercios_relevados ?? 0) < (c.objetivo_comercios ?? 0) * 0.5
  )

  // ── TIPO 4: Gondoleros inactivos ──────────────────────────────────────────
  interface GondoleroInactivo { id: string; nombre: string; alias: string | null; diasSinActividad: number }
  let gondolerosInactivos: GondoleroInactivo[] = []

  if (gondoleroIds.length > 0) {
    const { data: gondActivos } = await admin
      .from('fotos')
      .select('gondolero_id')
      .in('gondolero_id', gondoleroIds)
      .gte('created_at', catorceDiasAtras.toISOString())
    const activoSet = new Set((gondActivos ?? []).map((f: { gondolero_id: string }) => f.gondolero_id))

    const inactivoProfiles = (gondoleroRows ?? []).filter(
      (g: { id: string }) => !activoSet.has(g.id)
    ) as { id: string; nombre: string; alias: string | null }[]

    if (inactivoProfiles.length > 0) {
      const { data: ultimasFotos } = await admin
        .from('fotos')
        .select('gondolero_id, created_at')
        .in('gondolero_id', inactivoProfiles.map(g => g.id))
        .order('created_at', { ascending: false })
        .limit(500)

      const ultimaMap = new Map<string, Date>()
      for (const f of ultimasFotos ?? []) {
        const fo = f as { gondolero_id: string; created_at: string }
        if (!ultimaMap.has(fo.gondolero_id)) ultimaMap.set(fo.gondolero_id, new Date(fo.created_at))
      }

      gondolerosInactivos = inactivoProfiles.map(g => ({
        id:               g.id,
        nombre:           g.nombre,
        alias:            g.alias,
        diasSinActividad: ultimaMap.has(g.id)
          ? Math.floor((Date.now() - ultimaMap.get(g.id)!.getTime()) / (24 * 60 * 60 * 1000))
          : -1, // nunca tuvo fotos
      })).sort((a, b) => b.diasSinActividad - a.diasSinActividad)
    }
  }

  const totalAlertas = quiebres.length + sinVisita.length + campanasRiesgo.length + gondolerosInactivos.length

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
        {totalAlertas > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {totalAlertas}
          </span>
        )}
      </div>

      {/* ── Tipo 1: Quiebre de stock ── */}
      <AlertSection
        icon={<PackageX size={18} className="text-red-500" />}
        titulo="Quiebre de stock"
        badge={quiebres.length}
        badgeColor="bg-red-500"
      >
        {quiebres.length === 0 ? (
          <TodoOrden />
        ) : (
          quiebres.map(q => (
            <div key={q.comercioId} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{q.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  No encontrado {q.veces} {q.veces === 1 ? 'vez' : 'veces'} · última vez {tiempoRelativo(q.ultimaVez)}
                </p>
              </div>
              <Link
                href="/distribuidora/gondolas"
                className="ml-3 shrink-0 text-xs font-semibold text-gondo-amber-400 hover:underline"
              >
                Ver fotos
              </Link>
            </div>
          ))
        )}
      </AlertSection>

      {/* ── Tipo 2: Comercios sin visita ── */}
      <AlertSection
        icon={<Store size={18} className="text-amber-500" />}
        titulo="Comercios sin visita (últimos 30 días)"
        badge={sinVisita.length}
        badgeColor="bg-amber-400"
      >
        {sinVisita.length === 0 ? (
          <TodoOrden />
        ) : (
          sinVisita.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{c.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{c.diasSinVisita} días sin visita</p>
              </div>
              <Link
                href="/distribuidora/campanas"
                className="ml-3 shrink-0 text-xs font-semibold text-gondo-amber-400 hover:underline"
              >
                Asignar a campaña
              </Link>
            </div>
          ))
        )}
      </AlertSection>

      {/* ── Tipo 3: Campañas en riesgo ── */}
      <AlertSection
        icon={<Megaphone size={18} className="text-orange-500" />}
        titulo="Campañas en riesgo"
        badge={campanasRiesgo.length}
        badgeColor="bg-orange-500"
      >
        {campanasRiesgo.length === 0 ? (
          <TodoOrden />
        ) : (
          campanasRiesgo.map(c => {
            const progreso = calcularPorcentaje(c.comercios_relevados ?? 0, c.objetivo_comercios ?? 0)
            const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 truncate mr-3">{c.nombre}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    {dias !== null && (
                      <span className="text-xs font-semibold text-red-500">
                        {dias === 0 ? 'Último día' : `${dias}d`}
                      </span>
                    )}
                    <Link
                      href={`/distribuidora/campanas/${c.id}`}
                      className="text-xs font-semibold text-gondo-amber-400 hover:underline"
                    >
                      Ver campaña
                    </Link>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {c.comercios_relevados ?? 0} / {c.objetivo_comercios} comercios ({Math.round(progreso)}%)
                </p>
              </div>
            )
          })
        )}
      </AlertSection>

      {/* ── Tipo 4: Gondoleros inactivos ── */}
      <AlertSection
        icon={<UserX size={18} className="text-amber-500" />}
        titulo="Gondoleros sin actividad (últimos 14 días)"
        badge={gondolerosInactivos.length}
        badgeColor="bg-amber-400"
      >
        {gondolerosInactivos.length === 0 ? (
          <TodoOrden />
        ) : (
          gondolerosInactivos.map(g => (
            <div key={g.id} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{g.nombre}</p>
                {g.alias && <p className="text-xs text-gray-400">@{g.alias}</p>}
                <p className="text-xs text-gray-500 mt-0.5">
                  {g.diasSinActividad < 0
                    ? 'Sin fotos registradas'
                    : `${g.diasSinActividad} días sin actividad`}
                </p>
              </div>
              <Link
                href="/distribuidora/gondoleros"
                className="ml-3 shrink-0 text-xs font-semibold text-gondo-amber-400 hover:underline"
              >
                Ver perfil
              </Link>
            </div>
          ))
        )}
      </AlertSection>

    </div>
  )
}

function AlertSection({
  icon,
  titulo,
  badge,
  badgeColor,
  children,
}: {
  icon: React.ReactNode
  titulo: string
  badge: number
  badgeColor: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-gray-700">{titulo}</h2>
        {badge > 0 && (
          <span className={`${badgeColor} text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center`}>
            {badge}
          </span>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
        {children}
      </div>
    </section>
  )
}

function TodoOrden() {
  return (
    <div className="px-4 py-5 text-center">
      <p className="text-sm text-gray-400">✅ Todo en orden</p>
    </div>
  )
}
