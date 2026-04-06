import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Users, Store, Megaphone, Camera, Star, CheckCircle2,
  AlertTriangle, ChevronRight, MapPin, Package, TrendingUp, Clock,
  PackageX,
} from 'lucide-react'
import { diasRestantes, formatearPuntos } from '@/lib/utils'
import { getGondolerosDeDistri } from '@/lib/utils-distri'

// ── Tipos internos ─────────────────────────────────────────────────────────────

type GondoleroProfile = {
  id: string
  alias: string | null
  nombre: string | null
  nivel: string | null
  fotos_aprobadas: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NULL_UUID = '00000000-0000-0000-0000-000000000000'
function safe(ids: string[]) { return ids.length > 0 ? ids : [NULL_UUID] }

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtSemana(d: Date) { return `${d.getDate()} ${MESES[d.getMonth()]}` }

const TIPO_LABEL: Record<string, string> = {
  autoservicio: 'Autoservicio',
  almacen:      'Almacén',
  kiosco:       'Kiosco',
  mayorista:    'Mayorista',
  dietetica:    'Dietética',
  otro:         'Otro',
}

const NIVEL_BADGE: Record<string, string> = {
  casual: 'bg-gray-100 text-gray-500',
  activo: 'bg-blue-50 text-blue-600',
  pro:    'bg-purple-50 text-purple-600',
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = makeAdmin()

  // distri_id del usuario
  const { data: profile } = await admin
    .from('profiles').select('distri_id').eq('id', user.id).single()
  const distriId = profile?.distri_id
  if (!distriId) redirect('/auth')

  // Gondoleros vinculados (activos)
  const gondoleroIds = await getGondolerosDeDistri(distriId, admin, false)
  const safeGond = safe(gondoleroIds)

  // ── Fechas de referencia ──────────────────────────────────────────────────
  const ahora        = new Date()
  const mesInicio    = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const hace7d       = new Date(Date.now() -  7 * 86400_000)
  const hace14d      = new Date(Date.now() - 14 * 86400_000)
  const hace30d      = new Date(Date.now() - 30 * 86400_000)
  const hace56d      = new Date(Date.now() - 56 * 86400_000)  // 8 semanas
  const en7d         = new Date(Date.now() +  7 * 86400_000)

  // ── Consultas en paralelo ─────────────────────────────────────────────────
  const [
    gondoleroProfilesRes,
    fotosEsteMesRes,
    misionesEsteMesRes,
    misiones90dRes,
    misiones8semRes,
    movPuntosRes,
    campanasActivasRes,
    comerciosPendientesRes,
    fotos14dRes,
    quiebreStockRes,
    alertasIgnoradasRes,
  ] = await Promise.all([
    // Perfiles de gondoleros
    admin.from('profiles')
      .select('id, alias, nombre, nivel, fotos_aprobadas')
      .in('id', safeGond),

    // Fotos de este mes (para KPIs + stats por gondolero)
    admin.from('fotos')
      .select('id, gondolero_id, estado, created_at')
      .in('gondolero_id', safeGond)
      .gte('created_at', mesInicio.toISOString()),

    // Misiones de este mes
    admin.from('misiones')
      .select('id, gondolero_id, estado, puntos_total, created_at')
      .in('gondolero_id', safeGond)
      .gte('created_at', mesInicio.toISOString()),

    // Misiones aprobadas últimos 90 días (cobertura por localidad + tipo)
    admin.from('misiones')
      .select(`
        id, gondolero_id, created_at,
        comercio:comercios ( id, tipo, localidad_id, localidades ( id, nombre ) )
      `)
      .in('gondolero_id', safeGond)
      .eq('estado', 'aprobada')
      .gte('created_at', hace56d.toISOString()),

    // Misiones aprobadas últimas 8 semanas (gráfico de evolución)
    admin.from('misiones')
      .select('id, created_at')
      .in('gondolero_id', safeGond)
      .eq('estado', 'aprobada')
      .gte('created_at', hace56d.toISOString()),

    // Movimientos de puntos este mes
    admin.from('movimientos_puntos')
      .select('monto')
      .in('gondolero_id', safeGond)
      .eq('tipo', 'credito')
      .gte('created_at', mesInicio.toISOString()),

    // Campañas activas propias
    admin.from('campanas')
      .select('id, nombre, tipo, objetivo_comercios, comercios_relevados, fecha_fin')
      .eq('distri_id', distriId)
      .eq('estado', 'activa')
      .order('fecha_fin', { ascending: true }),

    // Comercios sin validar registrados por gondoleros de la distri
    admin.from('comercios')
      .select('id, nombre, tipo, direccion, created_at')
      .in('registrado_por', safeGond)
      .eq('validado', false)
      .order('created_at', { ascending: false })
      .limit(5),

    // Actividad reciente (14 días) para badge inactivo
    admin.from('fotos')
      .select('gondolero_id')
      .in('gondolero_id', safeGond)
      .gte('created_at', hace14d.toISOString()),

    // Quiebre de stock: fotos con producto no encontrado, últimos 7 días
    admin.from('fotos')
      .select('comercio_id, created_at, comercios(nombre)')
      .in('gondolero_id', safeGond)
      .eq('declaracion', 'producto_no_encontrado')
      .eq('estado', 'aprobada')
      .gte('created_at', hace7d.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),

    // Alertas ignoradas tipo quiebre_stock para esta distri
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('alertas_ignoradas')
      .select('referencia_id')
      .eq('distri_id', distriId)
      .eq('tipo', 'quiebre_stock')
      .gt('ignorada_hasta', new Date().toISOString()),
  ])

  // ── Datos procesados ──────────────────────────────────────────────────────

  const gondoleroProfiles = (gondoleroProfilesRes.data ?? []) as GondoleroProfile[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosEsteMes       = (fotosEsteMesRes.data  ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misionesEsteMes    = (misionesEsteMesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misiones90d        = (misiones90dRes.data   ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misiones8sem       = (misiones8semRes.data  ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const movPuntos          = (movPuntosRes.data     ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanasActivas    = (campanasActivasRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comerciosPendientes = (comerciosPendientesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos14d           = (fotos14dRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quiebreStockFotos  = (quiebreStockRes.data  ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ignoradasIds       = new Set((alertasIgnoradasRes.data ?? []).map((i: any) => i.referencia_id as string))

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const gondolerosTotales  = gondoleroIds.length
  const misionesEsteMesAprobadas = misionesEsteMes.filter((m: { estado: string }) => m.estado === 'aprobada').length
  const fotasMes           = fotosEsteMes.length
  const puntosMes          = movPuntos.reduce((sum: number, m: { monto: number }) => sum + (m.monto ?? 0), 0)
  const comerciosRelevadosMes = new Set(
    misiones90d
      .filter((m: { created_at: string }) => new Date(m.created_at) >= mesInicio)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => m.comercio?.id)
      .filter(Boolean)
  ).size

  // ── Set de gondoleros activos (14 días) ───────────────────────────────────

  const gondolerosActivos14Set = new Set(
    fotos14d.map((f: { gondolero_id: string }) => f.gondolero_id)
  )
  const gondolerosInactivos14 = gondoleroIds.filter(id => !gondolerosActivos14Set.has(id)).length

  // ── Bloque 2: Cobertura por localidad ────────────────────────────────────

  type LocalidadStats = {
    id: number | null
    nombre: string
    comerciosIds: Set<string>
    misionesCount: number
    ultimaActividad: Date
  }

  const localidadesMap = new Map<string, LocalidadStats>()

  for (const m of misiones90d) {
    const comercio = m.comercio
    if (!comercio) continue
    const localidad = comercio.localidades
    const key = localidad?.id != null ? String(localidad.id) : 'sin_localidad'
    const nombre = localidad?.nombre ?? 'Sin localidad asignada'

    if (!localidadesMap.has(key)) {
      localidadesMap.set(key, {
        id:              localidad?.id ?? null,
        nombre,
        comerciosIds:    new Set(),
        misionesCount:   0,
        ultimaActividad: new Date(m.created_at),
      })
    }
    const stats = localidadesMap.get(key)!
    if (comercio.id) stats.comerciosIds.add(comercio.id)
    stats.misionesCount++
    const f = new Date(m.created_at)
    if (f > stats.ultimaActividad) stats.ultimaActividad = f
  }

  const localidades = Array.from(localidadesMap.values())
    .sort((a, b) => b.comerciosIds.size - a.comerciosIds.size)
    .slice(0, 10)

  // ── Bloque 3: Actividad de gondoleros ────────────────────────────────────

  const gondolerosConStats = gondoleroProfiles
    .map(gond => {
      const misFotos    = fotosEsteMes.filter((f: { gondolero_id: string }) => f.gondolero_id === gond.id)
      const misAprobadas = misFotos.filter((f: { estado: string }) => f.estado === 'aprobada').length
      const misMisiones = misionesEsteMes.filter(
        (m: { gondolero_id: string; estado: string }) => m.gondolero_id === gond.id && m.estado === 'aprobada'
      ).length
      const tasa = misFotos.length > 0
        ? Math.round((misAprobadas / misFotos.length) * 100)
        : null
      const activo14 = gondolerosActivos14Set.has(gond.id)
      return { ...gond, fotasAprobMes: misAprobadas, misionesMes: misMisiones, totalFotasMes: misFotos.length, tasa, activo14 }
    })
    .sort((a, b) => b.misionesMes - a.misionesMes)

  // ── Bloque 5: Tipo de comercio ────────────────────────────────────────────

  const tipoCount: Record<string, number> = {}
  for (const m of misiones90d) {
    const tipo = m.comercio?.tipo ?? 'otro'
    tipoCount[tipo] = (tipoCount[tipo] ?? 0) + 1
  }
  const tiposOrdenados = Object.entries(tipoCount)
    .sort(([, a], [, b]) => b - a)
  const maxTipo = tiposOrdenados[0]?.[1] ?? 1

  // ── Bloque 6: Evolución semanal (últimas 8 semanas) ───────────────────────

  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = new Date(Date.now() - (7 - i) * 7 * 86400_000)
    const fin    = new Date(inicio.getTime() + 7 * 86400_000)
    return { inicio, fin, label: fmtSemana(inicio), count: 0 }
  })
  for (const m of misiones8sem) {
    const fecha = new Date(m.created_at)
    const s = semanas.find(s => fecha >= s.inicio && fecha < s.fin)
    if (s) s.count++
  }
  const maxSemana = Math.max(...semanas.map(s => s.count), 1)

  // ── Bloque 7: Alertas ─────────────────────────────────────────────────────

  const campanasVencenProx = campanasActivas.filter((c: { fecha_fin: string | null }) =>
    c.fecha_fin && new Date(c.fecha_fin) <= en7d
  )
  const pendientesValidacion = comerciosPendientes.length

  // Quiebre de stock: agrupar por comercio, excluir ignoradas
  type QuiebreStock = { comercioId: string; nombre: string; veces: number; ultimaVez: string }
  const quiebreMap = new Map<string, QuiebreStock>()
  for (const f of quiebreStockFotos) {
    if (ignoradasIds.has(f.comercio_id)) continue
    const entry = quiebreMap.get(f.comercio_id)
    if (entry) {
      entry.veces++
    } else {
      quiebreMap.set(f.comercio_id, {
        comercioId: f.comercio_id,
        nombre:     f.comercios?.nombre ?? 'Comercio',
        veces:      1,
        ultimaVez:  f.created_at,
      })
    }
  }
  const quiebresStock = Array.from(quiebreMap.values())
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 5)

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-5xl">

      {/* ── BLOQUE 1: KPIs ──────────────────────────────────────────────── */}
      <section>
        <SeccionHeader titulo="Resumen del mes" />
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          <KpiCard
            label="Gondoleros vinculados"
            valor={gondolerosTotales}
            icon={Users}
            color="bg-gondo-amber-50 text-gondo-amber-400"
            sub={gondolerosInactivos14 > 0 ? `${gondolerosInactivos14} inactivos >14d` : 'Todos activos'}
          />
          <KpiCard
            label="Comercios este mes"
            valor={comerciosRelevadosMes}
            icon={Store}
            color="bg-gondo-verde-50 text-gondo-verde-400"
            sub="por tus gondoleros"
          />
          <KpiCard
            label="Campañas activas"
            valor={campanasActivas.length}
            icon={Megaphone}
            color="bg-indigo-50 text-indigo-500"
            href="/distribuidora/campanas"
          />
          <KpiCard
            label="Fotos recibidas"
            valor={fotasMes}
            icon={Camera}
            color="bg-blue-50 text-blue-500"
            href="/distribuidora/gondolas"
          />
          <KpiCard
            label="Puntos emitidos"
            valor={formatearPuntos(puntosMes)}
            icon={Star}
            color="bg-yellow-50 text-yellow-500"
            sub="a tus gondoleros"
          />
          <KpiCard
            label="Misiones completadas"
            valor={misionesEsteMesAprobadas}
            icon={CheckCircle2}
            color="bg-gondo-verde-50 text-gondo-verde-400"
          />
        </div>
      </section>

      {/* ── BLOQUE 7: Alertas ───────────────────────────────────────────── */}
      <section>
        <SeccionHeader titulo="Alertas" />

        {/* Quiebre de stock — siempre visible */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <PackageX size={13} className={quiebresStock.length > 0 ? 'text-red-500' : 'text-gray-300'} />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
              Quiebre de stock · últimos 7 días
            </span>
            {quiebresStock.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {quiebresStock.length}
              </span>
            )}
          </div>
          {quiebresStock.length === 0 ? (
            <div className="bg-white rounded-xl border border-green-200 px-4 py-3">
              <p className="text-sm text-green-600 font-medium">✅ Sin alertas de stock activas</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-red-200 divide-y divide-gray-50">
              {quiebresStock.map((q: QuiebreStock) => (
                <Link
                  key={q.comercioId}
                  href={`/distribuidora/gondolas?comercio_id=${q.comercioId}&declaracion=producto_no_encontrado`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-red-50/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{q.nombre}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      No encontrado {q.veces} {q.veces === 1 ? 'vez' : 'veces'} · última vez{' '}
                      {new Date(q.ultimaVez).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0 ml-3" />
                </Link>
              ))}
              <Link
                href="/distribuidora/alertas"
                className="block px-4 py-2.5 text-center text-xs text-gondo-amber-400 font-medium hover:underline"
              >
                Ver todas las alertas →
              </Link>
            </div>
          )}
        </div>

        {/* Otras alertas operativas */}
        {(gondolerosInactivos14 > 0 || campanasVencenProx.length > 0 || pendientesValidacion > 0) && (
          <div className="bg-white rounded-xl border border-amber-200 divide-y divide-gray-50">
            {gondolerosInactivos14 > 0 && (
              <AlertaRow
                emoji="🟡"
                texto={`${gondolerosInactivos14} gondolero${gondolerosInactivos14 > 1 ? 's' : ''} sin actividad en los últimos 14 días`}
                href="/distribuidora/gondoleros"
              />
            )}
            {campanasVencenProx.map((c: { id: string; nombre: string; fecha_fin: string }) => (
              <AlertaRow
                key={c.id}
                emoji="🔴"
                texto={`Campaña "${c.nombre}" vence en ${diasRestantes(c.fecha_fin)} días`}
                href={`/distribuidora/campanas/${c.id}`}
              />
            ))}
            {pendientesValidacion > 0 && (
              <AlertaRow
                emoji="🏪"
                texto={`${pendientesValidacion} comercio${pendientesValidacion > 1 ? 's' : ''} pendiente${pendientesValidacion > 1 ? 's' : ''} de validación`}
                href="/distribuidora/comercios"
              />
            )}
          </div>
        )}
      </section>

      {/* ── BLOQUE 4: Campañas activas ──────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SeccionHeader titulo="Campañas activas" inline />
          <Link href="/distribuidora/campanas" className="text-xs text-gondo-amber-400 font-medium flex items-center gap-0.5 hover:underline">
            Ver todas <ChevronRight size={12} />
          </Link>
        </div>
        {campanasActivas.length === 0 ? (
          <Vacio texto="No hay campañas activas" />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {campanasActivas.map((c: { id: string; nombre: string; objetivo_comercios: number | null; comercios_relevados: number | null; fecha_fin: string | null }) => {
              const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
              const progreso = c.objetivo_comercios
                ? Math.min(100, Math.round(((c.comercios_relevados ?? 0) / c.objetivo_comercios) * 100))
                : null
              return (
                <Link key={c.id} href={`/distribuidora/campanas/${c.id}`} className="block px-4 py-3.5 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-gray-900 truncate mr-3">{c.nombre}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      {dias !== null && (
                        <span className={`text-xs font-medium ${dias <= 3 ? 'text-red-500' : 'text-gray-400'}`}>
                          {dias === 0 ? 'Hoy vence' : `${dias}d`}
                        </span>
                      )}
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </div>
                  {progreso !== null ? (
                    <>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gondo-amber-400 rounded-full"
                          style={{ width: `${progreso}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {c.comercios_relevados ?? 0} / {c.objetivo_comercios} comercios ({progreso}%)
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-gray-400">{c.comercios_relevados ?? 0} comercios relevados</p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* ── BLOQUE 3: Actividad de gondoleros ──────────────────────────── */}
      <section>
        <SeccionHeader titulo="Actividad de gondoleros — este mes" />
        {gondolerosConStats.length === 0 ? (
          <Vacio texto="No tenés gondoleros vinculados aún" />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Gondolero</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Misiones</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Fotos apr.</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Tasa</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gondolerosConStats.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gondo-amber-50 flex items-center justify-center text-[11px] font-bold text-gondo-amber-400 shrink-0">
                            {(g.alias ?? g.nombre ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-800 text-sm leading-tight">
                              {g.alias ?? g.nombre ?? 'Sin nombre'}
                            </p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${NIVEL_BADGE[g.nivel ?? 'casual']}`}>
                              {(g.nivel ?? 'casual').charAt(0).toUpperCase() + (g.nivel ?? 'casual').slice(1)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-bold ${g.misionesMes > 0 ? 'text-gondo-verde-400' : 'text-gray-300'}`}>
                          {g.misionesMes}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-bold ${g.fotasAprobMes > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {g.fotasAprobMes}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {g.tasa !== null ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            g.tasa >= 80 ? 'bg-green-50 text-green-600' :
                            g.tasa >= 50 ? 'bg-amber-50 text-amber-600' :
                            'bg-red-50 text-red-500'
                          }`}>
                            {g.tasa}%
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {g.activo14 ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Activo</span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactivo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-end">
              <Link href="/distribuidora/gondoleros" className="text-xs text-gondo-amber-400 font-medium hover:underline flex items-center gap-0.5">
                Ver todos los gondoleros <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── BLOQUE 2: Cobertura por localidad ──────────────────────── */}
        <section>
          <SeccionHeader titulo="Cobertura por localidad" sub="Últimas 8 semanas" />
          {localidades.length === 0 ? (
            <Vacio texto="Sin datos de localidades aún" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
              {localidades.map((loc, i) => {
                const activa = loc.ultimaActividad >= hace30d
                return (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <MapPin size={14} className={`shrink-0 ${activa ? 'text-gondo-verde-400' : 'text-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">{loc.nombre}</p>
                        {!activa && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">
                            Inactiva 30d
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {loc.comerciosIds.size} comercio{loc.comerciosIds.size !== 1 ? 's' : ''} · {loc.misionesCount} misión{loc.misionesCount !== 1 ? 'es' : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {loc.ultimaActividad.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── BLOQUE 8: Comercios pendientes de validación ────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <SeccionHeader titulo="Comercios a validar" inline />
              {comerciosPendientes.length > 0 && (
                <span className="ml-2 text-xs bg-gondo-amber-400 text-white font-bold px-2 py-0.5 rounded-full">
                  {comerciosPendientes.length}
                </span>
              )}
            </div>
            <Link href="/distribuidora/comercios" className="text-xs text-gondo-amber-400 font-medium flex items-center gap-0.5 hover:underline">
              Ver todos <ChevronRight size={12} />
            </Link>
          </div>
          {comerciosPendientes.length === 0 ? (
            <Vacio texto="✅ Todos los comercios están validados" />
          ) : (
            <div className="bg-white rounded-xl border border-amber-200 divide-y divide-gray-50">
              {comerciosPendientes.map((c: { id: string; nombre: string; tipo: string | null; created_at: string }) => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <Package size={14} className="text-gondo-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.nombre}</p>
                    <p className="text-[11px] text-gray-400">
                      {TIPO_LABEL[c.tipo ?? 'otro'] ?? 'Comercio'} · {new Date(c.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 shrink-0">
                    Pendiente
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── BLOQUE 5: Tipo de comercio ──────────────────────────────── */}
        <section>
          <SeccionHeader titulo="Cobertura por tipo de comercio" sub="Últimas 8 semanas" />
          {tiposOrdenados.length === 0 ? (
            <Vacio texto="Sin datos de cobertura aún" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              {tiposOrdenados.map(([tipo, count]) => (
                <BarraHorizontal
                  key={tipo}
                  label={TIPO_LABEL[tipo] ?? tipo}
                  count={count}
                  max={maxTipo}
                  color="bg-gondo-amber-400"
                />
              ))}
            </div>
          )}
        </section>

        {/* ── BLOQUE 6: Evolución semanal ─────────────────────────────── */}
        <section>
          <SeccionHeader titulo="Misiones completadas por semana" sub="Últimas 8 semanas" />
          {misiones8sem.length === 0 ? (
            <Vacio texto="Sin actividad en las últimas 8 semanas" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              {semanas.map((s, i) => (
                <BarraHorizontal
                  key={i}
                  label={s.label}
                  count={s.count}
                  max={maxSemana}
                  color={i === semanas.length - 1 ? 'bg-gondo-verde-400' : 'bg-gondo-amber-400'}
                  labelWidth="w-16"
                />
              ))}
            </div>
          )}
        </section>

      </div>

    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SeccionHeader({
  titulo, sub, inline,
}: {
  titulo: string
  sub?: string
  inline?: boolean
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-1.5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{titulo}</h2>
        {sub && <span className="text-[10px] text-gray-400">· {sub}</span>}
      </div>
    )
  }
  return (
    <div className="mb-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{titulo}</h2>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function KpiCard({
  label, valor, icon: Icon, color, sub, href,
}: {
  label: string
  valor: number | string
  icon: React.ElementType
  color: string
  sub?: string
  href?: string
}) {
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${href ? 'hover:bg-gray-50 transition-colors cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1 leading-tight">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{valor}</p>
          {sub && <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ml-3 ${color}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

function AlertaRow({ emoji, texto, href }: { emoji: string; texto: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 hover:bg-amber-50/50 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="text-base">{emoji}</span>
        <p className="text-sm text-gray-800">{texto}</p>
      </div>
      <ChevronRight size={14} className="text-gray-400 shrink-0" />
    </Link>
  )
}

function BarraHorizontal({
  label, count, max, color, labelWidth = 'w-24',
}: {
  label: string
  count: number
  max: number
  color: string
  labelWidth?: string
}) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 3 : 0) : 0
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[11px] text-gray-600 shrink-0 ${labelWidth}`}>{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-semibold text-gray-600 w-7 text-right shrink-0">{count}</span>
    </div>
  )
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center">
      <p className="text-sm text-gray-400">{texto}</p>
    </div>
  )
}
