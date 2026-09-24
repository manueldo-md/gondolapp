/**
 * lib/visitas-comercio.ts — traer las visitas de UN comercio, acotadas al alcance.
 *
 * El armado de la línea vive en `lib/linea-comercio.ts`, que es puro. Acá está
 * lo que toca la base: la consulta y —sobre todo— **el permiso**.
 *
 * ── POR QUÉ LA CONSULTA NO VIVE EN LA PÁGINA ────────────────────────────────
 * Es la lección de `fotosCandidatas`. Mientras la consulta estuvo adentro de una
 * server action no había forma de probarla sin replicarla, y **un control que
 * replica lo que dice verificar se queda verde el día que los dos se separan**.
 * Acá la llaman las dos: la pantalla, con el permiso ya resuelto, y
 * `scripts/probar-visitas-comercio.mts`, con service role y datos reales.
 *
 * ── LA LISTA ES EL PERMISO, Y ACÁ HAY UN SEGUNDO FILO ───────────────────────
 * En el mapa el alcance protege las fotos y nada más: el punto ya estaba en la
 * pantalla. Acá la URL lleva un `comercio_id`, así que hay **dos** cosas que
 * proteger, y la segunda es la que se olvida:
 *
 *   1. LAS VISITAS — se acotan con `campanaIds`, que ya viene de
 *      `idsDe(campanas, campanaId)`. Un arreglo vacío no consulta nada.
 *   2. EL COMERCIO EN SÍ — que el actor pueda mirarlo. La pantalla que ya
 *      existe, `/distribuidora/comercios/[id]`, lee `comercios` por id con
 *      service role y **sin un solo filtro**: cualquiera con el id ve cualquier
 *      comercio del padrón. Para el padrón eso está sin definir desde el
 *      15/9/2026; para una pantalla de EVIDENCIA no puede quedar así.
 *
 * Y no es teórico: **35 comercios en dev y 21 en producción aparecen en campañas
 * de más de un alcance**. El mismo local tiene evidencia de Georgalos y de
 * Suprante. Sin el punto 1, entrar con el alcance de una mostraría las fotos de
 * la otra, que es la violación más directa del Walled Garden que puede haber.
 */
import type {
  FilaMisionLinea, FilaFotoLinea, FilaRespuestaLinea,
} from './linea-comercio'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * PostgREST devuelve un embed como objeto o como arreglo según la cardinalidad
 * que infiera, y leerlo de una sola manera rompe en la otra. Es la misma trampa
 * que en `opcionesDeDistri` y en `instanteDeFoto`; se normaliza en un solo
 * lugar y no en cada lectura.
 */
function uno<T>(embed: unknown): T | null {
  if (!embed) return null
  return (Array.isArray(embed) ? embed[0] ?? null : embed) as T | null
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EL PERMISO
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que la cabecera necesita. Sale del alcance, no de `comercios` a secas. */
export type CabeceraComercio = {
  comercioId: string
  nombre: string | null
  tipo: string | null
  localidad: string | null
  /**
   * Falta en **58 de 104** comercios en dev y 57 de 97 en producción. Cuando es
   * `null` la pantalla no escribe nada: ni un guión ni un "sin dirección". El
   * nombre y la ciudad alcanzan para saber cuál es, y un renglón que anuncia que
   * falta un dato es ruido en una pantalla que se mira por las fotos.
   */
  direccion: string | null
  lat: number | null
  lng: number | null
}

/**
 * La cabecera del comercio **si el actor puede verlo**, o `null`.
 *
 * ── SE PREGUNTA CONTRA `panel_pdv`, NO CONTRA `comercios` ───────────────────
 * `panel_pdv(_campanas)` ya es la definición de "los PDV de este alcance": es la
 * que dibuja el mapa. Preguntarle a ella en vez de escribir acá un `EXISTS`
 * sobre `misiones` tiene una razón concreta, y es la de siempre en este
 * proyecto: **dos definiciones de lo mismo se separan**. El día que el mapa
 * muestre un punto, esta pantalla tiene que dejar entrar; y el día que no, no.
 *
 * De paso resuelve el nombre, el tipo y la localidad sin una consulta más. Lo
 * único que no trae es `direccion`, y por eso hay una segunda consulta —que
 * corre **solo si ya pasó el permiso**.
 *
 * Ante un error devuelve `null`, o sea que falla CERRADO. Una pantalla vacía es
 * incómoda; una que muestra la evidencia de otra marca porque la consulta falló
 * es otra cosa.
 */
export async function cabeceraSiPertenece(
  comercioId: string,
  campanaIds: string[],
  admin: Admin,
): Promise<CabeceraComercio | null> {
  // ── OJO: ESTE GUARD ES REDUNDANTE HOY, Y EL TEST NO LO PRUEBA ─────────────
  // Verificado sacándolo a propósito el 24/9/2026: `probar-visitas-comercio`
  // siguió en verde. Con el arreglo vacío, `panel_pdv` evalúa
  // `c.id = ANY('{}')` y devuelve cero filas, así que la base ya falla cerrada
  // sola. Se deja porque dice la intención y ahorra el viaje, pero **del verde
  // de ese control no se puede concluir que el scope vacío esté protegido acá**:
  // lo está por el SQL. Mismo caso que el filtro por `motivo` de
  // `probar-postulable.ts`.
  if (!comercioId || campanaIds.length === 0) return null

  const { data, error } = await admin.rpc('panel_pdv', { _campanas: campanaIds })
  if (error) {
    console.error('[visitas-comercio] panel_pdv:', error.message)
    return null
  }

  type FilaPdv = {
    comercio_id: string
    comercio_nombre: string | null
    comercio_tipo: string | null
    localidad_nombre: string | null
    lat: number | null
    lng: number | null
  }
  const pdv = ((data ?? []) as FilaPdv[]).find(f => f.comercio_id === comercioId)
  if (!pdv) return null

  const { data: extra, error: errDir } = await admin
    .from('comercios').select('direccion').eq('id', comercioId).maybeSingle()
  // La dirección es cosmética: si no se pudo leer, la cabecera sale sin ella en
  // vez de negar el acceso a un comercio que ya se verificó que es suyo.
  if (errDir) console.error('[visitas-comercio] dirección:', errDir.message)

  return {
    comercioId: pdv.comercio_id,
    nombre: pdv.comercio_nombre,
    tipo: pdv.comercio_tipo,
    localidad: pdv.localidad_nombre,
    direccion: (extra?.direccion as string | null) ?? null,
    lat: pdv.lat,
    lng: pdv.lng,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LAS FILAS
// ─────────────────────────────────────────────────────────────────────────────

export type FilasDeLaLinea = {
  misiones: FilaMisionLinea[]
  fotos: FilaFotoLinea[]
  respuestas: FilaRespuestaLinea[]
}

const VACIO: FilasDeLaLinea = { misiones: [], fotos: [], respuestas: [] }

/**
 * Las visitas de un comercio dentro de un alcance, con sus fotos y respuestas.
 *
 * `campanaIds` ya viene resuelto por `idsDe(campanas, campanaId)`:
 *
 *   · con una campaña elegida → esa sola;
 *   · sin campaña elegida → todas las del alcance, y **la línea mezcla campañas
 *     a propósito**. Prohibirlo dejaría huecos en algo que promete ser completo
 *     —el gondolero estuvo ahí y sacó esa foto— y además la mezcla es un dato:
 *     una auditoría de precios en el medio de una reposición explica por qué esa
 *     semana la foto se ve distinta. Por eso cada visita lleva el nombre de su
 *     campaña, como la etiqueta de fuente del desglose del panel;
 *   · vacío → no se consulta nada. El scope falla cerrado.
 *
 * ── LAS FOTOS SE PIDEN POR MISIÓN, NO POR CAMPAÑA ───────────────────────────
 * `.in('mision_id', …)` sobre misiones que ya están acotadas es más fuerte que
 * repetir el filtro de campaña: no hay forma de que se cuele una foto de un
 * alcance ajeno, porque no hay forma de que se cuele una misión.
 *
 * ── Y NO SE FILTRA POR `estado` ─────────────────────────────────────────────
 * A diferencia de `fotosCandidatas`, que trae solo aprobadas. Acá hacen falta
 * también las pendientes: la foto no es evidencia todavía, **pero la visita se
 * hizo** y tiene que aparecer en la línea diciendo que está en revisión. Quién
 * es evidencia y quién no lo decide `armarLinea`.
 */
export async function filasDeLaLinea(
  comercioId: string,
  campanaIds: string[],
  admin: Admin,
): Promise<FilasDeLaLinea> {
  // Redundante igual que el de `cabeceraSiPertenece`: `.in('campana_id', [])`
  // no devuelve filas. Ver la nota de allá.
  if (!comercioId || campanaIds.length === 0) return VACIO

  const { data: crudas, error } = await admin
    .from('misiones')
    .select('id, estado, capturada_at, created_at, campana_id, ' +
            'campanas(nombre), profiles(nombre, alias)')
    .eq('comercio_id', comercioId)
    .in('campana_id', campanaIds)

  if (error) {
    console.error('[visitas-comercio] misiones:', error.message)
    return VACIO
  }

  type Cruda = {
    id: string
    estado: string | null
    capturada_at: string | null
    created_at: string | null
    campana_id: string | null
    campanas: unknown
    profiles: unknown
  }

  const misiones: FilaMisionLinea[] = ((crudas ?? []) as Cruda[]).map(m => {
    const campana = uno<{ nombre: string | null }>(m.campanas)
    const gondolero = uno<{ nombre: string | null; alias: string | null }>(m.profiles)
    return {
      id: m.id,
      estado: m.estado,
      capturada_at: m.capturada_at,
      created_at: m.created_at,
      campana_id: m.campana_id,
      campana_nombre: campana?.nombre ?? null,
      gondolero_nombre: gondolero?.nombre ?? null,
      gondolero_alias: gondolero?.alias ?? null,
    }
  })

  const misionIds = misiones.map(m => m.id)
  if (misionIds.length === 0) return { misiones, fotos: [], respuestas: [] }

  const [fotosRes, respRes] = await Promise.all([
    admin.from('fotos')
      .select('id, mision_id, estado, storage_path, url, created_at')
      .in('mision_id', misionIds)
      // La foto rechazada que el gondolero ya rehízo queda marcada con
      // `reemplazada_por`. Traerla haría que la visita dijera "1 rechazada"
      // sobre un rechazo que ya se resolvió — un aviso sobre algo que no está
      // pasando es de la misma familia que el tilde verde de las alertas.
      .is('reemplazada_por', null),
    // ── LA PREGUNTA SE RESUELVE EN DOS PASOS, NO CON UN EMBED ──────────────
    // `mision_respuestas.campo_id` **no tiene foreign key** a `bloque_campos`:
    // las únicas tres FK de la tabla son a `misiones`, a `fotos` y a sí misma
    // (verificado contra dev el 24/9/2026). Sin FK, PostgREST no infiere la
    // relación y `bloque_campos(pregunta)` falla con "Could not find a
    // relationship" — devolviendo la consulta ENTERA en error, no la fila sin
    // la columna. Es el mismo modo de falla que el DROP de `profiles.nivel`.
    //
    // Por eso `lib/resultados.ts` también las resuelve aparte. No es una
    // preferencia de estilo: es lo único que se puede hacer con este schema.
    admin.from('mision_respuestas')
      .select('mision_id, campo_id, valor')
      .in('mision_id', misionIds)
      // Misma versión vigente que en `lib/resultados.ts`: la recaptura versiona
      // las respuestas, y sin esto cada pregunta rehecha aparecería dos veces.
      .is('reemplazada_por', null),
  ])

  if (fotosRes.error) console.error('[visitas-comercio] fotos:', fotosRes.error.message)
  if (respRes.error)  console.error('[visitas-comercio] respuestas:', respRes.error.message)

  type CrudaResp = { mision_id: string | null; campo_id: string | null; valor: unknown }
  const crudasResp = (respRes.data ?? []) as CrudaResp[]

  // El segundo paso: las etiquetas de los campos que efectivamente aparecieron.
  type Campo = { id: string; pregunta: string | null; tipo: string | null; orden: number | null }
  const porCampo = new Map<string, Campo>()
  const campoIds = [...new Set(crudasResp.map(r => r.campo_id).filter(Boolean))] as string[]

  if (campoIds.length > 0) {
    const { data: campos, error: errCampos } = await admin
      .from('bloque_campos').select('id, pregunta, tipo, orden').in('id', campoIds)
    if (errCampos) console.error('[visitas-comercio] campos:', errCampos.message)
    for (const campo of (campos ?? []) as Campo[]) porCampo.set(campo.id, campo)
  }

  const respuestas: FilaRespuestaLinea[] = crudasResp
    .map(r => {
      const campo = r.campo_id ? porCampo.get(r.campo_id) : undefined
      return {
        mision_id: r.mision_id,
        pregunta: campo?.pregunta ?? null,
        tipo: campo?.tipo ?? null,
        valor: r.valor,
        _orden: campo?.orden ?? 0,
      }
    })
    // Por el orden del formulario: es como el gondolero las contestó y como el
    // que las lee espera encontrarlas. Va acá y no con un `.order()` porque el
    // campo por el que se ordena vive en la otra consulta.
    .sort((a, b) => (a._orden ?? 0) - (b._orden ?? 0))
    .map(({ _orden, ...r }) => { void _orden; return r })

  return {
    misiones,
    fotos: (fotosRes.data ?? []) as FilaFotoLinea[],
    respuestas,
  }
}
