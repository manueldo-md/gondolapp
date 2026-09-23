import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PackageX, Store, Megaphone, UserX } from 'lucide-react'
import { calcularPorcentaje } from '@/lib/utils'
import { etiquetaVigencia } from '@/lib/campana-vigencia'
import { getGondolerosDeDistri } from '@/lib/utils-distri'
import { contarCamposTipificados, estadoQuiebre, textoQuiebre } from '@/lib/alertas-distri'
import { IgnorarAlertaBoton } from './ignorar-alerta-boton'
import { AlertasEnPausa } from './alertas-en-pausa'
import type { AlertaIgnoradaConNombre } from './alertas-en-pausa'

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

  // Gondoleros activos — solo para alerta de inactividad (TIPO 4)
  // Campañas propias — fuente de verdad para fotos (TIPOs 1 y 2)
  const [gondoleroIds, todasCampanasRes] = await Promise.all([
    getGondolerosDeDistri(distriId, admin, false),
    admin.from('campanas').select('id').eq('distri_id', distriId),
  ])
  const campanaIds = (todasCampanasRes.data ?? []).map((c: { id: string }) => c.id)
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'
  const safeCampanaIds = campanaIds.length > 0 ? campanaIds : [NULL_UUID]

  // Date helpers
  const treintaAtras     = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sesentaAtras     = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
  const catorceDiasAtras = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const tresDiasAdelante = new Date(Date.now() + 3  * 24 * 60 * 60 * 1000)

  // ── Alertas ignoradas activas ─────────────────────────────────────────────
  const { data: ignoradasRaw } = await (admin as any)
    .from('alertas_ignoradas')
    .select('id, tipo, referencia_id, ignorada_hasta')
    .eq('distri_id', distriId)
    .gt('ignorada_hasta', new Date().toISOString())
    .order('ignorada_hasta', { ascending: true })

  const ignoradasMap = new Map<string, Set<string>>()
  for (const i of ignoradasRaw ?? []) {
    const row = i as { id: string; referencia_id: string; tipo: string; ignorada_hasta: string }
    if (!ignoradasMap.has(row.tipo)) ignoradasMap.set(row.tipo, new Set())
    ignoradasMap.get(row.tipo)!.add(row.referencia_id)
  }
  function esIgnorada(tipo: string, id: string) {
    return ignoradasMap.get(tipo)?.has(id) ?? false
  }

  // Alertas en pausa (excluye las marcadas como permanentes con 2099)
  const PERMANENTE = '2099-01-01'
  interface PausadaItem { id: string; tipo: string; referenciaId: string; ignoradaHasta: string }
  const pausadasRaw: PausadaItem[] = (ignoradasRaw ?? [])
    .filter((i: any) => (i.ignorada_hasta as string) < PERMANENTE)
    .map((i: any) => ({ id: i.id as string, tipo: i.tipo as string, referenciaId: i.referencia_id as string, ignoradaHasta: i.ignorada_hasta as string }))

  let alertasEnPausa: AlertaIgnoradaConNombre[] = []
  if (pausadasRaw.length > 0) {
    const comercioRefIds  = pausadasRaw.filter(p => p.tipo === 'quiebre_stock' || p.tipo === 'sin_visita').map(p => p.referenciaId)
    const campanaRefIds   = pausadasRaw.filter(p => p.tipo === 'campana_riesgo').map(p => p.referenciaId)
    const gondoleroRefIds = pausadasRaw.filter(p => p.tipo === 'gondolero_inactivo').map(p => p.referenciaId)

    const [comRes, camRes, gonRes] = await Promise.all([
      comercioRefIds.length  > 0 ? admin.from('comercios').select('id, nombre').in('id', comercioRefIds)  : Promise.resolve({ data: [] }),
      campanaRefIds.length   > 0 ? admin.from('campanas').select('id, nombre').in('id', campanaRefIds)    : Promise.resolve({ data: [] }),
      gondoleroRefIds.length > 0 ? admin.from('profiles').select('id, nombre, alias').in('id', gondoleroRefIds) : Promise.resolve({ data: [] }),
    ])

    const comMap = new Map((comRes.data ?? []).map((c: any) => [c.id, c.nombre as string]))
    const camMap = new Map((camRes.data ?? []).map((c: any) => [c.id, c.nombre as string]))
    const gonMap = new Map((gonRes.data ?? []).map((g: any) => [g.id, (g.alias ?? g.nombre ?? 'Gondolero') as string]))

    alertasEnPausa = pausadasRaw.map(p => ({
      id:            p.id,
      tipo:          p.tipo,
      ignoradaHasta: p.ignoradaHasta,
      nombre:
        p.tipo === 'campana_riesgo'     ? (camMap.get(p.referenciaId) ?? 'Campaña') :
        p.tipo === 'gondolero_inactivo' ? (gonMap.get(p.referenciaId) ?? 'Gondolero') :
        (comMap.get(p.referenciaId) ?? 'Comercio'),
    }))
  }

  // ── TIPO 1: Quiebre de stock ───────────────────────────────────────────────
  // Ya no se cuenta nada: la consulta que había leía `fotos.declaracion`, que
  // es una fuente que el catálogo NO declara para esta métrica y que además
  // está congelada desde abril de 2026. Ver lib/alertas-distri.ts.
  const quiebre = estadoQuiebre(
    await contarCamposTipificados(campanaIds, 'quiebre_stock', admin))

  // ── TIPO 2: Comercios sin visita ──────────────────────────────────────────
  interface ComercioSinVisita { id: string; nombre: string; diasSinVisita: number }
  let sinVisita: ComercioSinVisita[] = []

  {
    const { data: fotasRec } = await admin
      .from('fotos')
      .select('comercio_id, created_at')
      .in('campana_id', safeCampanaIds)
      .gte('created_at', sesentaAtras.toISOString())
      .order('created_at', { ascending: false })
      .limit(2000)

    const lastVisitMap = new Map<string, Date>()
    for (const f of fotasRec ?? []) {
      const fo = f as { comercio_id: string; created_at: string }
      if (!lastVisitMap.has(fo.comercio_id)) {
        lastVisitMap.set(fo.comercio_id, new Date(fo.created_at))
      }
    }

    const sinVisitaEntries = [...lastVisitMap.entries()]
      .filter(([id, d]) => d < treintaAtras && !esIgnorada('sin_visita', id))
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
    .select('id, nombre, minimo_comercios, comercios_relevados, fecha_fin')
    .eq('distri_id', distriId)
    .eq('estado', 'activa')
    .not('fecha_fin', 'is', null)
    .not('minimo_comercios', 'is', null)
    .order('fecha_fin', { ascending: true })

  // La alerta no se disparó nunca desde que existe. Tenía dos motivos, los dos
  // sobre el denominador y ninguno sobre el numerador:
  //   1. filtraba por `objetivo_comercios IS NOT NULL`, y esa columna estaba
  //      vacía en las 23 campañas de las dos bases: la query devolvía siempre
  //      cero filas;
  //   2. comparaba contra ese mismo valor nulo, así que `x < 0` daba false.
  // Ahora el denominador es `minimo_comercios`, que el editor exige. El filtro
  // por NOT NULL se mantiene pero ya no es una trampa: solo deja afuera las
  // campañas anteriores al cambio, que no tienen mínimo cargado.
  //
  // El umbral es la mitad del mínimo: a menos de tres días del cierre y sin
  // haber llegado ni a la mitad del piso de representatividad, la campaña no
  // va a servir.
  const campanasRiesgo = (campanasRaw ?? []).filter(c =>
    new Date(c.fecha_fin!) < tresDiasAdelante &&
    (c.comercios_relevados ?? 0) < (c.minimo_comercios ?? 0) * 0.5 &&
    !esIgnorada('campana_riesgo', c.id)
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

    // Obtener perfiles de gondoleros actuales para el nombre/alias
    const { data: gondoleroProfiles } = await admin
      .from('profiles')
      .select('id, nombre, alias')
      .in('id', gondoleroIds)

    const inactivoProfiles = (gondoleroProfiles ?? []).filter(
      (g: { id: string }) => !activoSet.has(g.id) && !esIgnorada('gondolero_inactivo', g.id)
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
          : -1,
      })).sort((a, b) => b.diasSinActividad - a.diasSinActividad)
    }
  }

  // Quiebre de stock no suma: no está midiendo, y un contador que incluyera
  // un cero de algo que no se mide vuelve a mezclar "no pasa nada" con "no
  // estamos mirando".
  const totalAlertas = sinVisita.length + campanasRiesgo.length + gondolerosInactivos.length

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
        icon={<PackageX size={18} className="text-gray-400" />}
        titulo="Quiebre de stock"
        badge={0}
        badgeColor="bg-red-500"
      >
        <SinMedir {...textoQuiebre(quiebre)} />
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
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <Link
                  href="/distribuidora/campanas"
                  className="text-xs font-semibold text-gondo-amber-400 hover:underline"
                >
                  Asignar a campaña
                </Link>
                <IgnorarAlertaBoton tipo="sin_visita" referenciaId={c.id} />
              </div>
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
            const progreso = calcularPorcentaje(c.comercios_relevados ?? 0, c.minimo_comercios ?? 0)
            const vig = etiquetaVigencia(c.fecha_fin, { corto: true })
            return (
              <div key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 truncate mr-3">{c.nombre}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    {vig !== null && (
                      <span className={`text-xs font-semibold ${vig.vencida ? 'text-gray-400' : 'text-red-500'}`}>
                        {vig.texto}
                      </span>
                    )}
                    <Link
                      href={`/distribuidora/campanas/${c.id}`}
                      className="text-xs font-semibold text-gondo-amber-400 hover:underline"
                    >
                      Ver campaña
                    </Link>
                    <IgnorarAlertaBoton tipo="campana_riesgo" referenciaId={c.id} />
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {c.comercios_relevados ?? 0} / {c.minimo_comercios} comercios ({Math.round(progreso)}%)
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
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <Link
                  href="/distribuidora/gondoleros"
                  className="text-xs font-semibold text-gondo-amber-400 hover:underline"
                >
                  Ver perfil
                </Link>
                <IgnorarAlertaBoton tipo="gondolero_inactivo" referenciaId={g.id} />
              </div>
            </div>
          ))
        )}
      </AlertSection>

      {/* ── Alertas en pausa ── */}
      <AlertasEnPausa alertas={alertasEnPausa} />

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

/**
 * El hueco, dicho de frente. Reemplaza al "✅ Todo en orden" en la única
 * sección que no está midiendo nada: un tilde verde es una AFIRMACIÓN, y acá
 * no hay nada que afirmar.
 *
 * Va en gris y no en rojo a propósito: no es una alerta encendida, es una
 * alerta que no existe. Pintarla de rojo mandaría a la distribuidora a buscar
 * un quiebre que nadie midió.
 */
function SinMedir({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-medium text-gray-600">{titulo}</p>
      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{detalle}</p>
    </div>
  )
}

function TodoOrden() {
  return (
    <div className="px-4 py-5 text-center">
      <p className="text-sm text-gray-400">✅ Todo en orden</p>
    </div>
  )
}
