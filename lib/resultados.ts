/**
 * lib/resultados.ts
 * Tipos compartidos y carga de datos para los paneles de resultados por
 * campaña (marca / distribuidora / repositora / admin). Un solo cargador para
 * los cuatro: los cuatro ven los mismos resultados.
 *
 * FUENTE ÚNICA DE RESPUESTAS: mision_respuestas.
 * Desde el 14/9/2026 ya no se lee `foto_respuestas` en ningún lado — esa tabla
 * quedó sin lectores ni escritores y solo falta borrarla. Ver CLAUDE.md,
 * "foto_respuestas está condenada".
 *
 * La unidad de salida es el MÓDULO: un campo configurado de la campaña con sus
 * respuestas ya agregadas según su tipo. Se emiten TODOS los campos
 * configurados, en orden (bloque.orden, campo.orden), incluso los que nadie
 * respondió — un campo sin respuestas es información, no una fila ausente.
 */

import {
  normalizarBinaria,
  normalizarNumero,
  normalizarSeleccionMultiple,
  normalizarTexto,
} from './resultados-normalizar'

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

export interface FotoConUrl {
  id: string
  url: string | null
  signedUrl: string | null
  storage_path: string | null
  estado: string
  campo_id: string | null
  bloque_id: string | null
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gondolero: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comercio: any
}

/** Contexto de una respuesta: dónde y cuándo se relevó. */
export interface ContextoRespuesta {
  comercio: string | null
  ciudad: string | null
  fecha: string | null
  alias: string | null
}

export interface ModuloBase {
  bloqueId: string
  bloqueOrden: number
  bloqueInstruccion: string | null
  campo: CampoMeta
  /** Cuántas misiones respondieron este campo. 0 = módulo vacío. */
  base: number
}

export type Modulo =
  | (ModuloBase & { tipo: 'binaria'; si: number; no: number })
  | (ModuloBase & {
      tipo: 'numero'
      valores: number[]
      avg: number | null
      /** Mediana. Con outliers el promedio solo miente; juntos se nota. */
      mediana: number | null
      min: number | null
      max: number | null
      /** Valor por valor con su contexto, para el detalle bajo los tres tiles. */
      respuestas: { valor: number; contexto: ContextoRespuesta }[]
    })
  | (ModuloBase & { tipo: 'seleccion'; opciones: { opcion: string; n: number }[] })
  | (ModuloBase & { tipo: 'texto'; respuestas: { valor: string; contexto: ContextoRespuesta }[] })
  | (ModuloBase & { tipo: 'foto'; fotos: FotoConUrl[] })
  | (ModuloBase & { tipo: 'otro' })

export interface ResultadosData {
  camposMap: Map<string, CampoMeta>
  /** Módulos en orden (bloque.orden, campo.orden). Incluye los vacíos. */
  modulos: Modulo[]
  tieneCamposFoto: boolean
  /** Respuestas por foto_id — para el popup del lightbox. */
  fotoRespuestasMap: Map<string, { campo_id: string; valor: unknown }[]>
  misionesAprobadas: number
  misionesTotales: number
  /** PDV distintos con al menos una misión. No usar campanas.comercios_relevados: está inflado. */
  pdvRelevados: number
  counts: Record<string, number>
  gondoleroCount: number
  totalFotos: number
  fotosAprobadas: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** PostgREST devuelve los embeds como objeto o como array de uno según el caso. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function uno<T>(embed: any): T | null {
  if (!embed) return null
  return (Array.isArray(embed) ? embed[0] : embed) ?? null
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
    .select('id, url, storage_path, estado, campo_id, bloque_id, created_at, gondolero:profiles(nombre,alias), comercio:comercios(nombre,direccion)')
    .eq('campana_id', campanaId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (opts?.ordenarPorMision) {
    // Repositora: agrupa fotos de la misma misión
    fotosQuery = fotosQuery.order('mision_id', { ascending: false, nullsFirst: false })
  }
  // El filtro por estado es global: filtra todas las galerías a la vez.
  if (tab) fotosQuery = fotosQuery.eq('estado', tab)

  const [fotosData, fotosCuenta, partData, bloquesData, misionesData] = await Promise.all([
    fotosQuery,
    admin.from('fotos').select('id, estado').eq('campana_id', campanaId),
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
      .select('id, estado, comercio_id, created_at, gondolero:profiles(alias)')
      .eq('campana_id', campanaId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misiones = (misionesData.data ?? []) as any[]
  const allMisionIds = misiones.map(m => m.id as string)

  // ── 2. Contexto por misión: comercio y ciudad ───────────────────────────────
  // Se resuelve en dos pasos en vez de con un embed de tres niveles: los embeds
  // anidados de PostgREST devuelven objeto o array según el caso y ya nos costó
  // guardas repartidas por todo el archivo.
  const comercioIds = [...new Set(misiones.map(m => m.comercio_id).filter(Boolean))] as string[]
  const comercioCtx = new Map<string, { nombre: string | null; ciudad: string | null }>()
  if (comercioIds.length > 0) {
    const { data: comerciosData } = await admin
      .from('comercios')
      .select('id, nombre, localidad:localidades(nombre)')
      .in('id', comercioIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const co of ((comerciosData ?? []) as any[])) {
      const loc = uno<{ nombre: string }>(co.localidad)
      comercioCtx.set(co.id, { nombre: co.nombre ?? null, ciudad: loc?.nombre ?? null })
    }
  }

  const misionCtx = new Map<string, ContextoRespuesta>()
  for (const m of misiones) {
    const co = m.comercio_id ? comercioCtx.get(m.comercio_id) : undefined
    const g = uno<{ alias: string | null }>(m.gondolero)
    misionCtx.set(m.id, {
      comercio: co?.nombre ?? null,
      ciudad:   co?.ciudad ?? null,
      fecha:    m.created_at ?? null,
      alias:    g?.alias ?? null,
    })
  }

  // ── 3. Signed URLs ──────────────────────────────────────────────────────────
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

  // ── 4. Contadores por estado ────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = ((fotosCuenta.data ?? []) as any[]).reduce((acc: Record<string, number>, f: any) => {
    acc[f.estado] = (acc[f.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // ── 5. Campos configurados ──────────────────────────────────────────────────
  const camposMap = new Map<string, CampoMeta>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bloques = ((bloquesData.data ?? []) as any[])
  for (const bloque of bloques) {
    for (const campo of (bloque.bloque_campos ?? [])) camposMap.set(campo.id, campo)
  }
  const tieneCamposFoto = bloques.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => (b.bloque_campos ?? []).some((c: { tipo: string }) => c.tipo === 'foto')
  )

  // ── 6. Respuestas vigentes, agrupadas por campo ─────────────────────────────
  const respuestasPorCampo = new Map<string, { valor: unknown; misionId: string }[]>()
  if (allMisionIds.length > 0) {
    const { data: misionResps } = await admin
      .from('mision_respuestas')
      .select('mision_id, campo_id, valor')
      .in('mision_id', allMisionIds)
      .is('reemplazada_por', null)   // solo la versión vigente de cada respuesta
      .limit(20000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (misionResps ?? []) as any[]) {
      if (!camposMap.has(r.campo_id)) continue
      if (!respuestasPorCampo.has(r.campo_id)) respuestasPorCampo.set(r.campo_id, [])
      respuestasPorCampo.get(r.campo_id)!.push({ valor: r.valor, misionId: r.mision_id })
    }
  }

  // ── 7. Popup del lightbox ───────────────────────────────────────────────────
  // UNA sola fuente: mision_respuestas.
  //
  // Hasta el 14/9/2026 esto leía también foto_respuestas y apilaba las dos
  // listas sin deduplicar, así que cada respuesta aparecía repetida en el
  // popup. Se verificó que las 47 filas de foto_respuestas tienen equivalente
  // en mision_respuestas con el valor idéntico —en dev y en producción—, así
  // que la fuente legacy no aportaba ningún dato propio.
  //
  // Se sacó la fuente en vez de deduplicar con un Set a propósito: con las dos
  // lecturas vivas, el día que los valores difieran el Set elegiría en silencio
  // el que llegó primero. Ver CLAUDE.md, "foto_respuestas está condenada".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFotoIds = ((fotosCuenta.data ?? []) as any[]).map((f: any) => f.id as string)
  const fotoRespuestasMap = new Map<string, { campo_id: string; valor: unknown }[]>()
  if (allFotoIds.length > 0) {
    const { data: mrByFoto } = await admin
      .from('mision_respuestas')
      .select('foto_id, campo_id, valor')
      .in('foto_id', allFotoIds)
      .is('reemplazada_por', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((mrByFoto ?? []) as any[])) {
      if (!r.foto_id) continue
      if (!fotoRespuestasMap.has(r.foto_id)) fotoRespuestasMap.set(r.foto_id, [])
      fotoRespuestasMap.get(r.foto_id)!.push({ campo_id: r.campo_id, valor: r.valor })
    }
  }

  // ── 8. Módulos ──────────────────────────────────────────────────────────────
  // Se itera sobre los campos CONFIGURADOS, no sobre las respuestas: un campo
  // que nadie respondió tiene que aparecer vacío, no desaparecer.
  const modulos: Modulo[] = []
  const bloquesOrdenados = [...bloques].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

  for (const bloque of bloquesOrdenados) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const campos = [...((bloque.bloque_campos ?? []) as any[])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const primerCampoFotoId: string | null = campos.find(c => c.tipo === 'foto')?.id ?? null

    for (const campo of campos) {
      const respuestas = respuestasPorCampo.get(campo.id) ?? []
      const comun: ModuloBase = {
        bloqueId:          bloque.id,
        bloqueOrden:       bloque.orden ?? 0,
        bloqueInstruccion: bloque.instruccion ?? null,
        campo:             campo as CampoMeta,
        base:              respuestas.length,
      }

      if (campo.tipo === 'binaria') {
        let si = 0
        for (const r of respuestas) if (normalizarBinaria(r.valor)) si++
        modulos.push({ ...comun, tipo: 'binaria', si, no: respuestas.length - si })

      } else if (campo.tipo === 'numero') {
        // Ordenado por valor descendente: los tres tiles de arriba dicen cuánto
        // es el máximo y el mínimo, pero no DÓNDE. El detalle ordenado por
        // valor pone los extremos en los bordes de la lista, pegados a los
        // tiles que generaron la pregunta.
        const conContexto = respuestas
          .map(r => ({
            valor: normalizarNumero(r.valor),
            contexto: misionCtx.get(r.misionId) ?? { comercio: null, ciudad: null, fecha: null, alias: null },
          }))
          .filter((r): r is { valor: number; contexto: ContextoRespuesta } => r.valor !== null)
          .sort((a, b) => b.valor - a.valor)

        const valores = conContexto.map(r => r.valor)
        const avg = valores.length
          ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10
          : null

        // Mediana: con pocos valores y un outlier, el promedio solo engaña.
        // En dev hay un campo con promedio 3.269 y mediana 2.550 porque alguien
        // cargó un 7777. Mostradas juntas, la diferencia salta.
        const asc = [...valores].sort((a, b) => a - b)
        const medio = Math.floor(asc.length / 2)
        const mediana = asc.length === 0
          ? null
          : asc.length % 2 === 1
            ? asc[medio]
            : Math.round(((asc[medio - 1] + asc[medio]) / 2) * 10) / 10

        modulos.push({
          ...comun, tipo: 'numero', valores, avg, mediana,
          min: valores.length ? Math.min(...valores) : null,
          max: valores.length ? Math.max(...valores) : null,
          respuestas: conContexto,
        })

      } else if (campo.tipo === 'seleccion_unica' || campo.tipo === 'seleccion_multiple') {
        const cuenta = new Map<string, number>()
        // Se siembra con las opciones configuradas para que una opción que
        // nadie eligió se muestre en cero, y no se caiga del listado.
        for (const op of (campo.opciones ?? [])) cuenta.set(String(op), 0)
        for (const r of respuestas) {
          const elegidas = campo.tipo === 'seleccion_multiple'
            ? normalizarSeleccionMultiple(r.valor)
            : [normalizarTexto(r.valor)].filter(s => s !== '')
          for (const op of elegidas) cuenta.set(op, (cuenta.get(op) ?? 0) + 1)
        }
        modulos.push({
          ...comun, tipo: 'seleccion',
          opciones: [...cuenta.entries()].map(([opcion, n]) => ({ opcion, n })).sort((a, b) => b.n - a.n),
        })

      } else if (campo.tipo === 'texto') {
        modulos.push({
          ...comun, tipo: 'texto',
          respuestas: respuestas
            .map(r => ({
              valor: normalizarTexto(r.valor),
              contexto: misionCtx.get(r.misionId) ?? { comercio: null, ciudad: null, fecha: null, alias: null },
            }))
            .filter(r => r.valor.trim() !== '')
            .sort((a, b) => (b.contexto.fecha ?? '').localeCompare(a.contexto.fecha ?? '')),
        })

      } else if (campo.tipo === 'foto') {
        // Fotos de este campo. Las históricas con campo_id null se adjuntan al
        // PRIMER campo foto del bloque: son del flujo viejo, donde la foto era
        // del bloque y no de un campo. Sin esto desaparecerían del panel.
        const suyas = fotos.filter(f =>
          f.campo_id === campo.id ||
          (f.campo_id === null && f.bloque_id === bloque.id && campo.id === primerCampoFotoId)
        )
        modulos.push({ ...comun, tipo: 'foto', base: suyas.length, fotos: suyas })

      } else {
        modulos.push({ ...comun, tipo: 'otro' })
      }
    }
  }

  // Lectura de resultados: el dato primero, la evidencia después.
  //
  // El orden configurado de la campaña —(bloque.orden, campo.orden)— sigue
  // mandando DENTRO de cada grupo, y sigue siendo el orden en el que el
  // gondolero captura. Lo único que cambia es cómo se leen los resultados: una
  // galería intercalada empuja fuera de pantalla los módulos que vienen
  // después, y quien abre el panel quiere el número antes que la foto.
  const modulosOrdenados = [
    ...modulos.filter(m => m.tipo !== 'foto'),
    ...modulos.filter(m => m.tipo === 'foto'),
  ]

  // ── 9. Contadores ───────────────────────────────────────────────────────────
  const misionCounts = misiones.reduce((acc: Record<string, number>, m) => {
    acc[m.estado] = (acc[m.estado] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const misionesAprobadas = misionCounts['aprobada'] ?? 0
  const misionesTotales   = Object.values(misionCounts).reduce((a: number, b) => a + (b as number), 0)
  const pdvRelevados      = comercioIds.length

  const totalFotos     = Object.values(counts).reduce((a, b) => a + b, 0)
  const fotosAprobadas = counts['aprobada'] ?? 0
  const gondoleroCount = partData.count ?? 0

  return {
    camposMap,
    modulos: modulosOrdenados,
    tieneCamposFoto,
    fotoRespuestasMap,
    misionesAprobadas,
    misionesTotales,
    pdvRelevados,
    counts,
    gondoleroCount,
    totalFotos,
    fotosAprobadas,
  }
}
