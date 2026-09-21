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
  /** Metros al comercio al capturar. null = foto anterior al 15/9/2026. */
  distancia_metros: number | null
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
  /**
   * PDV distintos con al menos una misión APROBADA.
   *
   * Aprobada y no "cualquier misión": el mínimo de representatividad se mide
   * sobre lo validado, y si el KPI contara todo habría dos números distintos en
   * la misma pantalla diciendo cosas parecidas. Un PDV con la misión todavía en
   * revisión no aporta dato todavía — aparece aparte, en `pdvEnRevision`.
   *
   * No usar `campanas.comercios_relevados`: está inflado por doble incremento.
   */
  pdvRelevados: number
  /** PDV cuyas misiones están todas pendientes de revisión. Va en el contexto, no en el KPI. */
  pdvEnRevision: number
  /**
   * Ciudades distintas donde se relevó, vía comercios.localidad_id.
   * Se calcula sobre el mismo set que `pdvRelevados`: comercios con misión
   * aprobada. Un comercio sin localidad no suma, así que es un piso.
   */
  ciudades: number
  /**
   * PDV relevados cuyo comercio no tiene localidad cargada.
   *
   * Existe para que el hueco se vea. Sin esto, una campaña con 6 PDV y ninguna
   * localidad no muestra geografía y se lee como si no tuviera, en vez de como
   * que falta cargarla; y con cobertura parcial, "3 ciudades" calculado sobre 6
   * de 10 PDV parece un dato completo. Al 16/9/2026 son 9 de 100 comercios en
   * dev y 2 de 93 en prod, y el único salto que falla es este primero: si un
   * comercio tiene localidad, la cadena hasta provincia funciona siempre.
   */
  pdvSinLocalidad: number
  /**
   * Provincias de la muestra, vía
   * comercios → localidades → departamentos → provincias.
   *
   * Lleva el nombre además del conteo porque "1 provincia" no informa nada:
   * cuando hay una sola, la cabecera muestra cómo se llama.
   */
  provincias: { cantidad: number; unica: string | null }
  /**
   * Distribución por tipo de negocio, de mayor a menor. `tipo: null` es una
   * categoría más —los comercios sin clasificar no se esconden— y la suma de
   * los `n` da exactamente `pdvRelevados`.
   */
  tiposComercio: { tipo: string | null; n: number }[]
  /**
   * Gondoleros que efectivamente relevaron, no los inscriptos.
   *
   * Todo lo demás en la cabecera cuenta trabajo hecho; un contador de
   * inscriptos entre ellos sería el único que cuenta intención, y el lector
   * asume que todos los números hablan de lo mismo. Los inscriptos son gestión
   * de campaña y van en el bloque de ejecución de la distri, donde el contraste
   * "9 inscriptos, 3 relevaron" es justamente el dato útil.
   */
  gondolerosRelevaron: number
  /** Primera y última misión: cuándo se relevó. */
  ventana: { desde: string | null; hasta: string | null }
  counts: Record<string, number>
  totalFotos: number
  fotosAprobadas: number
  /**
   * Lo que el dashboard de cobertura necesita, crudo.
   *
   * Va crudo y no calculado porque `loadResultadosCampanaData` no recibe la
   * campaña —no sabe la modalidad ni `visitas_por_semana`—, y esos dos los
   * tienen las cuatro pantallas que montan ResultadosView. Calcular acá
   * obligaría a cambiar la firma y los cuatro llamadores para un dato que solo
   * usan las campañas de seguimiento.
   */
  cobertura: {
    misiones: VisitaMision[]
    nombresComercio: Map<string, string>
    aliasGondolero: Map<string, string>
  }
}

import type { VisitaMision } from './cobertura-seguimiento'

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
    .select('id, url, storage_path, estado, campo_id, bloque_id, distancia_metros, created_at, gondolero:profiles(nombre,alias), comercio:comercios(nombre,direccion)')
    .eq('campana_id', campanaId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (opts?.ordenarPorMision) {
    // Repositora: agrupa fotos de la misma misión
    fotosQuery = fotosQuery.order('mision_id', { ascending: false, nullsFirst: false })
  }
  // El filtro por estado es global: filtra todas las galerías a la vez.
  if (tab) fotosQuery = fotosQuery.eq('estado', tab)

  // La cuenta de participaciones (inscriptos) ya no se pide acá: la cabecera
  // muestra los gondoleros que relevaron. Los inscriptos vuelven cuando se haga
  // el bloque de ejecución de la distri, que es donde el contraste sirve.
  const [fotosData, fotosCuenta, bloquesData, misionesData] = await Promise.all([
    fotosQuery,
    admin.from('fotos').select('id, estado').eq('campana_id', campanaId),
    admin
      .from('bloques_foto')
      .select('id, orden, instruccion, bloque_campos(id, tipo, pregunta, opciones, orden)')
      .eq('campana_id', campanaId)
      .order('orden'),
    admin
      .from('misiones')
      .select('id, estado, comercio_id, gondolero_id, created_at, capturada_at, gondolero:profiles(alias)')
      .eq('campana_id', campanaId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const misiones = (misionesData.data ?? []) as any[]
  const allMisionIds = misiones.map(m => m.id as string)

  // ── 2. Contexto por misión: comercio, ciudad y provincia ────────────────────
  //
  // La provincia está a CUATRO niveles del comercio:
  //   comercios.localidad_id → localidades.departamento_id
  //                          → departamentos.provincia_id → provincias.nombre
  // `localidades` NO tiene `provincia_id`. El dump de
  // docs/schema-real-2026-09-pre-incidente.md dice que sí —con FK e índice—
  // pero ese archivo es anterior al DROP SCHEMA y a la reconstrucción, y la
  // base viva no la tiene. Verificado el 16/9/2026.
  //
  // Se resuelve en dos consultas y no en un embed de cuatro niveles: los embeds
  // anidados de PostgREST devuelven objeto o array según el caso y ya nos costó
  // guardas repartidas por todo el archivo. Cortando en localidades, cada
  // consulta anida como mucho dos, que es la profundidad que `uno()` ya maneja
  // en el resto del archivo.
  const comercioIds = [...new Set(misiones.map(m => m.comercio_id).filter(Boolean))] as string[]
  const comercioCtx = new Map<string, {
    nombre: string | null
    ciudad: string | null
    provincia: string | null
    tipo: string | null
  }>()
  if (comercioIds.length > 0) {
    const { data: comerciosData } = await admin
      .from('comercios')
      .select('id, nombre, tipo, localidad_id')
      .in('id', comercioIds)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const comercios = (comerciosData ?? []) as any[]
    const localidadIds = [...new Set(
      comercios.map(c => c.localidad_id).filter((v): v is number => v != null)
    )]

    // localidad → { ciudad, provincia }. Vacío si ningún comercio tiene localidad.
    const locCtx = new Map<number, { ciudad: string | null; provincia: string | null }>()
    if (localidadIds.length > 0) {
      const { data: locData } = await admin
        .from('localidades')
        .select('id, nombre, departamento:departamentos(provincia:provincias(nombre))')
        .in('id', localidadIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of ((locData ?? []) as any[])) {
        const depto = uno<{ provincia: unknown }>(l.departamento)
        const prov  = depto ? uno<{ nombre: string }>(depto.provincia) : undefined
        locCtx.set(l.id, { ciudad: l.nombre ?? null, provincia: prov?.nombre ?? null })
      }
    }

    for (const co of comercios) {
      const loc = co.localidad_id != null ? locCtx.get(co.localidad_id) : undefined
      comercioCtx.set(co.id, {
        nombre:    co.nombre ?? null,
        ciudad:    loc?.ciudad ?? null,
        provincia: loc?.provincia ?? null,
        tipo:      co.tipo ?? null,
      })
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

  // PDV relevados = con al menos una misión aprobada. En revisión = los que
  // todavía no tienen ninguna aprobada pero sí alguna pendiente.
  const pdvConAprobada = new Set(
    misiones.filter(m => m.estado === 'aprobada' && m.comercio_id).map(m => m.comercio_id as string)
  )
  const pdvConPendiente = new Set(
    misiones
      .filter(m => (m.estado === 'pendiente' || m.estado === 'en_revision') && m.comercio_id)
      .map(m => m.comercio_id as string)
  )
  const pdvRelevados  = pdvConAprobada.size
  const pdvEnRevision = [...pdvConPendiente].filter(id => !pdvConAprobada.has(id)).length

  const totalFotos     = Object.values(counts).reduce((a, b) => a + b, 0)
  const fotosAprobadas = counts['aprobada'] ?? 0

  // Gondoleros que relevaron, no los inscriptos.
  const gondolerosRelevaron = new Set(misiones.map(m => m.gondolero_id).filter(Boolean)).size

  // ── Descripción de la muestra ──────────────────────────────────────────────
  // Ciudades, provincias y tipos se derivan de `pdvConAprobada`, el MISMO set
  // que cuenta `pdvRelevados`. Antes las ciudades salían de todas las misiones,
  // y la query de misiones no filtra por estado: una campaña podía decir
  // "40 PDV relevados · 6 ciudades" donde la sexta venía de un comercio cuya
  // única misión estaba descartada. Dos números de la misma cabecera hablando de
  // universos distintos sin avisarlo. El título grande promete "lo validado", y
  // es lo único defendible ante una marca; el número de ciudades baja respecto
  // de antes porque antes estaba inflado.
  //
  // Un comercio sin localidad_id no suma ciudad ni provincia. La provincia
  // además puede perderse en dos saltos más (localidad→departamento→provincia),
  // así que los dos números son pisos, no exactos.
  const pdvRelevadosIds = [...pdvConAprobada]

  const ciudades = new Set(
    pdvRelevadosIds.map(id => comercioCtx.get(id)?.ciudad).filter(Boolean)
  ).size

  const provinciasSet = new Set(
    pdvRelevadosIds.map(id => comercioCtx.get(id)?.provincia).filter(Boolean) as string[]
  )
  // PDV relevados cuyo comercio no tiene localidad cargada. No se esconden: sin
  // esto, una campaña con 6 PDV y ninguna localidad no muestra geografía y se
  // lee como si no tuviera, en vez de como que falta cargarla. Y en una campaña
  // con cobertura parcial, "3 ciudades" calculado sobre 6 de 10 PDV parece un
  // dato completo. Mismo criterio que "sin clasificar" en tipo de negocio.
  const pdvSinLocalidad = pdvRelevadosIds.filter(id => !comercioCtx.get(id)?.ciudad).length

  const provincias = {
    cantidad: provinciasSet.size,
    // Con una sola provincia el nombre dice más que el número: "1 provincia" no
    // informa nada. Con varias, el nombre no entra y se cuenta.
    unica: provinciasSet.size === 1 ? [...provinciasSet][0] : null,
  }

  // Distribución por tipo de negocio: describe la muestra, no es una respuesta
  // del formulario. Los `null` entran como una categoría más y no se filtran:
  // una muestra donde un tercio no tiene tipo es un dato sobre la muestra.
  const tiposCount = new Map<string | null, number>()
  for (const id of pdvRelevadosIds) {
    const t = comercioCtx.get(id)?.tipo ?? null
    tiposCount.set(t, (tiposCount.get(t) ?? 0) + 1)
  }
  const tiposComercio = [...tiposCount.entries()]
    .map(([tipo, n]) => ({ tipo, n }))
    .sort((a, b) => b.n - a.n)

  // Ventana temporal: primera y última misión.
  const fechas = misiones.map(m => m.created_at as string).filter(Boolean).sort()
  const ventana = { desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null }

  return {
    camposMap,
    modulos: modulosOrdenados,
    tieneCamposFoto,
    fotoRespuestasMap,
    misionesAprobadas,
    misionesTotales,
    pdvRelevados,
    pdvEnRevision,
    ciudades,
    pdvSinLocalidad,
    provincias,
    tiposComercio,
    gondolerosRelevaron,
    ventana,
    counts,
    totalFotos,
    fotosAprobadas,
    cobertura: {
      misiones: misiones.map(m => ({
        comercio_id:  m.comercio_id ?? null,
        gondolero_id: m.gondolero_id ?? null,
        estado:       m.estado ?? null,
        capturada_at: m.capturada_at ?? null,
        created_at:   m.created_at ?? null,
      })),
      nombresComercio: new Map(
        [...comercioCtx.entries()]
          .filter(([, v]) => v.nombre)
          .map(([id, v]) => [id, v.nombre as string]),
      ),
      aliasGondolero: new Map(
        misiones
          .map(m => [m.gondolero_id as string, uno<{ alias: string | null }>(m.gondolero)?.alias])
          .filter((p): p is [string, string] => !!p[0] && !!p[1]),
      ),
    },
  }
}
