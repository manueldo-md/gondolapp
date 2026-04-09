import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import type { TipoCampana } from '@/types'
import { CampanasSections, type CampanaCardData } from './campanas-sections'

type CampanaRow = CampanaCardData

const CAMPANA_SELECT = `
  id, nombre, tipo, marca_id, distri_id, financiada_por, via_ejecucion, estado,
  puntos_por_foto, fecha_fin, fecha_limite_inscripcion, objetivo_comercios,
  tope_total_comercios, comercios_relevados, instruccion, min_comercios_para_cobrar,
  max_comercios_por_gondolero, nivel_minimo, es_abierta, created_at,
  marca:marcas ( razon_social ),
  distri:distribuidoras ( razon_social ),
  bloques_foto ( id )
`

export default async function CampanasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const [gondoleroZonasRes, gondoleroLocalidadesRes] = await Promise.all([
    supabase.from('gondolero_zonas').select('zona_id').eq('gondolero_id', user.id),
    supabase.from('gondolero_localidades').select('localidad_id').eq('gondolero_id', user.id),
  ])

  const zonaIds = (gondoleroZonasRes.data ?? []).map((gz: { zona_id: string }) => gz.zona_id)
  const localidadIds = (gondoleroLocalidadesRes.data ?? []).map((gl: { localidad_id: number }) => gl.localidad_id)
  const tieneZonas = zonaIds.length > 0 || localidadIds.length > 0

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const [participacionesRes, profileRes, misDistrisGondoleroRes, misDistrisFixerRes, misionesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('participaciones')
      .select('campana_id, estado, comercios_completados')
      .eq('gondolero_id', user.id)
      .in('estado', ['activa', 'completada', 'abandonada']),
    supabase
      .from('profiles')
      .select('nivel, tipo_actor')
      .eq('id', user.id)
      .single(),
    supabase
      .from('gondolero_distri_solicitudes')
      .select('distri_id')
      .eq('gondolero_id', user.id)
      .eq('estado', 'aprobada'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_distri_solicitudes')
      .select('distri_id')
      .eq('fixer_id', user.id)
      .eq('estado', 'aprobada'),
    supabase
      .from('misiones')
      .select('campana_id')
      .eq('gondolero_id', user.id),
  ])

  const participacionMap = new Map<string, 'activa' | 'completada' | 'abandonada'>()
  const comerciosCompletadosMap = new Map<string, number>()
  const participacionesRaw = (participacionesRes.data ?? []) as { campana_id: string; estado: string; comercios_completados: number }[]
  for (const p of participacionesRaw) {
    if (!participacionMap.has(p.campana_id) || p.estado === 'activa') {
      participacionMap.set(p.campana_id, p.estado as 'activa' | 'completada' | 'abandonada')
      comerciosCompletadosMap.set(p.campana_id, p.comercios_completados ?? 0)
    }
  }

  const gondoleroNivel = (profileRes.data as { nivel: string; tipo_actor: string } | null)?.nivel ?? 'casual'
  const gondoleroTipoActor = (profileRes.data as { nivel: string; tipo_actor: string } | null)?.tipo_actor ?? 'gondolero'
  const esFixer = gondoleroTipoActor === 'fixer'
  const misDistriIds = esFixer
    ? (misDistrisFixerRes.data ?? []).map((d: { distri_id: string }) => d.distri_id)
    : (misDistrisGondoleroRes.data ?? []).map((d: { distri_id: string }) => d.distri_id)

  // Misiones: qué campañas tiene el gondolero y cuántas misiones por campaña
  const misionCampanaIds = new Set<string>()
  const misionesCountMap = new Map<string, number>()
  for (const m of (misionesRes.data ?? []) as { campana_id: string }[]) {
    misionCampanaIds.add(m.campana_id)
    misionesCountMap.set(m.campana_id, (misionesCountMap.get(m.campana_id) ?? 0) + 1)
  }

  // Relaciones marca-distri activas
  let relacionesMarcaDistri: { marca_id: string; distri_id: string }[] = []
  if (misDistriIds.length > 0) {
    const { data: relRes } = await supabase
      .from('marca_distri_relaciones')
      .select('marca_id, distri_id')
      .in('distri_id', misDistriIds)
      .eq('estado', 'activa')
    relacionesMarcaDistri = (relRes ?? []) as { marca_id: string; distri_id: string }[]
  }

  function tieneAcceso(c: CampanaRow): boolean {
    const fp = c.financiada_por
    if (!fp || fp === 'gondolapp') return true
    if ((c as unknown as { via_ejecucion: string | null }).via_ejecucion === 'gondolapp') return true
    if (fp === 'distri') return !!c.distri_id && misDistriIds.includes(c.distri_id)
    if (fp === 'marca') {
      if (!c.marca_id) return true
      if (c.distri_id) return misDistriIds.includes(c.distri_id)
      return relacionesMarcaDistri.some(r => r.marca_id === c.marca_id)
    }
    return false
  }

  // ── Query de campañas activas (con filtro de zona) ────────────────────────────
  // Filtrar por actor_campana según tipo_actor del usuario
  let query = supabase
    .from('campanas')
    .select(CAMPANA_SELECT)
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })

  if (esFixer) {
    query = query.eq('actor_campana', 'fixer')
  } else {
    query = query.or('actor_campana.eq.gondolero,actor_campana.is.null')
  }

  let listaActivas: CampanaRow[] = []

  if (tieneZonas) {
    // Campañas que coinciden con las zonas del gondolero (ambos sistemas)
    const [campanaZonasOldRes, campanaZonasNewRes] = await Promise.all([
      zonaIds.length > 0
        ? supabase.from('campana_zonas').select('campana_id').in('zona_id', zonaIds)
        : Promise.resolve({ data: [] as { campana_id: string }[] }),
      localidadIds.length > 0
        ? supabase.from('campana_localidades').select('campana_id').in('localidad_id', localidadIds)
        : Promise.resolve({ data: [] as { campana_id: string }[] }),
    ])

    const campanaIdsConZona = [
      ...(campanaZonasOldRes.data ?? []).map((cz: { campana_id: string }) => cz.campana_id),
      ...(campanaZonasNewRes.data ?? []).map((cl: { campana_id: string }) => cl.campana_id),
    ]

    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)

    const todas = (campanas as CampanaRow[] | null) ?? []

    // Todas las campañas que tienen alguna zona asignada (para saber cuáles son "abiertas por default")
    const [todasZonasOldRes, todasZonasNewRes] = await Promise.all([
      supabase.from('campana_zonas').select('campana_id'),
      supabase.from('campana_localidades').select('campana_id'),
    ])
    const campanasConAlgunaZona = new Set([
      ...(todasZonasOldRes.data ?? []).map((cz: { campana_id: string }) => cz.campana_id),
      ...(todasZonasNewRes.data ?? []).map((cl: { campana_id: string }) => cl.campana_id),
    ])

    listaActivas = todas.filter(c =>
      (c as unknown as { es_abierta: boolean }).es_abierta ||
      campanaIdsConZona.includes(c.id) ||
      !campanasConAlgunaZona.has(c.id)
    )
  } else {
    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)
    listaActivas = (campanas as CampanaRow[] | null) ?? []
  }

  const IDS_DEBUG = ['4ee88708-3c21-45fb-8c37-7932e5fe5499', '694fa4f9-3c21-45fb-8c37-7932e5fe5499']
  console.log('[campanas-lista] tieneZonas:', tieneZonas, 'zonaIds:', zonaIds, 'localidadIds:', localidadIds)
  console.log('[campanas-lista] listaActivas total:', listaActivas.length)
  console.log('[campanas-lista] candidatas disponibles (antes tieneAcceso):', listaActivas.length, '— IDs debug en listaActivas:', IDS_DEBUG.filter(id => listaActivas.some(c => c.id === id)))

  // ── Sección 1: En curso ──────────────────────────────────────────────────────
  // REGLA: participacion_estado='activa' AND campana.estado='activa'
  // listaActivas ya filtra por campana.estado='activa'
  const misCampanas = listaActivas
    .filter(c => participacionMap.has(c.id) || misionCampanaIds.has(c.id))
    .sort((a, b) => {
      if (!a.fecha_fin && !b.fecha_fin) return 0
      if (!a.fecha_fin) return 1
      if (!b.fecha_fin) return -1
      return new Date(a.fecha_fin).getTime() - new Date(b.fecha_fin).getTime()
    })

  const misCampanasIds = new Set(misCampanas.map(c => c.id))

  // ── Sección 2: Disponibles ────────────────────────────────────────────────────
  // REGLA: campana.estado='activa' AND sin participación del gondolero
  // completada → ocultar (cupo completado); abandonada → puede volver → disponible
  const disponibles = listaActivas.filter(c =>
    !misCampanasIds.has(c.id)   // no tiene participación ni misiones
    && tieneAcceso(c)           // cumple requisitos de zona y nivel
  )
  console.log('[campanas-lista] disponibles después de filtro:', disponibles.length, '— IDs debug en disponibles:', IDS_DEBUG.filter(id => disponibles.some(c => c.id === id)))

  // ── Sección 3: Finalizadas ────────────────────────────────────────────────────
  // REGLA: campana.estado IN ('cerrada','suspendida') AND (tiene participación OR misiones)
  const activaIds = new Set(listaActivas.map(c => c.id))
  const todasMisIds = new Set([...misionCampanaIds, ...participacionMap.keys()])
  const finalizadasPotenciales = [...todasMisIds].filter(id => !activaIds.has(id))

  let finalizadas: CampanaRow[] = []
  if (finalizadasPotenciales.length > 0) {
    const { data: finalizadasData } = await supabase
      .from('campanas')
      .select(CAMPANA_SELECT)
      .in('estado', ['cerrada', 'suspendida'])
      .in('id', finalizadasPotenciales)
      .order('fecha_fin', { ascending: false })
    finalizadas = (finalizadasData as CampanaRow[] | null) ?? []
  }

  // Progreso por campaña: contar misiones directamente
  const comerciosCompletadosRecord: Record<string, number> = Object.fromEntries(misionesCountMap.entries())

  const totalActivas = misCampanas.length + disponibles.length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Campañas</h1>
        </div>
        {totalActivas > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {totalActivas} {totalActivas === 1 ? 'campaña activa' : 'campañas activas'}
          </p>
        )}
      </div>

      {!tieneZonas && (
        <div className="mx-4 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
          <p className="text-sm text-amber-800">
            Seleccioná tus localidades de trabajo en tu{' '}
            <a href="/gondolero/perfil" className="font-semibold underline">Perfil</a>{' '}
            para ver solo las campañas de tu ciudad.
          </p>
        </div>
      )}

      <div className="px-4 py-4">
        <CampanasSections
          misCampanas={misCampanas}
          disponibles={disponibles}
          finalizadas={finalizadas}
          gondoleroNivel={gondoleroNivel}
          misDistriIds={misDistriIds}
          comerciosCompletadosRecord={comerciosCompletadosRecord}
        />
      </div>
    </div>
  )
}
