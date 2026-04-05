import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Calendar, Target, Coins, MapPin, Camera, Users } from 'lucide-react'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana, diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'

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
      puntos_por_foto, instruccion, distri_id, marca_id, created_at,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, tipo_contenido ),
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
  const zonasActuales = (c.campana_zonas ?? []).map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.nombre : cz.zonas?.nombre).filter(Boolean)
  const zonasDisponibles = (todasZonas ?? []).filter((z: any) => !zonaIds.has(z.id))
  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const bloques = (c.bloques_foto ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
  const marcaNombre = Array.isArray(c.marca) ? c.marca[0]?.razon_social : c.marca?.razon_social

  const TIPO_CONTENIDO_LABEL: Record<string, string> = {
    propios: 'Productos propios', competencia: 'Competencia', ambos: 'Ambos', ninguno: 'Ninguno',
  }

  // ── Inline server actions ────────────────────────────────────────────────────

  async function guardarDescripcion(formData: FormData) {
    'use server'
    const instruccion = (formData.get('instruccion') as string)?.trim() ?? ''
    adminClient().from('campanas').update({ instruccion }).eq('id', params.id).then(() => {})
    revalidatePath(`/distribuidora/campanas/${params.id}/detalle`)
  }

  async function guardarPuntos(formData: FormData) {
    'use server'
    const nuevos = parseInt(formData.get('puntos') as string, 10)
    if (isNaN(nuevos) || nuevos <= (c.puntos_por_foto ?? 0)) return
    adminClient().from('campanas').update({ puntos_por_foto: nuevos }).eq('id', params.id).then(() => {})
    revalidatePath(`/distribuidora/campanas/${params.id}/detalle`)
  }

  async function agregarZona(formData: FormData) {
    'use server'
    const zonaId = formData.get('zona_id') as string
    if (!zonaId) return
    adminClient().from('campana_zonas').insert({ campana_id: params.id, zona_id: zonaId }).then(() => {})
    revalidatePath(`/distribuidora/campanas/${params.id}/detalle`)
  }

  async function agregarBloque(formData: FormData) {
    'use server'
    const instruccionBloque = (formData.get('instruccion') as string)?.trim()
    const tipoContenido = (formData.get('tipo_contenido') as string) || 'propios'
    if (!instruccionBloque) return
    adminClient().from('bloques_foto').insert({
      campana_id: params.id, orden: bloques.length + 1,
      instruccion: instruccionBloque, tipo_contenido: tipoContenido,
    }).then(() => {})
    revalidatePath(`/distribuidora/campanas/${params.id}/detalle`)
  }

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
              <div><p className="text-xs text-gray-400">Fin{dias !== null ? ` · ${dias}d` : ''}</p><p className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>{new Date(c.fecha_fin).toLocaleDateString('es-AR')}</p></div>
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

      {/* Descripción editable */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Descripción / Instrucciones</h3>
        <form action={guardarDescripcion}>
          <textarea name="instruccion" defaultValue={c.instruccion ?? ''} rows={3} placeholder="Instrucciones para el gondolero…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30 resize-none" />
          <button type="submit" className="mt-2 px-4 py-2 bg-gondo-amber-400 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
            Guardar descripción
          </button>
        </form>
      </div>

      {/* Puntos por foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Puntos por foto</h3>
        <p className="text-xs text-gray-400 mb-3">Solo podés aumentar el bounty.</p>
        <form action={guardarPuntos} className="flex items-center gap-3">
          <input type="number" name="puntos" defaultValue={c.puntos_por_foto} min={c.puntos_por_foto}
            className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30" />
          <button type="submit" className="px-4 py-2 bg-gondo-amber-400 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
            Actualizar
          </button>
        </form>
      </div>

      {/* Zonas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><MapPin size={14} className="text-gray-400" />Zonas</h3>
        {zonasActuales.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {zonasActuales.map((z: string) => <span key={z} className="text-xs px-2.5 py-1 bg-gondo-amber-50 text-gondo-amber-400 rounded-full border border-gondo-amber-200">{z}</span>)}
          </div>
        ) : <p className="text-xs text-gray-400 mb-3">Sin zonas (visible para todos)</p>}
        {zonasDisponibles.length > 0 && (
          <form action={agregarZona} className="flex items-center gap-2">
            <select name="zona_id" className="rounded-lg border border-gray-200 px-3 py-2 text-sm flex-1">
              <option value="">Seleccionar zona…</option>
              {zonasDisponibles.map((z: any) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 bg-gondo-amber-400 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">+ Agregar</button>
          </form>
        )}
      </div>

      {/* Bloques de foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Camera size={14} className="text-gray-400" />Bloques de foto ({bloques.length})</h3>
        {bloques.length > 0 && (
          <div className="space-y-2 mb-4">
            {bloques.map((b: any, i: number) => (
              <div key={b.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs font-bold text-gray-400 w-5 shrink-0 pt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{b.instruccion}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TIPO_CONTENIDO_LABEL[b.tipo_contenido] ?? b.tipo_contenido}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <form action={agregarBloque} className="space-y-2">
          <textarea name="instruccion" rows={2} placeholder="Instrucción del nuevo bloque…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/30 resize-none" />
          <div className="flex items-center gap-2">
            <select name="tipo_contenido" className="rounded-lg border border-gray-200 px-3 py-2 text-sm flex-1">
              <option value="propios">Productos propios</option>
              <option value="competencia">Competencia</option>
              <option value="ambos">Ambos</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-gondo-amber-400 text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap">+ Agregar bloque</button>
          </div>
        </form>
      </div>

      {/* Gondoleros participando */}
      {participaciones.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
            <Users size={14} className="text-gray-400" />
            Gondoleros ({participaciones.length})
          </h3>
          <div className="divide-y divide-gray-50">
            {participaciones.map((p: any) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {p.gondolero?.alias ?? p.gondolero?.nombre ?? 'Gondolero'}
                    </p>
                    <p className="text-xs text-gray-400">{p.comercios_completados} comercios</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${NIVEL_COLOR[p.gondolero?.nivel ?? 'casual']}`}>
                    {NIVEL_LABEL[p.gondolero?.nivel ?? 'casual']}
                  </span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_PART_COLOR[p.estado]}`}>
                    {ESTADO_PART_LABEL[p.estado]}
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
