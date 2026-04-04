import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Camera, Clock, Users, Store, ChevronRight } from 'lucide-react'
import { diasRestantes, calcularPorcentaje } from '@/lib/utils'

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function DashboardPage() {
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

  // Gondoleros actuales
  const { data: gondoleroRows } = await admin
    .from('profiles')
    .select('id')
    .eq('distri_id', distriId)
    .eq('tipo_actor', 'gondolero')
  const gondoleroIds = (gondoleroRows ?? []).map((g: { id: string }) => g.id)

  // Gondoleros históricos (alguna vez vinculados)
  const { data: historialRows } = await admin
    .from('gondolero_distri_solicitudes')
    .select('gondolero_id')
    .eq('distri_id', distriId)
    .eq('estado', 'aprobada')
  const gondoleroActualesSet = new Set(gondoleroIds)
  const historicosIds = (historialRows ?? [])
    .map((s: { gondolero_id: string }) => s.gondolero_id)
    .filter(id => !gondoleroActualesSet.has(id))

  // IDs combinados — nunca vacío (NULL_UUID evita IN() vacío en PostgREST)
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'
  const todosIds = [...gondoleroIds, ...historicosIds]
  const safeIds  = todosIds.length > 0 ? todosIds : [NULL_UUID]

  // Date helpers
  const hoyInicio = new Date()
  hoyInicio.setHours(0, 0, 0, 0)
  const semanaAtras  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  const sieteAtras   = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000)
  const catDiasAtras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const tresMasAdelante = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  // ── Métricas ──────────────────────────────────────────────────────────────
  const fotasHoyPorCampana = new Map<string, number>()

  const [
    { count: fotasHoyCount },
    { count: fotasPendCount },
    { data: fHoyDet },
    { data: fSem },
  ] = await Promise.all([
    admin.from('fotos').select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeIds)
      .gte('created_at', hoyInicio.toISOString()),
    admin.from('fotos').select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeIds)
      .eq('estado', 'pendiente'),
    admin.from('fotos').select('gondolero_id, campana_id')
      .in('gondolero_id', safeIds)
      .gte('created_at', hoyInicio.toISOString()),
    admin.from('fotos').select('comercio_id')
      .in('gondolero_id', safeIds)
      .gte('created_at', semanaAtras.toISOString()),
  ])

  const fotasHoy   = fotasHoyCount ?? 0
  const fotasPend  = fotasPendCount ?? 0
  const gondActHoy = new Set((fHoyDet ?? []).map((f: { gondolero_id: string }) => f.gondolero_id)).size
  const comSemana  = new Set((fSem ?? []).map((f: { comercio_id: string }) => f.comercio_id)).size
  for (const f of fHoyDet ?? []) {
    const fo = f as { gondolero_id: string; campana_id: string | null }
    if (fo.campana_id) {
      fotasHoyPorCampana.set(fo.campana_id, (fotasHoyPorCampana.get(fo.campana_id) ?? 0) + 1)
    }
  }

  // ── Campañas activas ──────────────────────────────────────────────────────
  const { data: campanasRaw } = await admin
    .from('campanas')
    .select('id, nombre, objetivo_comercios, comercios_relevados, fecha_fin')
    .eq('distri_id', distriId)
    .eq('estado', 'activa')
    .order('fecha_fin', { ascending: true })
  const campanas = campanasRaw ?? []

  // ── Preview de alertas ────────────────────────────────────────────────────
  const alertasPreview: { tipo: string; descripcion: string; href: string }[] = []
  let alertasTotal = 0

  // Quiebres de stock — usa safeIds (actuales + históricos)
  const { data: qRaw } = await admin
    .from('fotos')
    .select('comercio_id, comercios(nombre)')
    .in('gondolero_id', safeIds)
    .eq('declaracion', 'producto_no_encontrado')
    .eq('estado', 'aprobada')
    .gte('created_at', sieteAtras.toISOString())

  const vistos = new Set<string>()
  for (const f of qRaw ?? []) {
    const fo = f as unknown as { comercio_id: string; comercios: { nombre: string } | null }
    if (!vistos.has(fo.comercio_id)) {
      vistos.add(fo.comercio_id)
      alertasTotal++
      if (alertasPreview.length < 3) {
        alertasPreview.push({
          tipo: '🔴 Quiebre de stock',
          descripcion: fo.comercios?.nombre ?? 'Comercio',
          href: `/distribuidora/gondolas?comercio_id=${fo.comercio_id}&declaracion=producto_no_encontrado`,
        })
      }
    }
  }

  // Gondoleros inactivos — solo actuales (alertar por desvinculados no tiene sentido)
  if (gondoleroIds.length > 0) {
    const { data: gondActivos } = await admin
      .from('fotos').select('gondolero_id')
      .in('gondolero_id', gondoleroIds)
      .gte('created_at', catDiasAtras.toISOString())
    const activoSet = new Set((gondActivos ?? []).map((f: { gondolero_id: string }) => f.gondolero_id))
    const inactivosCnt = gondoleroIds.filter(id => !activoSet.has(id)).length
    alertasTotal += inactivosCnt
    if (inactivosCnt > 0 && alertasPreview.length < 3) {
      alertasPreview.push({
        tipo: '🟡 Gondolero inactivo',
        descripcion: `${inactivosCnt} sin actividad en 14 días`,
        href: '/distribuidora/gondoleros',
      })
    }
  }

  // Campañas en riesgo
  const campanasRiesgo = campanas.filter(c =>
    c.fecha_fin &&
    new Date(c.fecha_fin) < tresMasAdelante &&
    c.objetivo_comercios != null &&
    (c.comercios_relevados ?? 0) < c.objetivo_comercios * 0.5
  )
  alertasTotal += campanasRiesgo.length
  for (const c of campanasRiesgo) {
    if (alertasPreview.length < 3) {
      alertasPreview.push({
        tipo: '🟠 Campaña en riesgo',
        descripcion: c.nombre,
        href: `/distribuidora/campanas/${c.id}`,
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Métricas del día ── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Métricas del día</h2>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard label="Fotos recibidas hoy"    value={fotasHoy}   icon={Camera} />
          <MetricCard label="Pendientes de revisión" value={fotasPend}  icon={Clock}  highlight={fotasPend > 0} href="/distribuidora/gondolas" />
          <MetricCard label="Gondoleros activos hoy" value={gondActHoy} icon={Users}  />
          <MetricCard label="Comercios esta semana"  value={comSemana}  icon={Store}  />
        </div>
      </section>

      {/* ── Campañas activas ── */}
      {campanas.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Campañas activas</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {campanas.map(c => {
              const progreso = calcularPorcentaje(c.comercios_relevados ?? 0, c.objetivo_comercios ?? 0)
              const dias     = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
              const fotasHoyC = fotasHoyPorCampana.get(c.id) ?? 0
              return (
                <div key={c.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-900 truncate mr-3">{c.nombre}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {fotasHoyC > 0 && (
                        <span className="text-xs font-semibold text-gondo-verde-400">+{fotasHoyC} hoy</span>
                      )}
                      {dias !== null && (
                        <span className={`text-xs font-medium ${dias <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                          {dias === 0 ? 'Último día' : `${dias}d`}
                        </span>
                      )}
                    </div>
                  </div>
                  {c.objetivo_comercios ? (
                    <>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gondo-amber-400 rounded-full transition-all"
                          style={{ width: `${progreso}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {c.comercios_relevados ?? 0} / {c.objetivo_comercios} comercios
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400">Sin objetivo definido</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Alertas (preview) ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Alertas activas</h2>
            {alertasTotal > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {alertasTotal}
              </span>
            )}
          </div>
          <Link
            href="/distribuidora/alertas"
            className="text-sm text-gondo-amber-400 font-medium flex items-center gap-0.5 hover:underline"
          >
            Ver todas <ChevronRight size={14} />
          </Link>
        </div>

        {alertasTotal === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center">
            <p className="text-sm text-gray-500">✅ Sin alertas activas</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {alertasPreview.map((a, i) => (
              <Link
                key={i}
                href={a.href}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div>
                  <p className="text-[11px] font-semibold text-gray-400">{a.tipo}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{a.descripcion}</p>
                </div>
                <ChevronRight size={15} className="text-gray-400 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  highlight,
  href,
}: {
  label: string
  value: number
  icon: React.ElementType
  highlight?: boolean
  href?: string
}) {
  const inner = (
    <div className={`bg-white rounded-xl border p-4 ${highlight ? 'border-gondo-amber-400' : 'border-gray-200'} ${href ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className={highlight ? 'text-gondo-amber-400' : 'text-gray-400'} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${highlight ? 'text-gondo-amber-400' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
