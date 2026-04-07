import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { Calendar, Target, Coins, Clock, Users } from 'lucide-react'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana, diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { CampanaDraftEditor } from '@/components/campanas/draft-editor'
import {
  guardarBorradorDistri,
  republicarCampanaDistri,
  descartarCambiosDistri,
} from './draft-actions'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NIVEL_COLOR: Record<string, string> = {
  casual: 'bg-gray-100 text-gray-600', activo: 'bg-blue-100 text-blue-700', pro: 'bg-amber-100 text-amber-700',
}
const NIVEL_LABEL: Record<string, string> = { casual: 'Casual', activo: 'Activo', pro: 'Pro' }
const ESTADO_PART_COLOR: Record<string, string> = {
  activa: 'bg-blue-100 text-blue-700', completada: 'bg-green-100 text-green-700', abandonada: 'bg-gray-100 text-gray-500',
}
const ESTADO_PART_LABEL: Record<string, string> = { activa: 'Activa', completada: 'Completada', abandonada: 'Abandonada' }

export default async function DistriCampanaDetallePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin.from('profiles').select('distri_id').eq('id', user.id).single()
  const distriId = profile?.distri_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por, fecha_inicio, fecha_fin,
      objetivo_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
      puntos_por_foto, instruccion, distri_id, marca_id, created_at, updated_at,
      tiene_draft, draft_descripcion, draft_bounty, draft_zonas, draft_bloques,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido, bloque_campos ( id, orden, tipo, pregunta, opciones, obligatorio ) ),
      campana_zonas ( zona_id, zonas ( id, nombre ) )
    `)
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).distri_id !== distriId) notFound()

  const { data: partData } = await admin
    .from('participaciones')
    .select('id, estado, comercios_completados, joined_at, gondolero:profiles(nombre, alias, nivel)')
    .eq('campana_id', params.id)
    .order('joined_at', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const participaciones = ((partData ?? []) as any[]).map((p: any) => ({
    ...p,
    gondolero: Array.isArray(p.gondolero) ? (p.gondolero[0] ?? null) : p.gondolero,
  }))

  const { data: todasZonas } = await admin.from('zonas').select('id, nombre').order('nombre')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  const zonaIds = new Set((c.campana_zonas ?? []).map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.id : cz.zonas?.id).filter(Boolean))
  const zonasActuales: string[] = (c.campana_zonas ?? []).map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.nombre : cz.zonas?.nombre).filter(Boolean)
  const zonasDisponibles = (todasZonas ?? []).filter((z: any) => !zonaIds.has(z.id)) as { id: string; nombre: string }[]

  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const bloques = ((c.bloques_foto ?? []) as any[]).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
  const marcaNombre = Array.isArray(c.marca) ? c.marca[0]?.razon_social : c.marca?.razon_social

  const fechaCreacion = new Date(c.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fechaModif = c.updated_at && c.updated_at !== c.created_at
    ? new Date(c.updated_at).toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null
  const creadorLabel = c.financiada_por === 'distri' ? 'Tu distribuidora' : (marcaNombre ?? 'Marca')

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/distribuidora/campanas"
        detalleHref={`/distribuidora/campanas/${params.id}/detalle`}
        resultadosHref={`/distribuidora/campanas/${params.id}/resultados`}
        activo="detalle"
      />

      {/* Info básica */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
            {c.financiada_por === 'distri' ? 'Interna' : marcaNombre ? `Marca · ${marcaNombre}` : 'Marca'}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(c.estado as EstadoCampana)}`}>
            {labelEstadoCampana(c.estado as EstadoCampana)}
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gondo-indigo-50 text-gondo-indigo-600">
            {labelTipoCampana(c.tipo as TipoCampana)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {c.fecha_fin && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Fin{dias !== null ? ` · ${dias}d` : ''}</p>
                <p className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>
                  {new Date(c.fecha_fin).toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>
          )}
          {c.objetivo_comercios && (
            <div className="flex items-start gap-2">
              <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400">Objetivo</p><p className="font-medium text-gray-900">{c.objetivo_comercios} comercios</p></div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Coins size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Puntos/foto</p><p className="font-bold text-gondo-amber-400">{c.puntos_por_foto}</p></div>
          </div>
          <div className="flex items-start gap-2">
            <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Mín. para cobrar</p><p className="font-medium text-gray-900">{c.min_comercios_para_cobrar} fotos</p></div>
          </div>
        </div>
      </div>

      {/* MEJORA 2 — Bloque de creación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Información de campaña</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-gray-400">Creada por</dt>
              <dd className="font-medium text-gray-900">{creadorLabel}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-gray-400">Creada el</dt>
              <dd className="font-medium text-gray-900">{fechaCreacion}</dd>
            </div>
          </div>
          {fechaModif && (
            <div className="flex items-start gap-2">
              <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-xs text-gray-400">Última modificación</dt>
                <dd className="font-medium text-gray-900">{fechaModif}</dd>
              </div>
            </div>
          )}
          {c.tiene_draft && (
            <div className="flex items-center gap-2 mt-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-[11px] font-semibold text-amber-700">Tiene borrador guardado sin publicar</span>
            </div>
          )}
        </dl>
      </div>

      {/* MEJORA 1+3 — Editor de draft */}
      <CampanaDraftEditor
        campanaId={params.id}
        instruccionActual={c.instruccion ?? null}
        puntosActual={c.puntos_por_foto ?? 0}
        tienesDraft={c.tiene_draft ?? false}
        draftDescripcion={c.draft_descripcion ?? null}
        draftBounty={c.draft_bounty ?? null}
        draftZonasGuardadas={c.draft_zonas ?? null}
        draftBloquesGuardados={c.draft_bloques ?? null}
        zonasActuales={zonasActuales}
        zonasDisponibles={zonasDisponibles}
        bloquesActuales={bloques.map((b: any) => ({ id: b.id, instruccion: b.instruccion, tipo_contenido: b.tipo_contenido, campos: ((b.bloque_campos ?? []) as any[]).sort((a: any, x: any) => (a.orden ?? 0) - (x.orden ?? 0)) }))}
        accentColor="amber"
        guardarBorradorFn={guardarBorradorDistri}
        republicarFn={republicarCampanaDistri}
        descartarFn={descartarCambiosDistri}
      />

      {/* Gondoleros participando */}
      {participaciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mt-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <Users size={14} className="text-gray-400" />
            Gondoleros ({participaciones.length})
          </h3>
          <div className="divide-y divide-gray-50">
            {participaciones.map((p: any) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.gondolero?.alias ?? p.gondolero?.nombre ?? 'Gondolero'}
                  </p>
                  <p className="text-xs text-gray-400">{p.comercios_completados} comercios</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${NIVEL_COLOR[p.gondolero?.nivel ?? 'casual']}`}>
                    {NIVEL_LABEL[p.gondolero?.nivel ?? 'casual']}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_PART_COLOR[p.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {ESTADO_PART_LABEL[p.estado] ?? p.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
