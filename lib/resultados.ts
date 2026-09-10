/**
 * lib/resultados.ts
 * Tipos compartidos y función de carga de datos para los paneles de
 * resultados por campaña (marca / distribuidora / repositora).
 *
 * FUENTE CANÓNICA DE RESPUESTAS: mision_respuestas
 * Después de la migración (Etapa 1) todos los valores viven en
 * mision_respuestas. foto_respuestas sigue leyéndose SOLO para el popup
 * del lightbox y la tabla de detalle (legacy; vacío en campañas nuevas).
 * NO usar foto_respuestas para agregar stats — produciría doble conteo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface CampoMeta {
  id: string
  tipo: string
  pregunta: string
  opciones: string[] | null
  orden: number
}

export interface CampoStat extends CampoMeta {
  total: number
  siCount?: number
  noCount?: number
  opcionCounts?: Record<string, number>
  numAvg?: number
  numMin?: number
  numMax?: number
  textUltimas?: string[]
}

export interface RespuestaRow {
  valor: unknown
  alias: string | null
  comercioNombre: string | null
  comercioDireccion: string | null
  createdAt: string
}

export interface PrecioRow {
  alias: string | null
  comercioNombre: string | null
  comercioDireccion: string | null
  precio: number
  createdAt: string
}

export interface FotoConUrl {
  id: string
  url: string | null
  signedUrl: string | null
  storage_path: string | null
  estado: string
  precio_detectado: number | null
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gondolero: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comercio: any
}

export interface ResultadosData {
  camposMap: Map<string, CampoMeta>
  tieneCamposFoto: boolean
  campoStats: CampoStat[]
  /** Solo tiene datos para campañas legacy (foto_respuestas). Vacío en campañas nuevas. */
  campoDetallesMap: Map<string, RespuestaRow[]>
  /** Respuestas por foto_id — para el popup del lightbox. */
  fotoRespuestasMap: Map<string, { campo_id: string; valor: unknown }[]>
  misionesAprobadas: number
  misionesTotales: number
  fotos: FotoConUrl[]
  counts: Record<string, number>
  gondoleroCount: number
  preciosArr: number[]
  precioRows: PrecioRow[]
  totalFotos: number
  fotosAprobadas: number
}

// ── Carga de datos ────────────────────────────────────────────────────────────

export async function loadResultadosCampanaData(
  admin: AdminClient,
  campanaId: string,
  tab: string,
  opts?: { ordenarPorMision?: boolean }
): Promise<ResultadosData> {

  // ── 1. Queries paralelas ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fotosQuery: any = admin
    .from('fotos')
    .select('id, url, storage_path, estado, precio_detectado, created_at, gondolero:profiles(nombre,alias), comercio:comercios(nombre,direccion)')
    .eq('campana_id', campanaId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (opts?.ordenarPorMision) {
    // Repositora: agrupa fotos de la misma misión
    fotosQuery = fotosQuery.order('mision_id', { ascending: false, nullsFirst: false })
  }
  if (tab) fotosQuery = fotosQuery.eq('estado', tab)

  const [fotosData, fotosCuenta, precioData, partData, bloquesData, misionesData] = await Promise.all([
    fotosQuery,
    admin.from('fotos').select('id, estado').eq('campana_id', campanaId),
    admin
      .from('fotos')
      .select('precio_detectado, precio_confirmado, created_at, gondolero:profiles(alias), comercio:comercios(nombre, direccion)')
      .eq('campana_id', campanaId)
      .eq('estado', 'aprobada'),
    admin
      .from('participaciones')
      .select('gondolero_id', { count: 'exact', head: true })
      .eq('campana_id', campanaId),
    admin
      .from('bloques_foto')
      .select('id, orden, instruccion, bloque_campos(id, tipo, pregunta, opciones, orden)')
      .eq('campana_id', campanaId)
      .order('orden'),
    admin
      .from('misiones')
      .select('id, estado')
      .eq('campana_id', campanaId),
  ])

  // ── 2. Signed URLs ──────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotosRaw = (fotosData.data ?? []) as any[]
  const fotos: FotoConUrl[] = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fotosRaw.map(async (f: any) => {
      let signedUrl: string | null = null
      if (f.storage_path) {
        const { data: s } = await admin.storage.from('fotos-gondola').createSignedUrl(f.storage_path, 3600)
        signedUrl = s?.signedUrl ?? null
      }
      return { ...f, signedUrl: signedUrl ?? f.url ?? null }
    })
  )

  // ── 3. Contadores por estado ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = ((fotosCuenta.data ?? []) as any[]).reduce((acc: Record<string, number>, f: any) => {
    acc[f.estado] = (acc[f.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── 4. Mapa de campos (desde bloques_foto) ──────────────────────────────────
  const camposMap = new Map<string, CampoMeta>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const bloque of ((bloquesData.data ?? []) as any[])) {
    for (const campo of (bloque.bloque_campos ?? [])) camposMap.set(campo.id, campo)
  }

  const tieneCamposFoto = ((bloquesData.data ?? []) as any[]).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => (b.bloque_campos ?? []).some((c: { tipo: string }) => c.tipo === 'foto')
  )

  // ── 5. foto_respuestas — SOLO para lightbox popup y detalle legacy ──────────
  // No se usa para agregar stats: después de la migración, los valores ya
  // están en mision_respuestas. Usar foto_respuestas para stats causa doble conteo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFotoIds = ((fotosCuenta.data ?? []) as any[]).map((f: any) => f.id as string)
  const respuestasData = allFotoIds.length > 0
    ? await admin
        .from('foto_respuestas')
        .select('foto_id, campo_id, valor, foto:fotos(created_at, gondolero:profiles(alias), comercio:comercios(nombre, direccion))')
        .in('foto_id', allFotoIds)
        .limit(20000)
    : { data: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRespuestas = ((respuestasData.data ?? []) as any[])

  // fotoRespuestasMap — popup del lightbox por foto_id
  const fotoRespuestasMap = new Map<string, { campo_id: string; valor: unknown }[]>()
  for (const r of allRespuestas) {
    if (!fotoRespuestasMap.has(r.foto_id)) fotoRespuestasMap.set(r.foto_id, [])
    fotoRespuestasMap.get(r.foto_id)!.push({ campo_id: r.campo_id, valor: r.valor })
  }

  // campoDetallesMap — tabla de detalle por campo (legacy; vacío en campañas nuevas)
  const campoDetallesMap = new Map<string, RespuestaRow[]>()
  for (const r of allRespuestas) {
    if (!camposMap.has(r.campo_id)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fotoData = r.foto as any
    const alias = Array.isArray(fotoData?.gondolero) ? fotoData.gondolero[0]?.alias ?? null : fotoData?.gondolero?.alias ?? null
    const cnom  = Array.isArray(fotoData?.comercio)  ? fotoData.comercio[0]?.nombre ?? null  : fotoData?.comercio?.nombre ?? null
    const cdir  = Array.isArray(fotoData?.comercio)  ? fotoData.comercio[0]?.direccion ?? null : fotoData?.comercio?.direccion ?? null
    const row: RespuestaRow = { valor: r.valor, alias, comercioNombre: cnom, comercioDireccion: cdir, createdAt: fotoData?.created_at ?? '' }
    if (!campoDetallesMap.has(r.campo_id)) campoDetallesMap.set(r.campo_id, [])
    campoDetallesMap.get(r.campo_id)!.push(row)
  }
  for (const [campoId, rows] of campoDetallesMap) {
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    campoDetallesMap.set(campoId, rows)
  }

  // ── 6. campoValoresMap — SOLO mision_respuestas (fuente canónica) ───────────
  const campoValoresMap = new Map<string, unknown[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMisionIds = ((misionesData.data ?? []) as any[]).map((m: any) => m.id as string)
  if (allMisionIds.length > 0) {
    const { data: misionResps } = await admin
      .from('mision_respuestas')
      .select('mision_id, campo_id, valor')
      .in('mision_id', allMisionIds)
      .is('reemplazada_por', null)   // solo la versión vigente de cada respuesta
      .limit(20000)
    for (const r of (misionResps ?? []) as any[]) {
      if (!camposMap.has(r.campo_id)) continue
      if (!campoValoresMap.has(r.campo_id)) campoValoresMap.set(r.campo_id, [])
      campoValoresMap.get(r.campo_id)!.push(r.valor)
    }
  }

  // ── 7. Estadísticas por campo ───────────────────────────────────────────────
  const campoStats: CampoStat[] = []
  for (const [campoId, valores] of campoValoresMap) {
    const campo = camposMap.get(campoId)!
    const stat: CampoStat = { ...campo, total: valores.length }

    if (campo.tipo === 'binaria') {
      let si = 0, no = 0
      for (const v of valores) { (v === true || v === 'true' || v === 'Sí') ? si++ : no++ }
      stat.siCount = si; stat.noCount = no

    } else if (campo.tipo === 'seleccion_unica') {
      const cnts: Record<string, number> = {}
      for (const v of valores) { const s = String(v); cnts[s] = (cnts[s] ?? 0) + 1 }
      stat.opcionCounts = cnts

    } else if (campo.tipo === 'seleccion_multiple') {
      const cnts: Record<string, number> = {}
      for (const v of valores) {
        const arr = Array.isArray(v) ? v : []
        for (const item of arr) { const s = String(item); cnts[s] = (cnts[s] ?? 0) + 1 }
      }
      stat.opcionCounts = cnts

    } else if (campo.tipo === 'numero') {
      const nums = valores.map(v => Number(v)).filter(n => !isNaN(n))
      if (nums.length > 0) {
        stat.numAvg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 10) / 10
        stat.numMin = Math.min(...nums)
        stat.numMax = Math.max(...nums)
      }

    } else if (campo.tipo === 'texto') {
      stat.textUltimas = valores.slice(-50).map(v => String(v)).filter(s => s.trim())
    }

    campoStats.push(stat)
  }
  campoStats.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

  // ── 8. Contadores de misiones ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misionCounts = ((misionesData.data ?? []) as any[]).reduce((acc: Record<string, number>, m: any) => {
    acc[m.estado] = (acc[m.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const misionesAprobadas = misionCounts['aprobada'] ?? 0
  const misionesTotales   = Object.values(misionCounts).reduce((a, b) => a + b, 0)

  // ── 9. Precios ──────────────────────────────────────────────────────────────
  const preciosArr: number[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const f of (precioData.data ?? []) as any[]) {
    const p = f.precio_confirmado ?? f.precio_detectado
    if (p != null && p > 0) preciosArr.push(p)
  }

  const precioRows: PrecioRow[] = (precioData.data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((acc: PrecioRow[], f: any) => {
      const p = f.precio_confirmado ?? f.precio_detectado
      if (p != null && p > 0) {
        const alias = Array.isArray(f.gondolero) ? f.gondolero[0]?.alias ?? null : f.gondolero?.alias ?? null
        const cnom  = Array.isArray(f.comercio)  ? f.comercio[0]?.nombre ?? null  : f.comercio?.nombre ?? null
        const cdir  = Array.isArray(f.comercio)  ? f.comercio[0]?.direccion ?? null : f.comercio?.direccion ?? null
        acc.push({ alias, comercioNombre: cnom, comercioDireccion: cdir, precio: p, createdAt: f.created_at ?? '' })
      }
      return acc
    }, [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))

  // ── 10. Totales de fotos ────────────────────────────────────────────────────
  const totalFotos     = Object.values(counts).reduce((a, b) => a + b, 0)
  const fotosAprobadas = counts['aprobada'] ?? 0
  const gondoleroCount = partData.count ?? 0

  return {
    camposMap,
    tieneCamposFoto,
    campoStats,
    campoDetallesMap,
    fotoRespuestasMap,
    misionesAprobadas,
    misionesTotales,
    fotos,
    counts,
    gondoleroCount,
    preciosArr,
    precioRows,
    totalFotos,
    fotosAprobadas,
  }
}
