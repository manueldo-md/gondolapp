import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { Calendar, Target, Coins, AlertCircle, Link2, Clock } from 'lucide-react'
import {
  labelEstadoCampana, colorEstadoCampana, labelTipoCampana, diasRestantes,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { CampanaDraftEditor } from '@/components/campanas/draft-editor'
import { CopiarLinkBtn } from '../copiar-link-btn'
import {
  guardarBorradorMarca,
  republicarCampanaMarca,
  descartarCambiosMarca,
} from './draft-actions'
import { ReenviarBtn } from './reenviar-btn'

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
      puntos_por_foto, instruccion, es_abierta, marca_id, created_at, updated_at,
      tiene_draft, draft_descripcion, draft_bounty, draft_zonas, draft_bloques,
      bloques_foto ( id, orden, instruccion, tipo_contenido, bloque_campos ( id, orden, tipo, pregunta, opciones, obligatorio ) ),
      campana_localidades ( localidad_id, localidades ( id, nombre ) )
    `)
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).marca_id !== marcaId) notFound()

  // Token de invitación
  let linkInvitacion: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any
  if (c.estado === 'pendiente_aprobacion' && c.via_ejecucion === 'distribuidora') {
    const { data: tokenRow } = await admin
      .from('campana_tokens').select('token')
      .eq('campana_id', params.id).eq('usado', false).gt('expira_at', new Date().toISOString()).maybeSingle()
    if (tokenRow?.token) {
      linkInvitacion = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp.com'}/distri/invitacion-campana/${tokenRow.token}`
    }
  }

  // Zonas (nuevo sistema: campana_localidades → localidades)
  const localidadesActuales = (c.campana_localidades ?? []) as any[]
  const localidadIdsActuales = new Set(
    localidadesActuales.map((cz: any) => String(Array.isArray(cz.localidades) ? cz.localidades[0]?.id : cz.localidades?.id)).filter(Boolean)
  )
  const zonasActuales: string[] = localidadesActuales
    .map((cz: any) => Array.isArray(cz.localidades) ? cz.localidades[0]?.nombre : cz.localidades?.nombre)
    .filter(Boolean)
  const { data: todasLocalidades } = await admin.from('localidades').select('id, nombre').order('nombre')
  const zonasDisponibles = (todasLocalidades ?? [])
    .filter((l: any) => !localidadIdsActuales.has(String(l.id)))
    .map((l: any) => ({ id: String(l.id), nombre: l.nombre }))

  const dias = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
  const bloques = ((c.bloques_foto ?? []) as any[]).sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))

  // Fecha de creación / modificación formateadas
  const fechaCreacion = new Date(c.created_at).toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const fechaModif = c.updated_at && c.updated_at !== c.created_at
    ? new Date(c.updated_at).toLocaleString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

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
              <div>
                <p className="text-xs text-gray-400">Inicio</p>
                <p className="font-medium text-gray-900">{new Date(c.fecha_inicio).toLocaleDateString('es-AR')}</p>
              </div>
            </div>
          )}
          {c.fecha_fin && (
            <div className="flex items-start gap-2">
              <Calendar size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Fin{dias !== null ? ` · ${dias}d restantes` : ''}</p>
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
            <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Mín. para cobrar</p><p className="font-medium text-gray-900">{c.min_comercios_para_cobrar} fotos</p></div>
          </div>
          {c.max_comercios_por_gondolero && (
            <div className="flex items-start gap-2">
              <Target size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div><p className="text-xs text-gray-400">Máx. por gondolero</p><p className="font-medium text-gray-900">{c.max_comercios_por_gondolero} comercios</p></div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Coins size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div><p className="text-xs text-gray-400">Puntos por foto</p><p className="font-bold text-gondo-indigo-600">{c.puntos_por_foto}</p></div>
          </div>
        </div>
      </div>

      {/* Zonas */}
      {zonasActuales.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Zonas</h3>
          <div className="flex flex-wrap gap-2">
            {zonasActuales.map((zona, i) => (
              <span key={i} className="text-xs px-2.5 py-1 bg-gondo-indigo-50 text-gondo-indigo-600 rounded-full font-medium border border-gondo-indigo-100">
                {zona}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* MEJORA 2 — Bloque de creación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Información de campaña</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Clock size={13} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-gray-400">Creada</dt>
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

      {/* Cambios solicitados */}
      {c.estado === 'pendiente_cambios' && (
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-5 mb-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-orange-800 mb-1">Se solicitaron cambios</h4>
              {c.motivo_rechazo && (
                <p className="text-sm text-orange-700 mb-3">{c.motivo_rechazo}</p>
              )}
              <p className="text-xs text-orange-600 mb-3">Realizá los ajustes necesarios y luego reenvía la campaña para revisión.</p>
              <ReenviarBtn campanaId={params.id} />
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
        localidadesIds={[...localidadIdsActuales]}
        accentColor="indigo"
        guardarBorradorFn={guardarBorradorMarca}
        republicarFn={republicarCampanaMarca}
        descartarFn={descartarCambiosMarca}
      />
    </div>
  )
}
