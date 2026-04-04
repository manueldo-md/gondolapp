import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock, MapPin, User, X, Info } from 'lucide-react'
import { formatearFechaHora, labelTipoCampana } from '@/lib/utils'
import type { DeclaracionFoto, TipoCampana } from '@/types'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { GondolasTabs } from './gondolas-tabs'
import { FiltrosArchivo } from './filtros-archivo'
import { GondolasPendientes } from './gondolas-pendientes'
import { FotoAcciones } from './foto-acciones'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FotoPendienteRaw {
  id: string
  url: string
  storage_path: string | null
  declaracion: DeclaracionFoto
  precio_detectado: number | null
  precio_confirmado: number | null
  created_at: string
  campana_id: string
  gondolero: { nombre: string | null; alias: string | null } | null
  comercio:  { nombre: string; direccion: string | null } | null
  campana:   { nombre: string; tipo: TipoCampana } | null
  bloque:    { instruccion: string | null } | null
}

interface FotoPendiente extends FotoPendienteRaw {
  signedUrl: string | null
}

// ── Helpers visuales ──────────────────────────────────────────────────────────

const DECL_LABEL: Record<DeclaracionFoto, string> = {
  producto_presente:      'Producto presente',
  producto_no_encontrado: 'Producto no encontrado',
  solo_competencia:       'Solo competencia',
}

const DECL_COLOR: Record<DeclaracionFoto, string> = {
  producto_presente:      'bg-green-100 text-green-700',
  producto_no_encontrado: 'bg-red-100 text-red-700',
  solo_competencia:       'bg-amber-100 text-amber-700',
}

// ── FotoCard ──────────────────────────────────────────────────────────────────

function FotoCard({
  foto,
  mostrarAcciones,
}: {
  foto: FotoPendiente & { campana_id: string }
  mostrarAcciones: boolean
}) {
  const gondoleroNombre = foto.gondolero?.alias ?? foto.gondolero?.nombre ?? 'Gondolero'
  const decl = foto.declaracion
  const imgSrc = foto.signedUrl ?? foto.url

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">

      {/* Imagen */}
      <FotoLightbox
        src={imgSrc}
        alt={`Foto de ${foto.comercio?.nombre ?? 'comercio'}`}
        containerClassName="relative w-full h-52 shrink-0"
      />

      {/* Datos */}
      <div className="p-4 flex-1 flex flex-col gap-3">

        {foto.campana && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                {foto.campana.nombre}
              </span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[11px] text-gray-400 shrink-0">
                {labelTipoCampana(foto.campana.tipo)}
              </span>
            </div>
            <Link
              href={`/distribuidora/campanas/${foto.campana_id}`}
              className="shrink-0 text-[11px] font-semibold text-gondo-amber-400 hover:underline"
            >
              Ver campana →
            </Link>
          </div>
        )}

        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {foto.comercio?.nombre ?? 'Comercio desconocido'}
            </p>
            {foto.comercio?.direccion && (
              <p className="text-xs text-gray-400 truncate">{foto.comercio.direccion}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <User size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 truncate">{gondoleroNombre}</span>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${DECL_COLOR[decl]}`}>
            {DECL_LABEL[decl]}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          {foto.precio_confirmado != null ? (
            <span className="font-medium text-gray-600">
              💲 ${foto.precio_confirmado}
              {(foto.bloque as { instruccion: string | null } | null)?.instruccion && (
                <span className="text-gray-400 font-normal"> · {(foto.bloque as { instruccion: string | null }).instruccion}</span>
              )}
            </span>
          ) : <span />}
          <div className="flex items-center gap-1">
            <Clock size={11} />
            <span>{formatearFechaHora(foto.created_at)}</span>
          </div>
        </div>
      </div>

      {mostrarAcciones && (
        <div className="px-4 pb-4 shrink-0">
          <FotoAcciones fotoId={foto.id} />
        </div>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

// Params que activan el tab "archivo" automáticamente
const ARCHIVO_PARAMS = ['comercio_id', 'declaracion', 'estado', 'campana_id', 'gondolero_id', 'desde', 'hasta']

export default async function GondolasPage({
  searchParams,
}: {
  searchParams: {
    tab?:          string
    comercio_id?:  string
    declaracion?:  string
    estado?:       string
    campana_id?:   string
    gondolero_id?: string
    desde?:        string
    hasta?:        string
  }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario actual
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id ?? null
  console.log('[gondolas] distriId:', distriId)

  // Opción B: fotos visibles = campañas propias (siempre) + gondoleros vinculados (activos o históricos)
  // Las fotos de campañas propias se ven aunque el gondolero se haya desvinculado después.
  // Las fotos de gondoleros que alguna vez estuvieron vinculados también se mantienen visibles.

  // Gondoleros actualmente vinculados a esta distribuidora
  const { data: gondoleroRows } = await admin
    .from('profiles')
    .select('id, nombre, alias')
    .eq('distri_id', distriId ?? '')

  const gondoleroActualesIds = (gondoleroRows ?? []).map((g: { id: string }) => g.id)
  console.log('[gondolas] gondoleroIds actuales:', gondoleroActualesIds)

  // Gondoleros históricos: alguna vez vinculados (solicitud aprobada), ahora desvinculados
  const { data: historialSolicitudes, error: histError } = await admin
    .from('gondolero_distri_solicitudes')
    .select('gondolero_id')
    .eq('distri_id', distriId ?? '')
    .eq('estado', 'aprobada')

  console.log('[gondolas] históricos de solicitudes:', historialSolicitudes)
  console.log('[gondolas] histError:', histError)

  const historialIds = (historialSolicitudes ?? [])
    .map((s: { gondolero_id: string }) => s.gondolero_id)
    .filter(id => !gondoleroActualesIds.includes(id))

  // Perfiles de gondoleros históricos (para el filtro de archivo)
  let gondoleroHistoricosRows: { id: string; nombre: string | null; alias: string | null }[] = []
  if (historialIds.length > 0) {
    const { data: histProfiles } = await admin
      .from('profiles')
      .select('id, nombre, alias')
      .in('id', historialIds)
    gondoleroHistoricosRows = (histProfiles ?? []) as { id: string; nombre: string | null; alias: string | null }[]
  }

  // IDs combinados: activos + históricos
  const gondoleroIds = [...gondoleroActualesIds, ...historialIds]
  console.log('[gondolas] gondoleroIds históricos (nuevos):', historialIds)
  console.log('[gondolas] todos gondoleroIds:', gondoleroIds)
  // Todos los rows para el filtro desplegable
  const todosGondoleroRows = [...(gondoleroRows ?? []), ...gondoleroHistoricosRows]

  // Campañas propias de esta distribuidora
  const { data: campanasDistri } = await admin
    .from('campanas')
    .select('id, nombre')
    .eq('distri_id', distriId ?? '')
    .order('nombre', { ascending: true })

  const campanaIds = (campanasDistri ?? []).map((c: { id: string }) => c.id)

  // ── Determinar tab activo ──────────────────────────────────────────────────
  const tieneFiltersArchivo = ARCHIVO_PARAMS.some(
    p => !!searchParams[p as keyof typeof searchParams]
  )
  const tabActivo: 'pendiente' | 'archivo' =
    searchParams.tab === 'pendiente' ? 'pendiente' :
    (searchParams.tab === 'archivo' || tieneFiltersArchivo) ? 'archivo' :
    'pendiente'

  // ── Filtros activos ────────────────────────────────────────────────────────
  const comercioIdFiltro  = searchParams.comercio_id  ?? null
  const declaracionFiltro = searchParams.declaracion  ?? null
  const estadoFiltro      = searchParams.estado       ?? null
  const campanaIdFiltro   = searchParams.campana_id   ?? null
  const gondoleroIdFiltro = searchParams.gondolero_id ?? null
  const desdeFiltro       = searchParams.desde        ?? null
  const hastaFiltro       = searchParams.hasta        ?? null

  // "Modo consulta" = llegó desde alertas con comercio_id
  const modoConsulta = !!comercioIdFiltro

  // Nombre del comercio filtrado (para el banner)
  let comercioNombreFiltro: string | null = null
  if (comercioIdFiltro) {
    const { data: com } = await admin
      .from('comercios')
      .select('nombre')
      .eq('id', comercioIdFiltro)
      .single()
    comercioNombreFiltro = com?.nombre ?? null
  }

  // ── Query principal ────────────────────────────────────────────────────────
  // UUID imposible para evitar IN() vacío que rompe PostgREST
  const NULL_UUID = '00000000-0000-0000-0000-000000000000'

  // Arrays seguros: nunca vacíos (IN con array vacío genera SQL inválido)
  const safeGondoleroIds = gondoleroIds.length > 0 ? gondoleroIds : [NULL_UUID]
  const safeCampanaIds   = campanaIds.length   > 0 ? campanaIds   : [NULL_UUID]

  // OR de visibilidad: gondoleros (activos + históricos) OR campañas propias
  const orVisibilidad = `gondolero_id.in.(${safeGondoleroIds.join(',')}),campana_id.in.(${safeCampanaIds.join(',')})`

  console.log('[gondolas] safeGondoleroIds:', safeGondoleroIds)
  console.log('[gondolas] safeCampanaIds:', safeCampanaIds)

  let query = admin
    .from('fotos')
    .select(`
      id, url, storage_path, declaracion, precio_detectado, precio_confirmado, created_at, campana_id,
      gondolero:profiles ( nombre, alias ),
      comercio:comercios  ( nombre, direccion ),
      campana:campanas    ( nombre, tipo ),
      bloque:bloques_foto ( instruccion )
    `)
    .or(orVisibilidad)   // ← restricción de distri aplicada siempre primero
    .order('created_at', { ascending: false })
    .limit(150)

  // Filtros de tab y búsqueda
  if (tabActivo === 'pendiente') {
    query = query.eq('estado', 'pendiente')
  } else {
    if (estadoFiltro)      query = query.eq('estado',      estadoFiltro)
    if (comercioIdFiltro)  query = query.eq('comercio_id', comercioIdFiltro)
    if (declaracionFiltro) query = query.eq('declaracion', declaracionFiltro)
    if (campanaIdFiltro)   query = query.eq('campana_id',  campanaIdFiltro)
    if (desdeFiltro)       query = query.gte('created_at', desdeFiltro)
    if (hastaFiltro)       query = query.lte('created_at', hastaFiltro + 'T23:59:59')
    if (gondoleroIdFiltro) query = query.eq('gondolero_id', gondoleroIdFiltro)
  }

  const { data, error } = await query
  if (error) console.error('[gondolas] error fetching fotos:', error.message)
  console.log('[gondolas] fotos encontradas:', data?.length ?? 0, '| tab:', tabActivo)

  const fotosRaw = (data as FotoPendienteRaw[] | null) ?? []

  // Count de pendientes (para el badge del tab)
  const { count: pendienteCount } = await admin
    .from('fotos')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
    .or(orVisibilidad)

  // Generar URLs firmadas para el bucket privado
  const fotos: FotoPendiente[] = await Promise.all(
    fotosRaw.map(async (foto) => {
      if (!foto.storage_path) return { ...foto, signedUrl: null }
      const { data: signed } = await admin.storage
        .from('fotos-gondola')
        .createSignedUrl(foto.storage_path, 3600)
      return { ...foto, signedUrl: signed?.signedUrl ?? null }
    })
  )

  // ── Títulos ────────────────────────────────────────────────────────────────
  const titulo =
    tabActivo === 'pendiente' ? 'Por aprobar' :
    modoConsulta ? `Historial · ${comercioNombreFiltro ?? 'Comercio'}` :
    'Archivo completo'

  const subtitulo =
    tabActivo === 'pendiente'
      ? fotos.length === 0
        ? 'No hay fotos pendientes de revisión'
        : `${fotos.length} foto${fotos.length !== 1 ? 's' : ''} esperando revisión`
      : fotos.length === 0
        ? 'No hay fotos con estos filtros'
        : `${fotos.length} foto${fotos.length !== 1 ? 's' : ''} encontrada${fotos.length !== 1 ? 's' : ''}`

  const filtrosActuales = {
    estado:       estadoFiltro   ?? undefined,
    campana_id:   campanaIdFiltro   ?? undefined,
    gondolero_id: gondoleroIdFiltro ?? undefined,
    declaracion:  declaracionFiltro ?? undefined,
    desde:        desdeFiltro       ?? undefined,
    hasta:        hastaFiltro       ?? undefined,
    comercio_id:  comercioIdFiltro  ?? undefined,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{titulo}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{subtitulo}</p>
        </div>
      </div>

      {/* Tabs */}
      <GondolasTabs tabActivo={tabActivo} pendienteCount={pendienteCount ?? 0} />

      {/* Banner modo consulta (azul) — llegó desde alertas */}
      {tabActivo === 'archivo' && modoConsulta && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-blue-500 shrink-0" />
            <p className="text-sm text-blue-800">
              Filtrando desde alerta
              {comercioNombreFiltro && (
                <span className="font-semibold"> · {comercioNombreFiltro}</span>
              )}
              {declaracionFiltro && (
                <span className="ml-1.5 font-medium">
                  · {DECL_LABEL[declaracionFiltro as DeclaracionFoto] ?? declaracionFiltro}
                </span>
              )}
            </p>
          </div>
          <Link
            href="/distribuidora/gondolas"
            className="ml-3 text-blue-500 hover:text-blue-800 transition-colors shrink-0"
            title="Volver a la cola normal"
          >
            <X size={16} />
          </Link>
        </div>
      )}

      {/* Panel de filtros — tab archivo, sin modo consulta */}
      {tabActivo === 'archivo' && !modoConsulta && (
        <FiltrosArchivo
          campanas={campanasDistri ?? []}
          gondoleros={todosGondoleroRows}
          filtros={filtrosActuales}
        />
      )}

      {/* Grid de fotos */}
      {tabActivo === 'pendiente' ? (
        <GondolasPendientes fotos={fotos.map(f => ({ ...f, signedUrl: f.signedUrl ?? null, url: f.url ?? null }))} />
      ) : fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 size={28} className="text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin resultados</h3>
          <p className="text-sm text-gray-400">No hay fotos que coincidan con estos filtros.</p>
          <Link
            href="/distribuidora/gondolas?tab=archivo"
            className="mt-3 text-sm text-gondo-amber-400 font-medium hover:underline"
          >
            Ver todo el archivo
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {fotos.map(foto => (
            <FotoCard
              key={foto.id}
              foto={foto}
              mostrarAcciones={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
