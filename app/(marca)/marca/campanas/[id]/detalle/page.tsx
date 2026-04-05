import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Calendar, Target, Coins, MapPin, Camera, AlertCircle, Link2 } from 'lucide-react'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana, diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { CopiarLinkBtn } from '../copiar-link-btn'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MarcaCampanaDetallePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  const { data: profile } = await admin.from('profiles').select('marca_id').eq('id', user.id).single()
  const marcaId = profile?.marca_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, financiada_por, via_ejecucion, motivo_rechazo,
      fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      objetivo_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
      puntos_por_foto, instruccion, es_abierta, marca_id, created_at,
      bloques_foto ( id, orden, instruccion, tipo_contenido ),
      campana_zonas ( zona_id, zonas ( id, nombre ) )
    `)
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // Walled garden: only the owner marca can see this
  if ((campana as any).marca_id !== marcaId) notFound()

  // Token de invitación
  let linkInvitacion: string | null = null
  if ((campana as any).estado === 'pendiente_aprobacion' && (campana as any).via_ejecucion === 'distribuidora') {
    const { data: tokenRow } = await admin
      .from('campana_tokens').select('token')
      .eq('campana_id', params.id).eq('usado', false).gt('expira_at', new Date().toISOString()).maybeSingle()
    if (tokenRow?.token) {
      linkInvitacion = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp.com'}/distri/invitacion-campana/${tokenRow.token}`
    }
  }

  // Zonas disponibles para agregar
  const { data: todasZonas } = await admin.from('zonas').select('id, nombre').order('nombre')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  const zonaIds = new Set((c.campana_zonas ?? []).map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.id : cz.zonas?.id).filter(Boolean))
  const zonasActuales = (c.campana_zonas ?? []).map((cz: any) => Array.isArray(cz.zonas) ? cz.zonas[0]?.nombre : cz.zonas?.nombre).filter(Boolean)
  const zonasDisponibles = (todasZonas ?? []).filter((z: any) => !zonaIds.has(z.id))

  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const bloques = (c.bloques_foto ?? []).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

  // ── Inline server actions ────────────────────────────────────────────────────

  async function guardarDescripcion(formData: FormData) {
    'use server'
    const instruccion = (formData.get('instruccion') as string)?.trim() ?? ''
    adminClient().from('campanas').update({ instruccion }).eq('id', params.id).then(() => {})
    revalidatePath(`/marca/campanas/${params.id}/detalle`)
  }

  async function guardarPuntos(formData: FormData) {
    'use server'
    const nuevos = parseInt(formData.get('puntos') as string, 10)
    if (isNaN(nuevos) || nuevos <= (c.puntos_por_foto ?? 0)) return
    adminClient().from('campanas').update({ puntos_por_foto: nuevos }).eq('id', params.id).then(() => {})
    revalidatePath(`/marca/campanas/${params.id}/detalle`)
  }

  async function agregarZona(formData: FormData) {
    'use server'
    const zonaId = formData.get('zona_id') as string
    if (!zonaId) return
    adminClient().from('campana_zonas').insert({ campana_id: params.id, zona_id: zonaId }).then(() => {})
    revalidatePath(`/marca/campanas/${params.id}/detalle`)
  }

  async function agregarBloque(formData: FormData) {
    'use server'
    const instruccionBloque = (formData.get('instruccion') as string)?.trim()
    const tipoContenido = (formData.get('tipo_contenido') as string) || 'propios'
    if (!instruccionBloque) return
    const ordenMax = bloques.length
    adminClient().from('bloques_foto').insert({
      campana_id: params.id,
      orden: ordenMax + 1,
      instruccion: instruccionBloque,
      tipo_contenido: tipoContenido,
    }).then(() => {})
    revalidatePath(`/marca/campanas/${params.id}/detalle`)
  }

  const TIPO_CONTENIDO_LABEL: Record<string, string> = {
    propios: 'Productos propios', competencia: 'Competencia', ambos: 'Ambos', ninguno: 'Ninguno',
  }

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/marca/campanas"
        detalleHref={`/marca/campanas/${params.id}/detalle`}
        resultadosHref={`/marca/campanas/${params.id}/resultados`}
        activo="detalle"
      />

      {/* Info básica */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gondo-indigo-50 text-gondo-indigo-600">
            {labelTipoCampana(c.tipo as TipoCampana)}
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
            c.estado === 'borrador' && c.motivo_rechazo ? 'bg-red-50 text-red-700 border-red-200' : colorEstadoCampana(c.estado as EstadoCampana)
          }`}>
            {c.estado === 'borrador' && c.motivo_rechazo ? 'Rechazada' : labelEstadoCampana(c.estado as EstadoCampana)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {c.fecha_inicio && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400">Inicio</p><p className="font-medium text-gray-900">{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</p></div>
            </div>
          )}
          {c.fecha_fin && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400">Fin{dias !== null ? ` · ${dias}d restantes` : ''}</p><p className={`font-medium ${dias !== null && dias <= 3 ? 'text-red-600' : 'text-gray-900'}`}>{new Date(c.fecha_fin).toLocaleDateString('es-AR')}</p></div>
            </div>
          )}
          {c.objetivo_comercios && (
            <div className="flex items-start gap-2">
              <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400">Objetivo</p><p className="font-medium text-gray-900">{c.objetivo_comercios} comercios</p></div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Mín. para cobrar</p><p className="font-medium text-gray-900">{c.min_comercios_para_cobrar} fotos</p></div>
          </div>
          <div className="flex items-start gap-2">
            <Coins size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Puntos por foto</p><p className="font-bold text-gondo-indigo-600">{c.puntos_por_foto}</p></div>
          </div>
        </div>
      </div>

      {/* Campaña rechazada */}
      {c.estado === 'borrador' && c.motivo_rechazo && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-5 mb-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800 mb-1">Campaña rechazada</h4>
              <p className="text-sm text-red-700">{c.motivo_rechazo}</p>
            </div>
          </div>
        </div>
      )}

      {/* Link de invitación */}
      {c.estado === 'pendiente_aprobacion' && c.via_ejecucion === 'distribuidora' && (
        <div className="bg-white rounded-xl border border-gondo-indigo-100 p-5 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={15} className="text-gondo-indigo-600" />
            <h4 className="font-semibold text-gray-900">Invitá a la distribuidora</h4>
          </div>
          {linkInvitacion ? (
            <>
              <p className="text-sm text-gray-500 mb-3">Enviá este link a la distribuidora. Expira en 7 días.</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
                <span className="text-xs text-gray-500 truncate flex-1 font-mono">{linkInvitacion}</span>
              </div>
              <CopiarLinkBtn link={linkInvitacion} />
            </>
          ) : (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">No hay link activo. Contactá a soporte.</p>
          )}
        </div>
      )}

      {/* Descripción editable */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Descripción / Instrucciones</h3>
        <form action={guardarDescripcion}>
          <textarea
            name="instruccion"
            defaultValue={c.instruccion ?? ''}
            rows={3}
            placeholder="Instrucciones para el gondolero…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/30 resize-none"
          />
          <button type="submit" className="mt-2 px-4 py-2 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-gondo-indigo-400 transition-colors">
            Guardar descripción
          </button>
        </form>
      </div>

      {/* Puntos por foto (solo aumentar) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Puntos por foto</h3>
        <p className="text-xs text-gray-400 mb-3">Solo podés aumentar el bounty, no reducirlo.</p>
        <form action={guardarPuntos} className="flex items-center gap-3">
          <input
            type="number"
            name="puntos"
            defaultValue={c.puntos_por_foto}
            min={c.puntos_por_foto}
            className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/30"
          />
          <button type="submit" className="px-4 py-2 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-gondo-indigo-400 transition-colors">
            Actualizar puntos
          </button>
        </form>
      </div>

      {/* Zonas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <MapPin size={14} className="text-gray-400" />
          Zonas
        </h3>
        {zonasActuales.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {zonasActuales.map((z: string) => (
              <span key={z} className="text-xs px-2.5 py-1 bg-gondo-indigo-50 text-gondo-indigo-600 rounded-full border border-gondo-indigo-100">{z}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mb-3">Sin zonas (visible para todos los gondoleros)</p>
        )}
        {zonasDisponibles.length > 0 && (
          <form action={agregarZona} className="flex items-center gap-2">
            <select name="zona_id" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none flex-1">
              <option value="">Seleccionar zona…</option>
              {zonasDisponibles.map((z: any) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-gondo-indigo-400 transition-colors whitespace-nowrap">
              + Agregar
            </button>
          </form>
        )}
      </div>

      {/* Bloques de foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Camera size={14} className="text-gray-400" />
          Bloques de foto ({bloques.length})
        </h3>
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
          <textarea
            name="instruccion"
            rows={2}
            placeholder="Instrucción del nuevo bloque…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gondo-indigo-600/30 resize-none"
          />
          <div className="flex items-center gap-2">
            <select name="tipo_contenido" className="rounded-lg border border-gray-200 px-3 py-2 text-sm flex-1">
              <option value="propios">Productos propios</option>
              <option value="competencia">Competencia</option>
              <option value="ambos">Ambos</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-gondo-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-gondo-indigo-400 transition-colors whitespace-nowrap">
              + Agregar bloque
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
