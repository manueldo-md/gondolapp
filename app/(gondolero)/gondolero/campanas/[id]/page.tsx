import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Camera, MapPin, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import { UnirseButton } from './unirse-button'
import { AbandonarBtn } from '../../misiones/abandonar-btn'
import {
  labelTipoCampana,
  calcularPorcentaje,
  formatearPuntos,
  formatearFecha,
} from '@/lib/utils'
import type { TipoCampana } from '@/types'
import { getConfig } from '@/lib/config'
import { NIVEL_LABEL, cumpleNivelMinimo } from '@/lib/nivel'
import { etiquetaVigencia, inscripcionCerrada } from '@/lib/campana-vigencia'
import { mejorMesDeMisiones, nivelDeMejorMes } from '@/lib/nivel-maximo'
import { accesoACampana, type CampanaAcceso } from '@/lib/acceso-campana'
import { calcularCobertura, fraseSemanaGondolero } from '@/lib/cobertura-seguimiento'

type BloqueFotoRow = {
  id: string
  orden: number
  instruccion: string
  bloque_campos: { tipo: string; pregunta: string | null }[] | null
}

type CampanaDetalle = {
  id: string
  nombre: string
  tipo: TipoCampana
  financiada_por: string
  via_ejecucion: string | null
  repositora_id: string | null
  distri_id: string | null
  marca_id: string | null
  puntos_por_foto: number
  puntos_por_mision: number
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_limite_inscripcion: string | null
  minimo_comercios: number | null
  tope_total_comercios: number | null
  max_comercios_por_gondolero: number
  min_comercios_para_cobrar: number
  comercios_relevados: number
  instruccion: string | null
  nivel_minimo: string | null
  modalidad: string | null
  visitas_por_semana: number | null
  marca: { razon_social: string } | null
  bloques_foto: BloqueFotoRow[]
}

type MisionRow = {
  id: string
  estado: string
  comercio_id: string | null
  bounty_estado: string | null
  puntos_total: number
  created_at: string
  comercio: { nombre: string; direccion: string | null } | null
}

const COLORES_TIPO: Record<TipoCampana, string> = {
  relevamiento: 'bg-gondo-indigo-50 text-gondo-indigo-600',
  precio:       'bg-gondo-amber-50 text-gondo-amber-400',
  cobertura:    'bg-gondo-blue-50 text-gondo-blue-600',
  pop:          'bg-purple-50 text-purple-600',
  mapa:         'bg-gondo-verde-50 text-gondo-verde-600',
  comercios:    'bg-gondo-verde-50 text-gondo-verde-600',
  interna:      'bg-gray-100 text-gray-500',
}

// NIVEL_ORDEN, NIVEL_LABEL y la comparación viven en lib/nivel.ts.

const ESTADO_MISION: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'En revisión', color: 'bg-amber-50 text-amber-600' },
  aprobada:  { label: 'Aprobada',    color: 'bg-green-50 text-green-600' },
  rechazada: { label: 'Rechazada',   color: 'bg-red-50 text-red-500'    },
  parcial:   { label: 'Parcial',     color: 'bg-blue-50 text-blue-600'  },
  // El gondolero descartó la recaptura: cerrada sin acreditar.
  descartada: { label: 'Descartada', color: 'bg-gray-100 text-gray-500' },
}

function ReqRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {ok
        ? <CheckCircle2 size={15} className="text-green-500 shrink-0" />
        : <XCircle     size={15} className="text-red-500 shrink-0" />
      }
      <span className={`text-sm ${ok ? 'text-gray-600' : 'text-red-700 font-medium'}`}>{text}</span>
    </div>
  )
}

export default async function CampanaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Usar admin client para permitir lectura de campañas cerradas/suspendidas
  // (RLS del usuario solo permite leer campañas activas)
  const { data: campanaData } = await (admin as any)
    .from('campanas')
    .select(`
      id, nombre, tipo, financiada_por, via_ejecucion, distri_id, repositora_id, marca_id, estado, actor_campana,
      modalidad, visitas_por_semana,
      puntos_por_foto, puntos_por_mision, fecha_inicio, fecha_fin, fecha_limite_inscripcion,
      minimo_comercios, tope_total_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
      comercios_relevados, instruccion, nivel_minimo,
      marca:marcas ( razon_social ),
      bloques_foto ( id, orden, instruccion, bloque_campos ( tipo, pregunta ) )
    `)
    .eq('id', params.id)
    .single()

  if (!campanaData) notFound()

  console.log('[campana-detalle] userId:', user.id, 'campanaId:', params.id)

  const campanaActiva = (campanaData as unknown as { estado: string }).estado === 'activa'

  const [{ data: participacionData, error: participacionError }, { data: profileData }, { data: misDistrisGondoleroData }, { data: misDistrisFixerData }, { data: misReposFixerData }, { data: misionesData }, config, mejorMes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('participaciones')
      .select('id, estado')
      .eq('campana_id', params.id)
      .eq('gondolero_id', user.id)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('tipo_actor')
      .eq('id', user.id)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
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
    // Las repositoras del fixer. Es SU eje: las campañas de fixers llevan
    // `repositora_id` y su vínculo vive acá, no en fixer_distri_solicitudes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('fixer_repo_solicitudes')
      .select('repositora_id')
      .eq('fixer_id', user.id)
      .eq('estado', 'aprobada'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any)
      .from('misiones')
      .select('id, estado, bounty_estado, puntos_total, created_at, comercio_id, comercio:comercios ( nombre, direccion )')
      .eq('campana_id', params.id)
      .eq('gondolero_id', user.id)
      .order('created_at', { ascending: false }),
    // El gate mira el MÁXIMO alcanzado, no el nivel del mes. Ver lib/nivel-maximo.ts.
    getConfig(),
    mejorMesDeMisiones(user.id, admin),
  ])

  console.log('[campana-detalle] participacion result:', participacionData, 'error:', participacionError)

  const c = campanaData as unknown as CampanaDetalle
  const participacion = participacionData as { id: string; estado: string } | null
  const profileRow = profileData as { tipo_actor: string } | null
  // `null` = no se pudo medir; no se aplasta a 'casual'. Ver lib/nivel.ts.
  const gondoleroNivel = nivelDeMejorMes(mejorMes, {
    activo: config.niveles.fotosCasualAActivo,
    pro:    config.niveles.fotosActivoAPro,
  })
  const esFixer = profileRow?.tipo_actor === 'fixer'
  const actorCampana = (campanaData as unknown as { actor_campana: string | null }).actor_campana
  const misDistriIds = esFixer
    ? ((misDistrisFixerData ?? []) as { distri_id: string }[]).map(d => d.distri_id)
    : ((misDistrisGondoleroData ?? []) as { distri_id: string }[]).map(d => d.distri_id)
  // ── Su semana, en campañas de seguimiento ──────────────────────────────────
  //
  // Segunda consulta y no la de arriba: la lista de abajo tiene que seguir
  // mostrando SUS misiones, pero la cobertura cuenta las visitas de TODOS. La
  // frecuencia es del comercio, no de la persona — si otro ya lo visitó, el
  // comercio está cubierto y volver sería trabajo que no hace falta (y que la
  // distribuidora paga igual). Ver lib/cobertura-seguimiento.ts.
  //
  // Solo se pide en seguimiento: en puntual no hay frecuencia que medir.
  const esSeguimiento = c.modalidad === 'seguimiento' && !!c.visitas_por_semana
  let fraseSemana: string | null = null
  if (esSeguimiento) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: todas, error: errTodas } = await (admin as any)
      .from('misiones')
      .select('comercio_id, gondolero_id, estado, capturada_at, created_at')
      .eq('campana_id', params.id)

    if (errTodas) {
      // Se loguea y no se muestra nada: una cabecera con números inventados es
      // peor que no tenerla, sobre todo cuando le dice cuánto le falta.
      console.error('[campana-detalle] no se pudo calcular la cobertura de la semana:', errTodas.message)
    } else {
      // Sus comercios: los que él visitó alguna vez en esta campaña.
      const misComercios = new Set(
        ((misionesData ?? []) as MisionRow[])
          .filter(m => m.estado !== 'descartada' && m.comercio_id)
          .map(m => m.comercio_id as string),
      )
      if (misComercios.size > 0) {
        fraseSemana = fraseSemanaGondolero(calcularCobertura({
          misiones: todas ?? [],
          nombresComercio: new Map(),
          visitasPorSemana: c.visitas_por_semana!,
          fechaInicio: c.fecha_inicio,
          universo: misComercios,
        }))
      }
    }
  }

  const misRepoIds = esFixer
    ? ((misReposFixerData ?? []) as { repositora_id: string }[]).map(r => r.repositora_id)
    : []
  const misiones = (misionesData as MisionRow[] | null) ?? []

  // Las relaciones marca↔distri de SUS distribuidoras. Esta pantalla no las
  // pedía, y por eso su control de acceso era el más permisivo de los tres: una
  // campaña de marca sin distribuidora ejecutora la mostraba como disponible
  // aunque ninguna de sus distris trabajara con esa marca.
  //
  // Solo hace falta si la campaña es de marca y no tiene ejecutora: en el resto
  // de los casos `accesoACampana` ni la mira.
  let relacionesMarcaDistri: { marca_id: string; distri_id: string }[] = []
  if (c.financiada_por === 'marca' && !c.distri_id && c.marca_id && misDistriIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: relData, error: relError } = await (admin as any)
      .from('marca_distri_relaciones')
      .select('marca_id, distri_id')
      .in('distri_id', misDistriIds)
      .eq('estado', 'activa')
    if (relError) {
      console.error('[campana-detalle] no se pudieron leer las relaciones marca-distri —',
        'la campaña va a mostrarse sin acceso:', relError.message)
    }
    relacionesMarcaDistri = (relData ?? []) as { marca_id: string; distri_id: string }[]
  }

  const yaUnido        = participacion?.estado === 'activa' || participacion?.estado === 'completada'
  console.log('[campana-detalle] yaUnido:', yaUnido, 'misiones count:', misiones.length, 'participacion estado:', participacion?.estado)
  const participacionAnteriorEstado = (
    participacion?.estado === 'completada' || participacion?.estado === 'abandonada'
  ) ? participacion.estado as 'completada' | 'abandonada' : null

  const vig          = etiquetaVigencia(c.fecha_fin, { corto: true })
  const progreso     = calcularPorcentaje(c.comercios_relevados, c.minimo_comercios ?? 0)
  const bloques      = [...(c.bloques_foto ?? [])].sort((a, b) => a.orden - b.orden)

  // Badge de creador
  const esMiDistri = !!c.distri_id && misDistriIds.includes(c.distri_id)
  const esGondolApp = c.financiada_por === 'gondolapp' || (!c.distri_id && !c.marca_id)

  // ── Control de acceso según actor y financiador ───────────────────────────────
  //
  // La regla vive en lib/acceso-campana.ts. Esta pantalla tenía su propia
  // versión y era la más permisiva de las tres: para las campañas de marca sin
  // distribuidora ejecutora solo pedía `misDistriIds.length > 0`, sin mirar si
  // alguna de esas distris trabaja con la marca. O sea que mostraba "Unirme"
  // habilitado y `unirseACampana` rechazaba al apretar.
  const acceso = accesoACampana(c as unknown as CampanaAcceso, {
    esFixer,
    misDistriIds,
    misRepoIds,
    relacionesMarcaDistri,
  })
  const sinAcceso = !acceso.ok
  const motivoSinAcceso = acceso.ok ? undefined : acceso.mensaje

  // Restricciones operativas de acceso
  const nivelMinimo       = c.nivel_minimo ?? 'casual'
  const nivelOk           = cumpleNivelMinimo(gondoleroNivel, nivelMinimo)
  // Mismo criterio que la action que valida al apretar el botón: si difirieran,
  // la pantalla habilitaría algo que el servidor rechaza, o al revés.
  const inscripcionVencida = inscripcionCerrada(c.fecha_limite_inscripcion)
  const cupoLleno         = !!(c.tope_total_comercios != null && c.comercios_relevados >= c.tope_total_comercios)
  const cupoProgreso      = c.tope_total_comercios
    ? calcularPorcentaje(c.comercios_relevados, c.tope_total_comercios)
    : null

  const puedeUnirse = nivelOk && !inscripcionVencida && !cupoLleno && !sinAcceso

  const mostrarPanelAcceso = !yaUnido
  const hayRestricciones = !nivelOk || inscripcionVencida || cupoLleno || sinAcceso || !!participacionAnteriorEstado

  // El cupo se mide en COMERCIOS DISTINTOS, no en misiones: en seguimiento un
  // comercio se visita muchas veces a propósito y esas visitas no consumen cupo.
  // Tiene que coincidir con el gate del servidor en captura/actions.ts.
  //
  // Las descartadas no ocupan: descartar libera el lugar para hacer otra misión.
  const comerciosQueOcupanCupo = new Set(
    misiones.filter(m => m.estado !== 'descartada').map(m => m.comercio_id).filter(Boolean)
  )
  const alcanzeLimite = comerciosQueOcupanCupo.size >= c.max_comercios_por_gondolero

  // Cuántos comercios le faltan para cobrar.
  //
  // COMERCIOS DISTINTOS, no misiones. Hasta el 17/9/2026 contaba misiones, y eso
  // quedó viejo cuando el mínimo pasó a medirse en comercios: en seguimiento,
  // tres visitas al mismo comercio le decían que ya había llegado al mínimo
  // cuando le faltaban dos. Es el mismo número que calcula aprobarMisionCore
  // para decidir el pago, así que lo que ve es lo que la base va a exigir.
  const comerciosAprobados = new Set(
    misiones.filter(m => m.estado === 'aprobada').map(m => m.comercio_id).filter(Boolean)
  ).size
  const faltanParaCobrar = Math.max(0, c.min_comercios_para_cobrar - comerciosAprobados)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* Header con back */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/campanas"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          Campañas
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${COLORES_TIPO[c.tipo]}`}>
            {labelTipoCampana(c.tipo)}
          </span>
          {sinAcceso && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
              🔒 Acceso restringido
            </span>
          )}
          {!sinAcceso && esMiDistri && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
              📦 Tu distribuidora
            </span>
          )}
          {!sinAcceso && !esMiDistri && esGondolApp && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              GondolApp
            </span>
          )}
          {nivelMinimo !== 'casual' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">
              Nivel {NIVEL_LABEL[nivelMinimo]} requerido
            </span>
          )}
        </div>
        <h1 className="text-lg font-bold text-gray-900 mt-2 leading-snug">
          {c.nombre}
        </h1>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* ── Campaña cerrada ── */}
        {!campanaActiva && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-2">
            <XCircle size={18} className="text-rose-500 shrink-0" />
            <p className="text-sm font-semibold text-rose-700">Esta campaña ya está cerrada</p>
          </div>
        )}

        {/* ── Ya participando ── */}
        {yaUnido && campanaActiva && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-sm font-semibold text-green-800">Ya estás participando en esta campaña</p>
          </div>
        )}

        {/* ── Participación anterior (completada / abandonada) ── */}
        {!yaUnido && participacionAnteriorEstado && (
          <div className={`rounded-2xl border p-4 ${
            participacionAnteriorEstado === 'completada'
              ? 'bg-green-50 border-green-200'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <p className={`text-sm font-semibold mb-0.5 ${
              participacionAnteriorEstado === 'completada' ? 'text-green-800' : 'text-gray-700'
            }`}>
              {participacionAnteriorEstado === 'completada'
                ? '✅ Ya completaste esta campaña'
                : '⏸ Abandonaste esta campaña'}
            </p>
            <p className="text-xs text-gray-500">
              {puedeUnirse ? 'Podés volver a unirte.' : 'No hay cupos o la inscripción está cerrada.'}
            </p>
          </div>
        )}

        {/* ── Su semana, solo en seguimiento ────────────────────────────────
            El gondolero nunca veía `visitas_por_semana` en esta pantalla: el
            dashboard de la distri lo medía contra una vara que él no conocía.

            Dice "tus comercios están cubiertos" y no "cubriste tus comercios":
            parte de esas visitas pueden ser de otro, y atribuirle trabajo ajeno
            es tan falso como no reconocerle el propio. */}
        {fraseSemana && (
          <div className="bg-gondo-verde-50 border border-gondo-verde-200 rounded-2xl p-4">
            <p className="text-sm text-gondo-verde-800 leading-snug">{fraseSemana}</p>
            <p className="text-[11px] text-gondo-verde-600 mt-1">
              Se piden {c.visitas_por_semana} {c.visitas_por_semana === 1 ? 'visita' : 'visitas'} por
              semana a cada comercio. Cuentan las de cualquier gondolero: si otro ya lo visitó, está cubierto.
            </p>
          </div>
        )}

        {/* Stats principales */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Star size={18} className="text-gondo-verde-400 fill-gondo-verde-400 mx-auto mb-1" />
            <p className="text-base font-bold text-gondo-verde-400">{formatearPuntos(c.puntos_por_mision > 0 ? c.puntos_por_mision : c.puntos_por_foto)}</p>
            <p className="text-[11px] text-gray-400">pts/misión</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
            <Clock size={18} className="text-gray-400 mx-auto mb-1" />
            <p className={`text-base font-bold ${vig && !vig.vencida && vig.dias <= 3 ? 'text-red-500' : 'text-gray-700'}`}>
              {vig === null ? '—' : vig.vencida ? 'Terminada' : vig.dias === 0 ? 'Hoy' : vig.dias}
            </p>
            <p className="text-[11px] text-gray-400">{vig?.vencida ? 'vigencia' : 'días'}</p>
          </div>
          {(() => {
            const cantFotos = bloques.reduce(
              (acc, b) => acc + (b.bloque_campos ?? []).filter(c => c.tipo === 'foto').length,
              0
            )
            return cantFotos > 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <Camera size={18} className="text-gray-400 mx-auto mb-1" />
                <p className="text-base font-bold text-gray-700">{cantFotos}</p>
                <p className="text-[11px] text-gray-400">{cantFotos === 1 ? 'foto' : 'fotos'}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <span className="text-xl block mb-1">📍</span>
                <p className="text-base font-bold text-gray-700">GPS</p>
                <p className="text-[11px] text-gray-400">validación</p>
              </div>
            )
          })()}
        </div>

        {/* Instrucción general */}
        {c.instruccion && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">¿Qué tenés que hacer?</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{c.instruccion}</p>
          </div>
        )}

        {/* Bloques de foto — solo si al menos un bloque tiene un campo tipo='foto' */}
        {(() => {
          const bloquesConFoto = bloques.filter(b =>
            (b.bloque_campos ?? []).some(c => c.tipo === 'foto')
          )
          if (bloquesConFoto.length === 0) return null
          return (
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Fotos requeridas</h2>
              <div className="space-y-3">
                {bloquesConFoto.map((bloque, i) => (
                  <div key={bloque.id} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-gondo-verde-50 text-gondo-verde-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {(bloque.bloque_campos ?? []).find(c => c.tipo === 'foto')?.pregunta ?? bloque.instruccion}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* ── Sección de misiones (solo para participantes activos) ── */}
        {yaUnido && (
          <>
            {/* Dos contadores: campaña general + mis misiones */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gondo-verde-400">{c.comercios_relevados}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">comercios<br/>en la campaña</p>
              </div>
              {/* El contador dice COMERCIOS y no misiones, porque el máximo de
                  al lado se mide en comercios. Decía "misiones tuyas (máx 20)"
                  comparando dos cosas distintas: en seguimiento se veía
                  "45 misiones tuyas (máx 20)", un número imposible. */}
              <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-700">{comerciosQueOcupanCupo.size}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">
                  {comerciosQueOcupanCupo.size === 1 ? 'comercio tuyo' : 'comercios tuyos'}<br/>
                  <span className="text-gray-300">(máx {c.max_comercios_por_gondolero})</span>
                </p>
              </div>
            </div>

            {/* ── Entrada a la captura ──────────────────────────────────────
                Los dos límites son distintos y por eso se tratan distinto:

                · cupoLleno   — es el TOPE GLOBAL de la campaña. Se llenó para
                  todos y la campaña se cierra sola. No hay nada que hacer, ni
                  siquiera en los comercios propios: el botón no va.

                · alcanzeLimite — es el cupo PROPIO del gondolero. Significa "no
                  podés tomar comercios NUEVOS", no "terminaste". El botón entra
                  igual, y el filtrado va en la lista de comercios, que marca los
                  nuevos como no seleccionables y deja los propios disponibles.

                Hasta el 17/9/2026 los dos escondían el botón, y con el cupo
                propio lleno la campaña quedaba sin ninguna vía de entrada: éste
                es el único link a la captura de toda la pantalla. En una campaña
                de seguimiento —donde tener el cupo lleno es el estado NORMAL del
                repositor— eso la volvía inutilizable. */}
            {/* ── Sin acceso o vencida: no hay botón ────────────────────────
                Este es el ÚNICO link a la captura de toda la pantalla, así que
                esconderlo es lo que corta el camino.

                Los dos casos tenían el mismo agujero y ninguno estaba tapado:
                `campanaActiva` mira `estado`, y tanto una campaña vencida como
                una de la que lo desvincularon siguen diciendo 'activa'. Con eso
                el botón aparecía igual. El 21/9/2026 SokkaElectrizante entró por
                acá desde "Finalizadas", hizo la misión completa y recibió el
                rechazo al enviar.

                Se explica en vez de desaparecer sin más: el gondolero vino
                siguiendo un link y merece saber por qué no puede seguir. */}
            {campanaActiva && (sinAcceso || vig?.vencida) && (
              <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 text-center">
                <p className="text-sm font-semibold text-rose-700">
                  {vig?.vencida ? 'Esta campaña ya terminó' : 'Ya no podés trabajar en esta campaña'}
                </p>
                <p className="text-xs text-rose-600 mt-1">
                  {vig?.vencida
                    ? 'No acepta misiones nuevas. Lo que hiciste sigue contando.'
                    : `${motivoSinAcceso ?? ''} Lo que hiciste sigue contando.`}
                </p>
              </div>
            )}

            {campanaActiva && !sinAcceso && !vig?.vencida && (cupoLleno ? (
              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-center">
                <p className="text-sm font-semibold text-gray-600">Campaña sin cupos disponibles</p>
                <p className="text-xs text-gray-400 mt-1">El cupo total de la campaña está completo.</p>
              </div>
            ) : (
              <>
                <Link
                  href={`/gondolero/captura?campana=${c.id}`}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl shadow-sm text-base hover:bg-gondo-verde-600 transition-colors"
                >
                  <Camera size={18} />
                  Nueva misión
                </Link>

                {/* Información AL LADO del botón, no en lugar del botón. El
                    cartel explica por qué no van a aparecerle comercios nuevos
                    en la lista; el botón sigue siendo la puerta a los propios. */}
                {alcanzeLimite && (
                  <div className="bg-gray-50 rounded-2xl border border-gray-200 p-3 text-center">
                    <p className="text-xs text-gray-500">
                      Tenés {comerciosQueOcupanCupo.size} comercios, que es tu máximo en esta campaña.
                      Podés seguir trabajando en ellos, pero no tomar nuevos.
                    </p>
                  </div>
                )}
              </>
            ))}

            {/* Botón abandonar campaña */}
            {campanaActiva && <AbandonarBtn campanaId={c.id} />}

            {/* Lista de misiones */}
            {misiones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Tus misiones</h2>
                <div className="space-y-3">
                  {misiones.map(mision => (
                    <div key={mision.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {mision.comercio?.nombre ?? 'Comercio'}
                        </p>
                        {mision.comercio?.direccion && (
                          <p className="text-xs text-gray-400 truncate">{mision.comercio.direccion}</p>
                        )}
                        <p className="text-xs text-gray-400">{formatearFecha(mision.created_at)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {/* Estado de la misión */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_MISION[mision.estado]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                          {ESTADO_MISION[mision.estado]?.label ?? mision.estado}
                        </span>
                        {/* Estado de los puntos — solo cuando la misión está aprobada */}
                        {mision.estado === 'aprobada' && mision.puntos_total > 0 && (
                          mision.bounty_estado === 'acreditado' ? (
                            <span className="text-xs font-semibold text-gondo-verde-400">
                              +{formatearPuntos(mision.puntos_total)} pts acreditados
                            </span>
                          ) : (
                            <div className="text-right">
                              <span className="text-xs font-medium text-amber-600 block">
                                {formatearPuntos(mision.puntos_total)} pts retenidos
                              </span>
                              {/* Dice comercios, igual que el mínimo que se
                                  compara. Decía "misiones" y en seguimiento eso
                                  era otro número. */}
                              {faltanParaCobrar > 0 && (
                                <span className="text-[10px] text-gray-400 block leading-tight">
                                  a {faltanParaCobrar} {faltanParaCobrar === 1 ? 'comercio' : 'comercios'} de cobrar
                                </span>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Panel de acceso / condiciones (solo para no participantes) */}
        {mostrarPanelAcceso && (hayRestricciones || !yaUnido) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Condiciones de acceso</h2>
            <div className="space-y-2.5">
              {c.fecha_limite_inscripcion ? (
                <ReqRow
                  ok={!inscripcionVencida}
                  text={inscripcionVencida
                    ? `Inscripción cerrada (venció el ${formatearFecha(c.fecha_limite_inscripcion)})`
                    : `Inscripción abierta hasta el ${formatearFecha(c.fecha_limite_inscripcion)}`}
                />
              ) : (
                <ReqRow ok text="Inscripción abierta" />
              )}

              {c.tope_total_comercios != null && (
                <ReqRow
                  ok={!cupoLleno}
                  text={cupoLleno
                    ? `Sin cupos — ${c.comercios_relevados}/${c.tope_total_comercios} completos`
                    : `Cupos disponibles — ${c.tope_total_comercios - c.comercios_relevados} restantes`}
                />
              )}

              {nivelMinimo !== 'casual' && (
                <ReqRow
                  ok={nivelOk}
                  text={
                    // Sin nivel medido no se afirma cuál es: la fila dice que el
                    // requisito existe y nada más. Inventar un "tu nivel es
                    // Casual" que no se midió sería peor que no decirlo.
                    gondoleroNivel === null
                      ? `Requiere nivel ${NIVEL_LABEL[nivelMinimo]}`
                      : nivelOk
                        ? `Tu nivel ${NIVEL_LABEL[gondoleroNivel]} cumple el requisito (${NIVEL_LABEL[nivelMinimo]})`
                        : `Requiere nivel ${NIVEL_LABEL[nivelMinimo]} — tu nivel es ${NIVEL_LABEL[gondoleroNivel]}`}
                />
              )}

              <div className="flex items-center gap-2.5">
                <MapPin size={15} className="text-gondo-verde-400 shrink-0" />
                <span className="text-sm text-gray-600">
                  Mínimo <span className="font-medium">{c.min_comercios_para_cobrar} comercios</span> para cobrar puntos
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <Camera size={15} className="text-gondo-verde-400 shrink-0" />
                <span className="text-sm text-gray-600">
                  Máximo <span className="font-medium">{c.max_comercios_por_gondolero} comercios</span> por gondolero
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Cupo total (barra visual) — solo para no participantes */}
        {!yaUnido && c.tope_total_comercios != null && (
          <div className={`rounded-2xl border p-4 ${cupoLleno ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'}`}>
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Cupo disponible</h2>
              <span className={`text-sm font-medium ${cupoLleno ? 'text-red-600' : 'text-gray-600'}`}>
                {c.comercios_relevados} / {c.tope_total_comercios}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${cupoLleno ? 'bg-red-400' : 'bg-gondo-verde-400'}`}
                style={{ width: `${cupoProgreso}%` }}
              />
            </div>
            <p className={`text-xs mt-1.5 ${cupoLleno ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {cupoLleno ? 'Sin cupos disponibles' : `${c.tope_total_comercios - c.comercios_relevados} cupos restantes`}
            </p>
          </div>
        )}

        {/* Progreso general — solo para no participantes */}
        {!yaUnido && c.minimo_comercios !== null && c.minimo_comercios > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Progreso general</h2>
              <span className="text-sm font-medium text-gray-600">
                {c.comercios_relevados} / {c.minimo_comercios}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gondo-verde-400 rounded-full" style={{ width: `${progreso}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">comercios relevados</p>
          </div>
        )}

      </div>

      {/* CTA fijo al fondo — solo para usuarios no unidos en campañas activas */}
      {!yaUnido && campanaActiva && (
        <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 via-gray-50 pt-4">
          <UnirseButton
            campanaId={c.id}
            yaUnido={yaUnido}
            inscripcionCerrada={inscripcionVencida}
            cupoLleno={cupoLleno}
            nivelOk={nivelOk}
            nivelMinimo={nivelMinimo}
            gondoleroNivel={gondoleroNivel}
            participacionAnteriorEstado={participacionAnteriorEstado}
            sinAcceso={sinAcceso}
            motivoSinAcceso={motivoSinAcceso}
          />
        </div>
      )}

    </div>
  )
}
