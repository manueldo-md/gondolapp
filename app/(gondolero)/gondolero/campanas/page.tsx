import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import type { TipoCampana } from '@/types'
import { CampanasSections, type CampanaCardData } from './campanas-sections'

// CampanaRow: alias del tipo exportado desde campanas-sections
type CampanaRow = CampanaCardData

export default async function CampanasPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // Zonas declaradas por el gondolero
  const { data: gondoleroZonas } = await supabase
    .from('gondolero_zonas')
    .select('zona_id')
    .eq('gondolero_id', user.id)

  const zonaIds = (gondoleroZonas ?? []).map((gz: { zona_id: string }) => gz.zona_id)
  const tieneZonas = zonaIds.length > 0

  // Participaciones del gondolero (todos los estados)
  const [participacionesRes, profileRes] = await Promise.all([
    supabase
      .from('participaciones')
      .select('campana_id, estado')
      .eq('gondolero_id', user.id)
      .in('estado', ['activa', 'completada', 'abandonada']),
    supabase
      .from('profiles')
      .select('nivel, distri_id')
      .eq('id', user.id)
      .single(),
  ])

  const participacionMap = new Map<string, 'activa' | 'completada' | 'abandonada'>()
  for (const p of (participacionesRes.data ?? []) as { campana_id: string; estado: string }[]) {
    // Si ya tiene activa, no sobreescribir
    if (!participacionMap.has(p.campana_id) || p.estado === 'activa') {
      participacionMap.set(p.campana_id, p.estado as 'activa' | 'completada' | 'abandonada')
    }
  }
  const gondoleroNivel = (profileRes.data as { nivel: string; distri_id: string | null } | null)?.nivel ?? 'casual'
  const gondoleroDistriId = (profileRes.data as { nivel: string; distri_id: string | null } | null)?.distri_id ?? null
  const campanaIdsActivas = new Set([...participacionMap.entries()].filter(([, e]) => e === 'activa').map(([id]) => id))

  let query = supabase
    .from('campanas')
    .select(`
      id, nombre, tipo, marca_id, distri_id, financiada_por,
      puntos_por_foto, fecha_fin, fecha_limite_inscripcion, objetivo_comercios,
      tope_total_comercios, comercios_relevados, instruccion, min_comercios_para_cobrar,
      nivel_minimo, es_abierta, created_at,
      marca:marcas ( razon_social ),
      bloques_foto ( id )
    `)
    .eq('estado', 'activa')
    .order('created_at', { ascending: false })

  let lista: CampanaRow[] = []

  if (tieneZonas) {
    const { data: campanaZonas } = await supabase
      .from('campana_zonas')
      .select('campana_id')
      .in('zona_id', zonaIds)

    const campanaIdsConZona = (campanaZonas ?? []).map((cz: { campana_id: string }) => cz.campana_id)

    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)

    const todas = (campanas as CampanaRow[] | null) ?? []
    const { data: todasCampanaZonas } = await supabase
      .from('campana_zonas')
      .select('campana_id')
    const campanasConAlgunaZona = new Set((todasCampanaZonas ?? []).map((cz: { campana_id: string }) => cz.campana_id))

    lista = todas.filter(c =>
      (c as unknown as { es_abierta: boolean }).es_abierta ||
      campanaIdsConZona.includes(c.id) ||
      !campanasConAlgunaZona.has(c.id)
    )
  } else {
    const { data: campanas, error } = await query
    if (error) console.error('Error fetching campanas:', error.message)
    lista = (campanas as CampanaRow[] | null) ?? []
  }

  const activas     = lista.filter(c => participacionMap.get(c.id) === 'activa')
  const completadas = lista.filter(c => participacionMap.get(c.id) === 'completada')
  const disponibles = lista.filter(c => {
    const estado = participacionMap.get(c.id)
    return !estado || estado === 'abandonada'
  })

  // Record plano para el cliente (Map no es serializable)
  const participacionRecord = Object.fromEntries(participacionMap.entries()) as Record<string, 'activa' | 'completada' | 'abandonada'>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutGrid size={20} className="text-gondo-verde-400" />
          <h1 className="text-lg font-bold text-gray-900">Campañas</h1>
        </div>
        {lista.length > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {lista.length} {lista.length === 1 ? 'campaña activa' : 'campañas activas'}
          </p>
        )}
      </div>

      {!tieneZonas && (
        <div className="mx-4 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <span className="text-amber-500 shrink-0 mt-0.5">⚠️</span>
          <p className="text-sm text-amber-800">
            Seleccioná tus zonas de trabajo en tu{' '}
            <a href="/gondolero/perfil" className="font-semibold underline">Perfil</a>{' '}
            para ver solo las campañas de tu ciudad.
          </p>
        </div>
      )}

      <div className="px-4 py-4">
        <CampanasSections
          activas={activas}
          completadas={completadas}
          disponibles={disponibles}
          gondoleroNivel={gondoleroNivel}
          gondoleroDistriId={gondoleroDistriId}
          participacionRecord={participacionRecord}
        />
      </div>
    </div>
  )
}
