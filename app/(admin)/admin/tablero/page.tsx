export const dynamic = 'force-dynamic'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'
import {
  Users, Store, Megaphone, Camera, Star, CheckCircle2,
  AlertTriangle, ChevronRight, Truck, Tag, Clock, Image,
  TrendingUp, Shield, PackageCheck,
} from 'lucide-react'
import { tiempoRelativo, formatearPuntos } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
function fmtSemana(d: Date) { return `${d.getDate()} ${MESES[d.getMonth()]}` }

const NIVEL_BADGE: Record<string, string> = {
  casual: 'bg-gray-100 text-gray-500',
  activo: 'bg-blue-50 text-blue-600',
  pro:    'bg-purple-50 text-purple-600',
}

const ESTADO_CAMPANA_LABEL: Record<string, string> = {
  activa:               'Activas',
  borrador:             'Borrador',
  pendiente_aprobacion: 'Pend. aprobación',
  pausada:              'Pausadas',
  cerrada:              'Cerradas',
  cancelada:            'Canceladas',
}

const ESTADO_CAMPANA_COLOR: Record<string, string> = {
  activa:               'bg-green-400',
  borrador:             'bg-gray-300',
  pendiente_aprobacion: 'bg-amber-400',
  pausada:              'bg-blue-300',
  cerrada:              'bg-gray-200',
  cancelada:            'bg-red-300',
}

const TIPO_LABEL: Record<string, string> = {
  autoservicio: 'Autoservicio', almacen: 'Almacén',
  kiosco: 'Kiosco', mayorista: 'Mayorista', dietetica: 'Dietética', otro: 'Otro',
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default async function AdminTableroPage() {
  const admin = makeAdmin()

  const ahora    = new Date()
  const mesInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
  const hace7d   = new Date(Date.now() -  7 * 86400_000)
  const hace14d  = new Date(Date.now() - 14 * 86400_000)
  const hace56d  = new Date(Date.now() - 56 * 86400_000)

  // ── Consultas en paralelo ─────────────────────────────────────────────────
  const [
    gondolerosCountRes,
    distriCountRes,
    marcasCountRes,
    comerciosValidadosRes,
    misionesEsteMesRes,
    fotosEsteMesRes,
    puntosEmiRes,
    puntosCanjeRes,
    gondolerosProfilesRes,
    distriListRes,
    misionesRecentRes,
    fotosPendRecentRes,
    comerciosPendRecentRes,
    campanasAllRes,
    gondNuevosEstaSemRes,
    gondNuevosAntSemRes,
    misiones8semRes,
    erroresPendRes,
    campanasPendAprobRes,
    marcasListRes,
    marcaDistriRelRes,
  ] = await Promise.all([
    // Totales globales
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tipo_actor', 'gondolero'),
    admin.from('distribuidoras').select('*', { count: 'exact', head: true }).eq('validada', true),
    admin.from('marcas').select('*', { count: 'exact', head: true }).eq('validada', true),
    admin.from('comercios').select('*', { count: 'exact', head: true }).eq('validado', true),
    // Este mes
    admin.from('misiones').select('id, gondolero_id, campana_id, estado, created_at').gte('created_at', mesInicio.toISOString()),
    admin.from('fotos').select('id, gondolero_id, campana_id, estado').gte('created_at', mesInicio.toISOString()),
    admin.from('movimientos_puntos').select('monto').eq('tipo', 'credito').gte('created_at', mesInicio.toISOString()),
    admin.from('movimientos_puntos').select('monto').eq('tipo', 'debito').gte('created_at', mesInicio.toISOString()),
    // Gondoleros + distribuidoras (para rankings)
    admin.from('profiles').select('id, alias, nombre, nivel, distri_id').eq('tipo_actor', 'gondolero'),
    admin.from('distribuidoras').select('id, razon_social'),
    // Feed reciente
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('misiones')
      .select('id, created_at, gondolero:profiles!gondolero_id(alias, nombre), campana:campanas(nombre), comercio:comercios(nombre)')
      .eq('estado', 'aprobada')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('fotos')
      .select('id, created_at')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('comercios')
      .select('id, nombre, tipo, created_at')
      .eq('validado', false)
      .order('created_at', { ascending: false })
      .limit(5),
    // Campañas todas (para breakdown por estado + top marcas)
    admin.from('campanas').select('id, nombre, estado, marca_id'),
    // Gondoleros nuevos esta semana / anterior
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tipo_actor', 'gondolero').gte('created_at', hace7d.toISOString()),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tipo_actor', 'gondolero').gte('created_at', hace14d.toISOString()).lt('created_at', hace7d.toISOString()),
    // Evolución 8 semanas
    admin.from('misiones').select('id, created_at').eq('estado', 'aprobada').gte('created_at', hace56d.toISOString()),
    // Errores sin resolver
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('errores_reportados')
      .select('id, descripcion, estado, tipo_actor, created_at')
      .in('estado', ['nuevo', 'revisado'])
      .order('created_at', { ascending: false })
      .limit(5),
    // Campañas pendientes de aprobación
    admin.from('campanas')
      .select('id, nombre, created_at')
      .eq('estado', 'pendiente_aprobacion')
      .order('created_at', { ascending: false }),
    // Top marcas: lista de marcas
    admin.from('marcas').select('id, razon_social'),
    // Relaciones marca-distri activas (para contar distribuidoras por marca)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('marca_distri_relaciones').select('marca_id, distri_id').eq('estado', 'activa'),
  ])

  // ── Datos procesados ──────────────────────────────────────────────────────

  const gondolerosTotal    = gondolerosCountRes.count ?? 0
  const distriTotal        = distriCountRes.count ?? 0
  const marcasTotal        = marcasCountRes.count ?? 0
  const comerciosValidados = comerciosValidadosRes.count ?? 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misionesEsteMes    = (misionesEsteMesRes.data    ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosEsteMes       = (fotosEsteMesRes.data       ?? []) as any[]
  const puntosEmi          = ((puntosEmiRes.data ?? []) as { monto: number }[]).reduce((s, r) => s + (r.monto ?? 0), 0)
  const puntosCanjeados    = ((puntosCanjeRes.data ?? []) as { monto: number }[]).reduce((s, r) => s + (r.monto ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gondolerosProfiles = (gondolerosProfilesRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const distriList         = (distriListRes.data         ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misionesRecent     = (misionesRecentRes.data     ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosPendRecent    = (fotosPendRecentRes.data    ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comerciosPendRec   = (comerciosPendRecentRes.data ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanasAll        = (campanasAllRes.data         ?? []) as any[]
  const gondNuevosEsta     = gondNuevosEstaSemRes.count ?? 0
  const gondNuevosAnt      = gondNuevosAntSemRes.count  ?? 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misiones8sem       = (misiones8semRes.data        ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const erroresPend        = (erroresPendRes.data         ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanasPendAprob  = (campanasPendAprobRes.data   ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcasList         = (marcasListRes.data          ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const marcaDistriRel     = (marcaDistriRelRes.data      ?? []) as any[]

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const gondolerosActivosMes   = new Set(misionesEsteMes.filter(m => m.estado === 'aprobada').map(m => m.gondolero_id)).size
  const misionesCompletadasMes = misionesEsteMes.filter(m => m.estado === 'aprobada').length
  const fotosProcesMes         = fotosEsteMes.length
  const fotosAprobadasMes      = fotosEsteMes.filter(f => f.estado === 'aprobada').length
  const tasaGlobal             = fotosProcesMes > 0 ? Math.round((fotosAprobadasMes / fotosProcesMes) * 100) : null

  // ── Campañas por estado ────────────────────────────────────────────────────

  const campanasPorEstado: Record<string, number> = {}
  for (const c of campanasAll) {
    campanasPorEstado[c.estado] = (campanasPorEstado[c.estado] ?? 0) + 1
  }
  const maxCampanas = Math.max(...Object.values(campanasPorEstado), 1)
  const estadosCampanas = Object.entries(campanasPorEstado).sort(([, a], [, b]) => b - a)

  // ── Evolución semanal ──────────────────────────────────────────────────────

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

  // ── Rankings ──────────────────────────────────────────────────────────────

  const distriMap            = new Map(distriList.map((d: { id: string; razon_social: string }) => [d.id, d.razon_social]))
  const gondToDistri         = new Map(gondolerosProfiles.filter((g: { distri_id: string | null }) => g.distri_id).map((g: { id: string; distri_id: string }) => [g.id, g.distri_id]))
  const gondolerosActivosSet = new Set(misionesEsteMes.filter(m => m.estado === 'aprobada').map(m => m.gondolero_id))

  // Distri stats
  const gondByDistri    = new Map<string, Set<string>>()
  const misionByDistri  = new Map<string, number>()
  const fotasByDistri   = new Map<string, number>()

  for (const g of gondolerosProfiles) {
    if (!g.distri_id) continue
    if (!gondByDistri.has(g.distri_id)) gondByDistri.set(g.distri_id, new Set())
    gondByDistri.get(g.distri_id)!.add(g.id)
  }
  for (const m of misionesEsteMes) {
    if (m.estado !== 'aprobada') continue
    const dId = gondToDistri.get(m.gondolero_id)
    if (dId) misionByDistri.set(dId, (misionByDistri.get(dId) ?? 0) + 1)
  }
  for (const f of fotosEsteMes) {
    const dId = gondToDistri.get(f.gondolero_id)
    if (dId) fotasByDistri.set(dId, (fotasByDistri.get(dId) ?? 0) + 1)
  }

  const topDistris = Array.from(gondByDistri.keys())
    .map(dId => ({
      id:                dId,
      nombre:            (distriMap.get(dId) ?? 'Sin nombre') as string,
      gondolerosActivos: [...(gondByDistri.get(dId) ?? new Set())].filter(gId => gondolerosActivosSet.has(gId)).length,
      misiones:          misionByDistri.get(dId) ?? 0,
      fotos:             fotasByDistri.get(dId) ?? 0,
    }))
    .sort((a, b) => b.misiones - a.misiones)
    .slice(0, 5)

  // ── Top marcas ─────────────────────────────────────────────────────────────

  // campana_id → marca_id
  const campanaToMarca = new Map<string, string>(
    campanasAll.filter((c: { marca_id: string | null }) => c.marca_id).map((c: { id: string; marca_id: string }) => [c.id, c.marca_id])
  )
  // marca_id → { misiones, fotos, campanasActivasCount }
  const misionByMarca = new Map<string, number>()
  const fotasByMarca  = new Map<string, number>()

  for (const m of misionesEsteMes) {
    if (m.estado !== 'aprobada' || !m.campana_id) continue
    const mId = campanaToMarca.get(m.campana_id)
    if (mId) misionByMarca.set(mId, (misionByMarca.get(mId) ?? 0) + 1)
  }
  for (const f of fotosEsteMes) {
    if (!f.campana_id) continue
    const mId = campanaToMarca.get(f.campana_id)
    if (mId) fotasByMarca.set(mId, (fotasByMarca.get(mId) ?? 0) + 1)
  }

  // Campañas activas por marca
  const campanasActivasByMarca = new Map<string, number>()
  for (const c of campanasAll) {
    if (c.estado === 'activa' && c.marca_id) {
      campanasActivasByMarca.set(c.marca_id, (campanasActivasByMarca.get(c.marca_id) ?? 0) + 1)
    }
  }

  // Distribuidoras vinculadas activas por marca
  const distrisActivasByMarca = new Map<string, number>()
  for (const r of marcaDistriRel) {
    if (r.marca_id) distrisActivasByMarca.set(r.marca_id, (distrisActivasByMarca.get(r.marca_id) ?? 0) + 1)
  }

  const topMarcas = marcasList
    .map((m: { id: string; razon_social: string }) => ({
      id:              m.id,
      nombre:          m.razon_social ?? 'Sin nombre',
      campanasActivas: campanasActivasByMarca.get(m.id) ?? 0,
      misiones:        misionByMarca.get(m.id) ?? 0,
      fotos:           fotasByMarca.get(m.id) ?? 0,
      distrisActivas:  distrisActivasByMarca.get(m.id) ?? 0,
    }))
    .filter((m: { misiones: number; campanasActivas: number }) => m.misiones > 0 || m.campanasActivas > 0)
    .sort((a: { misiones: number }, b: { misiones: number }) => b.misiones - a.misiones)
    .slice(0, 5)

  // Gondolero stats
  const gondMisionMap = new Map<string, number>()
  const gondFotaMap   = new Map<string, { total: number; aprobadas: number }>()

  for (const m of misionesEsteMes) {
    if (m.estado !== 'aprobada') continue
    gondMisionMap.set(m.gondolero_id, (gondMisionMap.get(m.gondolero_id) ?? 0) + 1)
  }
  for (const f of fotosEsteMes) {
    const stats = gondFotaMap.get(f.gondolero_id) ?? { total: 0, aprobadas: 0 }
    stats.total++
    if (f.estado === 'aprobada') stats.aprobadas++
    gondFotaMap.set(f.gondolero_id, stats)
  }

  const topGondoleros = gondolerosProfiles
    .filter((g: { id: string }) => (gondMisionMap.get(g.id) ?? 0) > 0)
    .map((g: { id: string; alias: string | null; nombre: string | null; nivel: string | null; distri_id: string | null }) => {
      const fotas = gondFotaMap.get(g.id)
      const tasa  = fotas && fotas.total > 0 ? Math.round((fotas.aprobadas / fotas.total) * 100) : null
      return {
        id:      g.id,
        alias:   g.alias ?? g.nombre ?? 'Sin nombre',
        nivel:   g.nivel ?? 'casual',
        distri:  g.distri_id ? ((distriMap.get(g.distri_id) ?? 'Sin distri') as string) : 'Independiente',
        misiones: gondMisionMap.get(g.id) ?? 0,
        tasa,
      }
    })
    .sort((a: { misiones: number }, b: { misiones: number }) => b.misiones - a.misiones)
    .slice(0, 10)

  // Posibles fraudes (tasa < 50% con >= 5 fotos)
  const gondFraude = gondolerosProfiles
    .filter((g: { id: string }) => {
      const fotas = gondFotaMap.get(g.id)
      if (!fotas || fotas.total < 5) return false
      return (fotas.aprobadas / fotas.total) < 0.5
    })
    .map((g: { id: string; alias: string | null; nombre: string | null }) => {
      const fotas = gondFotaMap.get(g.id)!
      return {
        id:    g.id,
        alias: g.alias ?? g.nombre ?? 'Sin nombre',
        tasa:  Math.round((fotas.aprobadas / fotas.total) * 100),
        fotos: fotas.total,
      }
    })
    .sort((a: { tasa: number }, b: { tasa: number }) => a.tasa - b.tasa)
    .slice(0, 5)

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-6xl">

      {/* ── BLOQUE 1: KPIs ──────────────────────────────────────────────── */}
      <section>
        <SeccionHeader titulo="Resumen del mes" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Gondoleros activos" valor={gondolerosActivosMes} icon={Users} color="bg-gondo-verde-50 text-gondo-verde-400"
            sub={`de ${gondolerosTotal} totales`} />
          <KpiCard label="Distribuidoras" valor={distriTotal} icon={Truck} color="bg-gondo-amber-50 text-gondo-amber-400"
            href="/admin/distribuidoras" />
          <KpiCard label="Marcas" valor={marcasTotal} icon={Tag} color="bg-indigo-50 text-indigo-500"
            href="/admin/marcas" />
          <KpiCard label="Comercios validados" valor={comerciosValidados} icon={Store} color="bg-teal-50 text-teal-500"
            href="/admin/comercios" />
          <KpiCard label="Misiones completadas" valor={misionesCompletadasMes} icon={CheckCircle2} color="bg-gondo-verde-50 text-gondo-verde-400" />
          <KpiCard label="Fotos este mes" valor={fotosProcesMes} icon={Camera} color="bg-blue-50 text-blue-500"
            href="/admin/fotos" sub={`${fotosAprobadasMes} aprobadas`} />
          <KpiCard label="Puntos emitidos" valor={formatearPuntos(puntosEmi)} icon={Star} color="bg-yellow-50 text-yellow-500"
            sub={`${formatearPuntos(puntosCanjeados)} canjeados`} />
          <KpiCard label="Tasa de aprobación" valor={tasaGlobal !== null ? `${tasaGlobal}%` : '—'} icon={PackageCheck}
            color={tasaGlobal !== null && tasaGlobal >= 70 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'} />
        </div>
      </section>

      {/* ── BLOQUE 7: Alertas del sistema ───────────────────────────────── */}
      {(campanasPendAprob.length > 0 || erroresPend.length > 0 || gondFraude.length > 0 || comerciosPendRec.length > 0) && (
        <section>
          <SeccionHeader titulo="Alertas del sistema" />
          <div className="bg-white rounded-xl border border-red-200 divide-y divide-gray-50">

            {/* Campañas pendientes de aprobación */}
            {campanasPendAprob.map((c: { id: string; nombre: string; created_at: string }) => (
              <AlertaRow
                key={c.id}
                emoji="📣"
                texto={`Campaña pendiente: "${c.nombre}"`}
                sub={tiempoRelativo(c.created_at)}
                href={`/admin/campanas/${c.id}`}
              />
            ))}

            {/* Comercios sin validar */}
            {comerciosPendRec.length > 0 && (
              <AlertaRow
                emoji="🏪"
                texto={`${comerciosPendRec.length} comercio${comerciosPendRec.length > 1 ? 's' : ''} pendiente${comerciosPendRec.length > 1 ? 's' : ''} de validación`}
                href="/admin/comercios"
              />
            )}

            {/* Errores reportados */}
            {erroresPend.map((e: { id: string; descripcion: string; tipo_actor: string | null; created_at: string }) => (
              <AlertaRow
                key={e.id}
                emoji="⚠️"
                texto={`Error reportado${e.tipo_actor ? ` (${e.tipo_actor})` : ''}: ${e.descripcion.slice(0, 60)}${e.descripcion.length > 60 ? '…' : ''}`}
                sub={tiempoRelativo(e.created_at)}
                href="/admin/errores"
              />
            ))}

            {/* Gondoleros posible fraude */}
            {gondFraude.map((g: { id: string; alias: string; tasa: number; fotos: number }) => (
              <AlertaRow
                key={g.id}
                emoji="🚨"
                texto={`Posible fraude: ${g.alias} — tasa ${g.tasa}% en ${g.fotos} fotos este mes`}
                href={`/admin/usuarios`}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── BLOQUE 2: Actividad reciente ────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Últimas misiones completadas */}
        <section className="xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <SeccionHeader titulo="Últimas misiones completadas" inline />
          </div>
          {misionesRecent.length === 0 ? (
            <Vacio texto="Sin misiones completadas aún" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
              {misionesRecent.map((m: { id: string; created_at: string; gondolero: { alias: string | null; nombre: string | null } | null; campana: { nombre: string } | null; comercio: { nombre: string } | null }) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {m.gondolero?.alias ?? m.gondolero?.nombre ?? 'Gondolero'}
                      <span className="font-normal text-gray-400"> en </span>
                      {m.comercio?.nombre ?? 'Comercio'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{m.campana?.nombre ?? 'Campaña'}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 ml-4">{tiempoRelativo(m.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Fotos pendientes + Comercios pendientes */}
        <section className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <SeccionHeader titulo="Fotos pendientes" inline />
              <Link href="/admin/fotos?estado=pendiente" className="text-xs text-gondo-amber-400 hover:underline flex items-center gap-0.5">
                Ver todas <ChevronRight size={11} />
              </Link>
            </div>
            {fotosPendRecent.length === 0 ? (
              <div className="bg-white rounded-xl border border-green-200 px-4 py-3">
                <p className="text-sm text-green-600 font-medium">✅ Sin fotos pendientes</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-amber-200 divide-y divide-gray-50">
                {fotosPendRecent.slice(0, 5).map((f: { id: string; created_at: string }) => (
                  <Link key={f.id} href={`/admin/fotos?estado=pendiente`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-amber-50/40 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <Image size={13} className="text-amber-400 shrink-0" />
                      <p className="text-xs text-gray-700 truncate">Foto pendiente</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">{tiempoRelativo(f.created_at)}</span>
                  </Link>
                ))}
                {fotosPendRecent.length > 5 && (
                  <div className="px-4 py-2 text-center text-xs text-gray-400">
                    +{fotosPendRecent.length - 5} más
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <SeccionHeader titulo="Comercios a validar" inline />
              <Link href="/admin/comercios" className="text-xs text-gondo-amber-400 hover:underline flex items-center gap-0.5">
                Ver todos <ChevronRight size={11} />
              </Link>
            </div>
            {comerciosPendRec.length === 0 ? (
              <div className="bg-white rounded-xl border border-green-200 px-4 py-3">
                <p className="text-sm text-green-600 font-medium">✅ Todos validados</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
                {comerciosPendRec.map((c: { id: string; nombre: string; tipo: string | null; created_at: string }) => (
                  <Link key={c.id} href="/admin/comercios"
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{c.nombre}</p>
                      <p className="text-[10px] text-gray-400">{TIPO_LABEL[c.tipo ?? 'otro'] ?? 'Comercio'}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">{tiempoRelativo(c.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── BLOQUE 3: Salud de la plataforma ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <section>
          <SeccionHeader titulo="Campañas por estado" />
          {estadosCampanas.length === 0 ? (
            <Vacio texto="Sin campañas aún" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              {estadosCampanas.map(([estado, count]) => (
                <BarraHorizontal
                  key={estado}
                  label={ESTADO_CAMPANA_LABEL[estado] ?? estado}
                  count={count}
                  max={maxCampanas}
                  color={ESTADO_CAMPANA_COLOR[estado] ?? 'bg-gray-300'}
                  labelWidth="w-36"
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <SeccionHeader titulo="Salud de la plataforma" />
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">

            {/* Gondoleros nuevos */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Gondoleros nuevos esta semana</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Semana anterior: {gondNuevosAnt}
                  {gondNuevosEsta > gondNuevosAnt && gondNuevosAnt > 0 && (
                    <span className="text-green-600 ml-1">↑ +{gondNuevosEsta - gondNuevosAnt}</span>
                  )}
                  {gondNuevosEsta < gondNuevosAnt && (
                    <span className="text-red-500 ml-1">↓ {gondNuevosEsta - gondNuevosAnt}</span>
                  )}
                </p>
              </div>
              <span className={`text-2xl font-bold ${gondNuevosEsta > 0 ? 'text-gondo-verde-400' : 'text-gray-300'}`}>
                {gondNuevosEsta}
              </span>
            </div>

            {/* Tasa global */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Tasa aprobación global (este mes)</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {fotosAprobadasMes} aprobadas / {fotosProcesMes} totales
                </p>
              </div>
              {tasaGlobal !== null ? (
                <span className={`text-2xl font-bold ${
                  tasaGlobal >= 80 ? 'text-green-600' :
                  tasaGlobal >= 60 ? 'text-amber-500' : 'text-red-500'
                }`}>
                  {tasaGlobal}%
                </span>
              ) : (
                <span className="text-2xl font-bold text-gray-300">—</span>
              )}
            </div>

            {/* Puntos netos */}
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">Puntos netos en circulación (mes)</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatearPuntos(puntosEmi)} emitidos · {formatearPuntos(puntosCanjeados)} canjeados
                </p>
              </div>
              <span className="text-xl font-bold text-gray-700">
                {formatearPuntos(puntosEmi - puntosCanjeados)}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ── BLOQUE 4: Evolución semanal ─────────────────────────────────── */}
      <section>
        <SeccionHeader titulo="Misiones completadas por semana" sub="Últimas 8 semanas · plataforma completa" />
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── BLOQUE 5: Top distribuidoras ──────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SeccionHeader titulo="Top distribuidoras" sub="por actividad este mes" inline />
            <Link href="/admin/distribuidoras" className="text-xs text-gondo-amber-400 hover:underline flex items-center gap-0.5">
              Ver todas <ChevronRight size={11} />
            </Link>
          </div>
          {topDistris.length === 0 ? (
            <Vacio texto="Sin actividad de distribuidoras este mes" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Distribuidora</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Act.</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Misiones</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Fotos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {topDistris.map((d, i) => (
                    <tr key={d.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                          <p className="text-sm font-medium text-gray-800 truncate max-w-[120px]">{d.nombre}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-bold ${d.gondolerosActivos > 0 ? 'text-gondo-verde-400' : 'text-gray-300'}`}>
                          {d.gondolerosActivos}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-gray-700">{d.misiones}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm text-gray-500">{d.fotos}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── BLOQUE — Top marcas ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SeccionHeader titulo="Top marcas" sub="por actividad este mes" inline />
            <Link href="/admin/marcas" className="text-xs text-gondo-amber-400 hover:underline flex items-center gap-0.5">
              Ver todas <ChevronRight size={11} />
            </Link>
          </div>
          {topMarcas.length === 0 ? (
            <Vacio texto="Sin actividad de marcas este mes" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Marca</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Camp.</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Misiones</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Fotos</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">Distris</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(topMarcas as { id: string; nombre: string; campanasActivas: number; misiones: number; fotos: number; distrisActivas: number }[]).map((m, i) => (
                    <tr key={m.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                          <p className="text-sm font-medium text-gray-800 truncate max-w-[120px]">{m.nombre}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-bold ${m.campanasActivas > 0 ? 'text-indigo-500' : 'text-gray-300'}`}>
                          {m.campanasActivas}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-bold text-gray-700">{m.misiones}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm text-gray-500">{m.fotos}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm ${m.distrisActivas > 0 ? 'text-gondo-amber-400 font-semibold' : 'text-gray-300'}`}>
                          {m.distrisActivas}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── BLOQUE 6: Top gondoleros ──────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SeccionHeader titulo="Top gondoleros" sub="por misiones este mes" inline />
            <Link href="/admin/usuarios?tipo=gondolero" className="text-xs text-gondo-amber-400 hover:underline flex items-center gap-0.5">
              Ver todos <ChevronRight size={11} />
            </Link>
          </div>
          {topGondoleros.length === 0 ? (
            <Vacio texto="Sin misiones completadas este mes" />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Gondolero</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Mis.</th>
                      <th className="text-center px-2 py-2.5 text-xs font-semibold text-gray-500">Tasa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(topGondoleros as { id: string; alias: string; nivel: string; distri: string; misiones: number; tasa: number | null }[]).map((g, i) => (
                      <tr key={g.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 w-4 shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-gray-800 truncate max-w-[120px]">{g.alias}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`text-[9px] font-semibold px-1 py-0.5 rounded-full ${NIVEL_BADGE[g.nivel]}`}>
                                  {g.nivel}
                                </span>
                                <span className="text-[9px] text-gray-400 truncate max-w-[80px]">{g.distri}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <span className="text-sm font-bold text-gondo-verde-400">{g.misiones}</span>
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {g.tasa !== null ? (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────────

function SeccionHeader({ titulo, sub, inline }: { titulo: string; sub?: string; inline?: boolean }) {
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

function KpiCard({ label, valor, icon: Icon, color, sub, href }: {
  label: string; valor: number | string; icon: React.ElementType
  color: string; sub?: string; href?: string
}) {
  const inner = (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 ${href ? 'hover:bg-gray-50 transition-colors' : ''}`}>
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

function AlertaRow({ emoji, texto, sub, href }: { emoji: string; texto: string; sub?: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between px-4 py-3 hover:bg-red-50/40 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        <span className="text-base shrink-0 mt-0.5">{emoji}</span>
        <div className="min-w-0">
          <p className="text-sm text-gray-800 truncate">{texto}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
      <ChevronRight size={14} className="text-gray-400 shrink-0 ml-3" />
    </Link>
  )
}

function BarraHorizontal({ label, count, max, color, labelWidth = 'w-24' }: {
  label: string; count: number; max: number; color: string; labelWidth?: string
}) {
  const pct = max > 0 ? Math.max((count / max) * 100, count > 0 ? 3 : 0) : 0
  return (
    <div className="flex items-center gap-3">
      <span className={`text-[11px] text-gray-600 shrink-0 ${labelWidth}`}>{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
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
