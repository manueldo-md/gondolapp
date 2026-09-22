'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import {
  Star, Clock, Camera, CheckCircle2, ChevronDown, ChevronRight, DollarSign, WifiOff,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  labelTipoCampana,
  diasRestantes,
  calcularPorcentaje,
  formatearPuntos,
} from '@/lib/utils'
import type { TipoCampana, NivelGondolero, EstadoParticipacion } from '@/types'
import { NIVEL_LABEL, cumpleNivelMinimo } from '@/lib/nivel'
import { etiquetaVigencia } from '@/lib/campana-vigencia'
import {
  leerCampana,
  sincronizarCampanas,
  guardarComercios,
  leerComercios,
} from '@/lib/campana-cache'
import { formatearDia } from '@/lib/fecha-ar'
import { textoPostulacion, type EstadoPostulacion } from '@/lib/postulacion-fixer'
import { postularseACampana } from './postular-actions'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface CampanaCardData {
  id: string
  nombre: string
  tipo: TipoCampana
  marca_id: string | null
  distri_id: string | null
  financiada_por: string
  puntos_por_foto: number
  puntos_por_mision: number
  fecha_fin: string | null
  modalidad: string | null
  visitas_por_semana: number | null
  fecha_limite_inscripcion: string | null
  minimo_comercios: number | null
  tope_total_comercios: number | null
  comercios_relevados: number
  instruccion: string | null
  min_comercios_para_cobrar: number
  max_comercios_por_gondolero: number
  nivel_minimo: string | null
  es_abierta: boolean
  via_ejecucion: string | null
  /**
   * Los dos siguientes los lee `accesoACampana` para decidir si la campaña es
   * una OFERTA. Están declarados acá porque si alguien los saca de
   * `CAMPANA_SELECT` llegan `undefined`, la sección de ofertas queda vacía para
   * siempre y **no falla nada**: es el modo de falla silencioso de siempre.
   */
  actor_campana?: string | null
  abierta_a_postulaciones?: boolean | null
  estado?: string
  created_at: string
  marca: { razon_social: string } | null
  distri: { razon_social: string } | null
  bloques_foto: { id: string; bloque_campos: { tipo: string }[] }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// NIVEL_ORDEN, NIVEL_LABEL y la comparación salen de lib/nivel.ts: estaban
// copiados acá y en los otros dos gates de campaña, los tres diciendo lo mismo.

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000

// ── CampanaCard (full) ─────────────────────────────────────────────────────────

function CampanaCard({
  campana,
  participacionEstado,
  gondoleroNivel,
  misDistriIds,
  gondoleroComerciosCompletados,
  fotosRechazadas = 0,
  misionRetakeId,
  misionesConRechazo = 0,
  esCacheada = false,
}: {
  campana: CampanaCardData
  participacionEstado?: EstadoParticipacion
  gondoleroNivel: NivelGondolero | null
  misDistriIds: string[]
  gondoleroComerciosCompletados?: number
  fotosRechazadas?: number
  misionRetakeId?: string
  misionesConRechazo?: number
  /** Si los datos de captura de esta campaña están listos en IndexedDB para uso offline */
  esCacheada?: boolean
}) {
  const participando = participacionEstado === 'activa'
  const vig  = etiquetaVigencia(campana.fecha_fin)
  const esSeguimiento = campana.modalidad === 'seguimiento'
  const progreso = calcularPorcentaje(campana.comercios_relevados, campana.minimo_comercios ?? 0)
  const cantFotos = campana.bloques_foto.reduce(
    (acc, b) => acc + b.bloque_campos.filter(c => c.tipo === 'foto').length,
    0
  )
  const nueva = !participando && (Date.now() - new Date(campana.created_at).getTime() < SIETE_DIAS_MS)
  const nivelMinimo = campana.nivel_minimo ?? 'casual'
  // `gondoleroNivel === null` = no se pudo medir, y entonces NO bloquea: la
  // pantalla informa, el gate real es la action de unirse. Ver lib/nivel.ts.
  const nivelOk = cumpleNivelMinimo(gondoleroNivel, nivelMinimo)

  const maxPropios = campana.max_comercios_por_gondolero
  const minPropios = campana.min_comercios_para_cobrar
  const completadosPropios = gondoleroComerciosCompletados ?? 0
  const progresoPropios = maxPropios > 0 ? Math.min(100, Math.round((completadosPropios / maxPropios) * 100)) : 0
  const minPct = maxPropios > 0 ? Math.min(100, Math.round((minPropios / maxPropios) * 100)) : 0

  const cupoLleno = !!(campana.tope_total_comercios != null && campana.comercios_relevados >= campana.tope_total_comercios)
  const ultimosCupos = !cupoLleno && campana.tope_total_comercios != null &&
    campana.comercios_relevados / campana.tope_total_comercios > 0.8
  const diasInscripcion = campana.fecha_limite_inscripcion ? diasRestantes(campana.fecha_limite_inscripcion) : null
  const inscripcionProntoCierra = diasInscripcion !== null && diasInscripcion >= 0 && diasInscripcion <= 3

  const esMiDistri = !!campana.distri_id && misDistriIds.includes(campana.distri_id)
  const esGondolApp = campana.financiada_por === 'gondolapp' || (!campana.distri_id && !campana.marca_id)

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden transition-transform duration-100 active:scale-[0.98]">
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          {cantFotos > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              <Camera size={10} />
              Foto
            </span>
          )}
          {campana.tipo === 'precio' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-gondo-amber-50 text-gondo-amber-400">
              <DollarSign size={10} />
              Precio
            </span>
          )}
          {esMiDistri && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 {campana.distri?.razon_social ?? 'Tu distribuidora'}
            </span>
          )}
          {!esMiDistri && esGondolApp && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              GondolApp
            </span>
          )}
          {participando && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <CheckCircle2 size={10} />
              En curso
            </span>
          )}
          {!nivelOk && !participando && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-500">
              Requiere nivel {NIVEL_LABEL[nivelMinimo]}
            </span>
          )}
          {nueva && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
              Nueva
            </span>
          )}
          {cupoLleno && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              Sin cupos
            </span>
          )}
          {!cupoLleno && ultimosCupos && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
              Últimos cupos
            </span>
          )}
          {inscripcionProntoCierra && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
              Inscripción cierra en {diasInscripcion === 0 ? 'hoy' : `${diasInscripcion}d`}
            </span>
          )}
          {esCacheada && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
              <WifiOff size={10} />
              Campo
            </span>
          )}
        </div>
        <h2 className="font-semibold text-gray-900 text-base leading-snug">{campana.nombre}</h2>
        {campana.instruccion && (
          <p className="text-gray-500 text-sm mt-1 line-clamp-2">{campana.instruccion}</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Star size={14} className="text-gondo-verde-400 fill-gondo-verde-400" />
          <span className="text-sm font-semibold text-gondo-verde-400">
            {formatearPuntos(campana.puntos_por_mision > 0 ? campana.puntos_por_mision : campana.puntos_por_foto)} pts/misión
          </span>
        </div>
        {/* En seguimiento no hay cuenta regresiva: la campaña es continua. Lo
            que el gondolero necesita saber es cada cuánto volver, así que va la
            frecuencia en el lugar donde iría el plazo. Omitirlo dejaba la
            tarjeta sin ninguna señal de que es una campaña distinta. */}
        {esSeguimiento ? (
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-500">
              {campana.visitas_por_semana
                ? `${campana.visitas_por_semana} ${campana.visitas_por_semana === 1 ? 'visita' : 'visitas'}/semana`
                : 'Continua'}
            </span>
          </div>
        ) : vig !== null ? (
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-gray-400" />
            <span className={`text-sm font-medium ${vig.vencida ? 'text-gray-400' : vig.dias <= 3 ? 'text-red-500' : 'text-gray-500'}`}>
              {vig.texto}
            </span>
          </div>
        ) : null}
        {cantFotos > 0 && (
          <div className="flex items-center gap-1.5">
            <Camera size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">
              {cantFotos} {cantFotos === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
        )}
      </div>

      {/* Barra progreso campaña global */}
      {campana.minimo_comercios !== null && campana.minimo_comercios > 0 && (
        <div className="px-4 pb-2">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400">Comercios relevados</span>
            <span className="text-xs font-medium text-gray-600">
              {campana.comercios_relevados} / {campana.minimo_comercios}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gondo-verde-400 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {/* Barra progreso propio (solo en curso) */}
      {participando && maxPropios > 0 && (
        <div className="px-4 pb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-500 font-medium">Tu avance</span>
            <span className="text-xs font-semibold text-gray-700">
              {completadosPropios} / {maxPropios}
              {completadosPropios >= minPropios
                ? <span className="text-gondo-verde-600 ml-1">✓ Mínimo alcanzado</span>
                : <span className="text-amber-500 ml-1">· mínimo {minPropios}</span>
              }
            </span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            {minPct > 0 && minPct < 100 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                style={{ left: `${minPct}%` }}
              />
            )}
            <div
              className={`h-full rounded-full transition-all ${
                completadosPropios >= minPropios ? 'bg-gondo-verde-400' : 'bg-amber-400'
              }`}
              style={{ width: `${progresoPropios}%` }}
            />
          </div>
        </div>
      )}

      {/* Aviso foto rechazada.
          La recaptura va acá adentro y no en el CTA principal: cuando ocupaba
          el CTA, tener una foto rechazada tapaba la entrada a la campaña y el
          gondolero no podía arrancar misiones nuevas hasta rehacerla. */}
      {participando && fotosRechazadas > 0 && (
        <div className="mx-4 mb-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-semibold text-amber-700">
            ⚠️ {fotosRechazadas === 1 ? 'Tenés una foto rechazada' : `Tenés ${fotosRechazadas} fotos rechazadas`}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            {misionesConRechazo > 1
              ? `Son de ${misionesConRechazo} misiones distintas. Se rehacen de a una.`
              : `Rehacé ${fotosRechazadas === 1 ? 'esa foto' : 'esas fotos'} para completar la misión.`}
          </p>
          {misionRetakeId && (
            <Link
              href={`/gondolero/captura?campana=${campana.id}&retake=${misionRetakeId}`}
              className="mt-2 block w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-center text-xs font-semibold rounded-lg min-h-touch flex items-center justify-center"
            >
              {/* El botón entra a UNA misión: con rechazos en varias, decirlo.
                  Antes prometía rehacerlas todas y rehacía las de una sola. */}
              {misionesConRechazo > 1 ? 'Retomar una misión →' : 'Retomar misión →'}
            </Link>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={`/gondolero/campanas/${campana.id}`}
          className={`block w-full py-3 text-white text-center font-semibold rounded-xl transition-all duration-100 active:scale-[0.97] min-h-touch ${
            participando
              ? fotosRechazadas > 0
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'bg-green-600 hover:bg-green-700'
              : !nivelOk
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-gondo-verde-400 hover:bg-gondo-verde-600'
          }`}
        >
          {participando ? 'Continuar →' : 'Ver campaña'}
        </Link>
      </div>
    </div>
  )
}

// ── CampanaCardCerrada (compacta) ──────────────────────────────────────────────

// ── CampanaCardOferta ─────────────────────────────────────────────────────────

/**
 * Una campaña que el fixer VE pero todavía no puede trabajar.
 *
 * ── NO ES UN LINK, Y ESO ES DELIBERADO ──────────────────────────────────────
 * Las otras dos tarjetas envuelven todo en un `<Link>` al detalle. Esta no: el
 * detalle tiene el botón de unirse, el link a captura y el resto del flujo de
 * trabajo, y llevarlo ahí sería ofrecerle puertas que están todas cerradas — el
 * rechazo tardío de siempre, esta vez con tres clics de por medio.
 *
 * Muestra lo justo para decidir si le interesa —qué tipo es, cuánto paga, hasta
 * cuándo— y nada de lo que hace falta para ejecutarla.
 */
function CampanaCardOferta({ campana, postulacion }: { campana: CampanaCardData; postulacion: EstadoPostulacion }) {
  const vig = etiquetaVigencia(campana.fecha_fin)
  const esSeguimiento = campana.modalidad === 'seguimiento'
  const puntos = campana.puntos_por_mision || campana.puntos_por_foto

  // El estado inicial viene del servidor; este local es para no tener que
  // recargar la pantalla después de postularse.
  const [estado, setEstado] = useState<EstadoPostulacion>(postulacion)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startPostular] = useTransition()

  const handlePostularme = () => {
    setError(null)
    startPostular(async () => {
      const res = await postularseACampana(campana.id)
      if ('error' in res) { setError(res.error); return }
      setEstado({ estado: 'pendiente' })
    })
  }

  return (
    <div className="rounded-2xl bg-white border border-violet-200 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
            Abierta a postulación
          </span>
          {esSeguimiento && campana.visitas_por_semana && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {campana.visitas_por_semana}× por semana
            </span>
          )}
        </div>

        <h3 className="font-bold text-gray-900 leading-snug">{campana.nombre}</h3>
        {campana.instruccion && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{campana.instruccion}</p>
        )}

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          {puntos > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star size={12} className="text-gondo-amber-400" />
              {formatearPuntos(puntos)} pts por misión
            </span>
          )}
          {vig && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {vig.texto}
            </span>
          )}
        </div>

        {/* ── Los tres estados ──────────────────────────────────────────────
            El botón solo aparece cuando de verdad puede. En los otros dos casos
            va un cartel, no un botón deshabilitado: un botón gris invita a
            apretarlo para ver qué pasa, y lo que pasa es nada. */}
        <div className="mt-3">
          {estado.estado === 'puede' && (
            <button
              type="button"
              onClick={handlePostularme}
              disabled={pendiente}
              className="w-full py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-60 min-h-touch"
            >
              {pendiente ? 'Enviando…' : 'Postularme'}
            </button>
          )}

          {estado.estado === 'pendiente' && (
            <div className="px-3 py-2 rounded-xl bg-violet-50 text-xs text-violet-800">
              <span className="font-semibold">Postulación enviada.</span>{' '}
              Te avisamos cuando la revisen.
            </div>
          )}

          {estado.estado === 'rechazada' && (
            <div className="px-3 py-2 rounded-xl bg-gray-100 text-xs text-gray-600 space-y-1">
              {/* Sin motivo obligatorio: quien rechaza puede no escribir nada, y
                  entonces no se inventa una explicación que no dio. */}
              <p className="font-semibold text-gray-700">Tu postulación no fue aceptada.</p>
              {estado.motivo && <p>{estado.motivo}</p>}
              <p className="text-gray-500">{textoPostulacion(estado)}.</p>
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function CampanaCardCerrada({
  campana,
  misDistriIds,
}: {
  campana: CampanaCardData
  misDistriIds: string[]
}) {
  const esMiDistri = !!campana.distri_id && misDistriIds.includes(campana.distri_id)
  const suspendida = campana.estado === 'suspendida'

  return (
    <Link
      href={`/gondolero/campanas/${campana.id}`}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 transition-transform duration-100 active:scale-[0.98]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${COLORES_TIPO[campana.tipo]}`}>
            {labelTipoCampana(campana.tipo)}
          </span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            suspendida ? 'bg-gray-100 text-gray-500' : 'bg-rose-100 text-rose-600'
          }`}>
            {suspendida ? 'Suspendida' : 'Cerrada'}
          </span>
          {esMiDistri && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 Tu distribuidora
            </span>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-700 truncate">{campana.nombre}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs text-gondo-verde-400 font-medium">
            <Star size={10} className="fill-gondo-verde-400" />
            {formatearPuntos(campana.puntos_por_mision > 0 ? campana.puntos_por_mision : campana.puntos_por_foto)} pts/misión
          </span>
          {campana.fecha_fin && (
            <span className="text-xs text-gray-400">
              Venció {formatearDia(campana.fecha_fin, { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </Link>
  )
}

// ── Sección colapsable ─────────────────────────────────────────────────────────

function Seccion({
  titulo,
  badge,
  badgeColor,
  bgColor,
  borderColor,
  children,
  defaultOpen = true,
}: {
  titulo: string
  badge: number
  badgeColor: string
  bgColor: string
  borderColor: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-2xl overflow-hidden border ${bgColor} ${borderColor}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-gray-900 text-sm">{titulo}</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '4000px' : '0px' }}
      >
        <div className="px-4 pb-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── CampanasSections ───────────────────────────────────────────────────────────

export function CampanasSections({
  misCampanas,
  disponibles,
  ofertas = [],
  finalizadas,
  gondoleroNivel,
  misDistriIds,
  gondoleroLocalidadIds = [],
  comerciosCompletadosRecord,
  fotosRechazadasRecord = {},
  misionRetakeRecord = {},
  misionesConRechazoRecord = {},
}: {
  misCampanas: CampanaCardData[]
  disponibles: CampanaCardData[]
  /** Las que puede VER pero no trabajar: le falta el vínculo con el ejecutor. */
  ofertas?: { campana: CampanaCardData; postulacion: EstadoPostulacion }[]
  finalizadas: CampanaCardData[]
  gondoleroNivel: NivelGondolero | null
  misDistriIds: string[]
  /** IDs de localidades del gondolero — para filtrar la query de comercios al precargar */
  gondoleroLocalidadIds?: number[]
  comerciosCompletadosRecord: Record<string, number>
  fotosRechazadasRecord?: Record<string, number>
  misionRetakeRecord?: Record<string, string>
  misionesConRechazoRecord?: Record<string, number>
}) {
  // ── Estado: qué campañas de "Mis campañas" están listas para uso offline ──────
  const [campanasCacheadas, setCampanasCacheadas] = useState<Set<string>>(new Set())
  // El chip "Campo" requiere TANTO la campaña como los comercios en IDB
  const [comerciosCacheados, setComerciosCacheados] = useState(false)

  // useEffect 1: leer IDB en background para mostrar el chip "Campo" sin bloquear el render.
  // El chip requiere campana Y comercios en cache para ser honesto sobre la disponibilidad offline.
  useEffect(() => {
    const ids = misCampanas.map(c => c.id)
    if (ids.length === 0) return

    Promise.all([
      Promise.all(
        ids.map(async (id) => {
          try {
            const cached = await leerCampana(id)
            return cached ? id : null
          } catch {
            return null
          }
        })
      ),
      leerComercios().catch(() => null),
    ]).then(([campanaResults, comerciosData]) => {
      const found = new Set(campanaResults.filter((id): id is string => id !== null))
      if (found.size > 0) setCampanasCacheadas(found)
      setComerciosCacheados(Array.isArray(comerciosData) && comerciosData.length > 0)
    })
  }, [misCampanas])

  // useEffect 2: precargar datos de cada campaña + comercios + URLs de detalle (background, sin bloquear render)
  useEffect(() => {
    if (misCampanas.length === 0) return

    const prefetch = async () => {
      const supabase = createClient()

      // 1. IndexedDB: datos de captura de cada campaña activa.
      //
      // Antes era `if (already) continue`, que NUNCA refrescaba: una campaña
      // cacheada hace dos semanas se capturaba offline con los bloques de hace
      // dos semanas. Ahora `sincronizarCampanas` mira el TTL y, si venció,
      // compara `updated_at` —dos columnas— antes de decidir si vale la pena
      // bajar los bloques anidados otra vez.
      try {
        const cacheadas = await sincronizarCampanas(supabase, misCampanas.map(c => c.id))
        if (cacheadas.size > 0) setCampanasCacheadas(cacheadas)
      } catch { /* sin red — se reintentará la próxima vez */ }

      // 2. IndexedDB: comercios filtrados por localidad (o todos si no hay localidades)
      try {
        const alreadyComercio = await leerComercios()
        if (!alreadyComercio) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let query: any = supabase
            .from('comercios')
            .select('id, nombre, lat, lng, tipo, localidad_id')
          if (gondoleroLocalidadIds.length > 0) {
            query = query.in('localidad_id', gondoleroLocalidadIds)
          } else {
            query = query.limit(1500)
          }
          const { data } = await query
          if (data) {
            await guardarComercios(data)
            setComerciosCacheados(true)
          }
        }
      } catch { /* sin red */ }

      // 3. SW: precachear rutas protegidas que el usuario necesita offline.
      //
      // Las rutas /gondolero/* son protegidas por el middleware y no se pueden
      // precachear en el install del SW (sin garantía de sesión activa).
      // Este postMessage corre con sesión garantizada → el SW las descarga y
      // guarda el HTML correcto, no el HTML de /auth.
      //
      // Orden de prioridad: primero captura y perfil (rutas que el gondolero
      // puede necesitar offline sin haber visitado antes), luego los detalles
      // de cada campaña activa.
      try {
        const urls = [
          '/gondolero/captura',   // ruta offline-crítica, nunca visitada directamente
          '/gondolero/perfil',    // enlazada desde /offline, también protegida
          ...misCampanas.map(c => `/gondolero/campanas/${c.id}`),
        ]
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_URLS', urls })
        }
      } catch { /* SW no disponible */ }
    }

    prefetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misCampanas, gondoleroLocalidadIds])

  const hayAlgo = misCampanas.length + disponibles.length + ofertas.length + finalizadas.length > 0

  if (!hayAlgo) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">📭</div>
        <h2 className="text-base font-semibold text-gray-700 mb-1">
          No hay campañas activas
        </h2>
        <p className="text-sm text-gray-400 max-w-xs">
          Cuando haya campañas disponibles en tu zona van a aparecer acá.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* ── Mis campañas ── */}
      {misCampanas.length > 0 && (
        <Seccion
          titulo="Mis campañas"
          badge={misCampanas.length}
          badgeColor="bg-green-100 text-green-700"
          bgColor="bg-green-50"
          borderColor="border-green-200"
          defaultOpen={true}
        >
          {misCampanas.map(c => (
            <CampanaCard
              key={c.id}
              campana={c}
              participacionEstado="activa"
              gondoleroNivel={gondoleroNivel}
              misDistriIds={misDistriIds}
              gondoleroComerciosCompletados={comerciosCompletadosRecord[c.id] ?? 0}
              fotosRechazadas={fotosRechazadasRecord[c.id] ?? 0}
              misionRetakeId={misionRetakeRecord[c.id]}
              misionesConRechazo={misionesConRechazoRecord[c.id] ?? 0}
              esCacheada={campanasCacheadas.has(c.id) && comerciosCacheados}
            />
          ))}
        </Seccion>
      )}

      {/* ── Disponibles ── */}
      {disponibles.length > 0 && (
        <Seccion
          titulo="Disponibles"
          badge={disponibles.length}
          badgeColor="bg-slate-200 text-slate-600"
          bgColor="bg-slate-100"
          borderColor="border-slate-200"
          defaultOpen={true}
        >
          {disponibles.map(c => (
            <CampanaCard
              key={c.id}
              campana={c}
              gondoleroNivel={gondoleroNivel}
              misDistriIds={misDistriIds}
            />
          ))}
        </Seccion>
      )}

      {/* ── Ofertas: las que puede MIRAR pero todavía no trabajar ──────────────
          Van DESPUÉS de "Disponibles" a propósito: primero lo que puede hacer
          ahora, después lo que tiene que pedir. Al revés, la pantalla le
          ofrecería trabajo que no puede tomar antes que el que sí.

          Sin botón por ahora — el de postularse llega en la etapa siguiente. Que
          esta sección exista sin botón es el punto: prueba que ver una campaña
          no habilita trabajarla. */}
      {ofertas.length > 0 && (
        <Seccion
          titulo="Abiertas a postulación"
          badge={ofertas.length}
          badgeColor="bg-violet-100 text-violet-700"
          bgColor="bg-violet-50"
          borderColor="border-violet-200"
          defaultOpen={true}
        >
          <p className="text-xs text-gray-500 px-1 pb-2">
            Todavía no trabajás con quien ejecuta estas campañas. Podés verlas, y
            en breve vas a poder pedir sumarte.
          </p>
          {ofertas.map(o => (
            <CampanaCardOferta key={o.campana.id} campana={o.campana} postulacion={o.postulacion} />
          ))}
        </Seccion>
      )}

      {/* ── Campañas finalizadas (últimos 90 días) ── */}
      {finalizadas.length > 0 && (
        <Seccion
          titulo="Campañas finalizadas"
          badge={finalizadas.length}
          badgeColor="bg-rose-100 text-rose-600"
          bgColor="bg-rose-50"
          borderColor="border-rose-200"
          defaultOpen={false}
        >
          {finalizadas.map(c => (
            <CampanaCardCerrada
              key={c.id}
              campana={c}
              misDistriIds={misDistriIds}
            />
          ))}
        </Seccion>
      )}

      {/* Estado vacío de disponibles cuando solo hay en mis campañas */}
      {disponibles.length === 0 && finalizadas.length === 0 && misCampanas.length > 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-sm font-semibold text-gray-700">
            Ya estás en todas las campañas activas
          </p>
        </div>
      )}

    </div>
  )
}
