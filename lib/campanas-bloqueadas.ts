/**
 * lib/campanas-bloqueadas.ts — las campañas que el gondolero NO puede tomar,
 * agrupadas por con quién tiene que vincularse.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * Hasta el 25/9/2026 una campaña sin acceso simplemente **no aparecía**: ni
 * tarjeta, ni contador, ni mensaje. Un gondolero recién registrado veía 1 de 6
 * en producción y nada le decía que las otras 5 existían, así que la única
 * explicación a mano era la equivocada — el cartel de zonas, que culpa a la
 * geografía de algo que no depende de la geografía.
 *
 * `accesoACampana` ya devuelve el motivo exacto y su texto. Lo único que
 * faltaba era mostrarlo.
 *
 * ── POR QUÉ AGRUPADAS Y NO UNA TARJETA POR CAMPAÑA ──────────────────────────
 * Porque la unidad accionable NO es la campaña: es **el ejecutor**. El texto de
 * las once campañas de Biomega es el mismo texto once veces, y lo que el
 * gondolero puede hacer con esa información es una sola cosa, no once.
 *
 * Medido el 25/9/2026, para alguien sin ningún vínculo:
 *
 *   base    campañas bloqueadas    grupos
 *   dev              16              4      (Biomega sola son 11)
 *   prod              4              3
 *
 * Y lo que decide es cómo crece cada número: **las campañas crecen con el
 * negocio y los grupos no.** Si mañana Biomega publica cincuenta, la lista por
 * campaña pasa a 50 filas ilegibles y la agrupada sigue diciendo una línea con
 * otro número adentro. Un tope sobre las campañas habría escondido información
 * sin ordenarla; agrupar la ordena y no esconde nada.
 *
 * ── Y UN TOPE IGUAL, PERO SOBRE LOS GRUPOS ──────────────────────────────────
 * Los grupos tampoco son infinitos, pero pueden crecer: no con las campañas,
 * con las distribuidoras que operan en su zona. `TOPE_GRUPOS` corta en los más
 * grandes y dice cuántos quedaron afuera. Hoy no muerde en ninguna de las dos
 * bases — es para que el día que muerda no sea un scroll.
 *
 * ── QUÉ MOTIVOS SE MUESTRAN, Y CUÁLES NO ────────────────────────────────────
 * Solo los tres `sin_vinculo_*`. Los otros dos se excluyen a propósito:
 *
 *   `actor_distinto`            no llega nunca: la query de la pantalla ya
 *                               filtra por `actor_campana`.
 *   `campana_sin_financiador`   es un problema de DATOS de la campaña, no de
 *                               él. Su mensaje es neutro a propósito ("no está
 *                               disponible por ahora") y mostrarlo es una fila
 *                               que no explica nada y con la que no puede hacer
 *                               nada. El que se tiene que enterar es quien la
 *                               creó, y para eso `accesoACampana` ya loguea.
 *
 * Como consecuencia, **todo grupo tiene nombre**: los tres motivos que quedan
 * nombran a una distribuidora, una repositora o una marca.
 *
 * Este archivo no importa nada de Next: la decisión entera se prueba sin
 * request. Ver `scripts/probar-campanas-bloqueadas.ts`.
 */
import {
  accesoACampana,
  type CampanaAcceso,
  type ContextoAcceso,
  type MotivoSinAcceso,
} from './acceso-campana'

/** Lo que hace falta además de lo que ya pide `accesoACampana`: los nombres. */
export interface CampanaBloqueable extends CampanaAcceso {
  id: string
  nombre: string
  marca: { razon_social: string } | null
  distri: { razon_social: string } | null
  /**
   * NO viene en `CampanaCardData` y sí en la query. Se declara acá porque sin
   * el nombre el grupo de una campaña ejecutada por una repositora sería una
   * fila muda. Hoy no hay ninguna campaña de gondolero con `repositora_id` en
   * ninguna de las dos bases, así que esto es la red y no el caso.
   */
  repositora?: { razon_social: string } | null
}

export type TipoBloqueador = 'distribuidora' | 'repositora' | 'marca'

export interface GrupoBloqueado {
  /** `motivo:idDelBloqueador`. Es también la key de React. */
  clave: string
  motivo: MotivoSinAcceso
  /** El texto de `accesoACampana`, tal cual. No se reescribe acá. */
  mensaje: string
  tipo: TipoBloqueador
  nombre: string
  campanas: number
}

export interface Bloqueadas {
  /** Ordenados de más campañas a menos, y ya recortados por el tope. */
  grupos: GrupoBloqueado[]
  /** Grupos que el tope dejó afuera. */
  gruposOcultos: number
  /** Campañas dentro de esos grupos. */
  campanasOcultas: number
  /** Todas las bloqueadas mostrables, antes del tope. */
  total: number
}

export const TOPE_GRUPOS = 4

const VACIO: Bloqueadas = { grupos: [], gruposOcultos: 0, campanasOcultas: 0, total: 0 }

/** Quién bloquea, según el motivo. `null` = el motivo no se muestra. */
function bloqueador(
  motivo: MotivoSinAcceso,
  c: CampanaBloqueable,
): { tipo: TipoBloqueador; id: string; nombre: string } | null {
  switch (motivo) {
    case 'sin_vinculo_distri':
      return c.distri_id
        ? { tipo: 'distribuidora', id: c.distri_id, nombre: c.distri?.razon_social ?? 'Una distribuidora' }
        : null
    case 'sin_vinculo_repo':
      return c.repositora_id
        ? { tipo: 'repositora', id: c.repositora_id, nombre: c.repositora?.razon_social ?? 'Una repositora' }
        : null
    case 'sin_vinculo_marca':
      return c.marca_id
        ? { tipo: 'marca', id: c.marca_id, nombre: c.marca?.razon_social ?? 'Una marca' }
        : null
    // `actor_distinto` y `campana_sin_financiador` no se muestran. Ver el
    // encabezado: uno no llega y el otro no es del gondolero.
    default:
      return null
  }
}

export function agruparBloqueadas(
  campanas: CampanaBloqueable[],
  ctx: ContextoAcceso,
  tope: number = TOPE_GRUPOS,
): Bloqueadas {
  if (campanas.length === 0) return VACIO

  const porClave = new Map<string, GrupoBloqueado>()

  for (const c of campanas) {
    const acceso = accesoACampana(c, ctx)
    if (acceso.ok) continue

    const quien = bloqueador(acceso.motivo, c)
    if (!quien) continue

    const clave = `${acceso.motivo}:${quien.id}`
    const previo = porClave.get(clave)
    if (previo) {
      previo.campanas++
    } else {
      porClave.set(clave, {
        clave,
        motivo: acceso.motivo,
        mensaje: acceso.mensaje,
        tipo: quien.tipo,
        nombre: quien.nombre,
        campanas: 1,
      })
    }
  }

  // De más campañas a menos, y por nombre a igualdad. El desempate por nombre
  // no es cosmético: sin él el orden depende del orden de llegada de las filas,
  // y la lista se reacomoda sola entre dos recargas sin que cambie nada.
  const todos = [...porClave.values()].sort(
    (a, b) => b.campanas - a.campanas || a.nombre.localeCompare(b.nombre, 'es'),
  )

  const total = todos.reduce((n, g) => n + g.campanas, 0)
  if (total === 0) return VACIO

  // Un tope de 0 o menos se trata como "sin tope": esconder todo y decir
  // "3 más" sería una lista vacía con una nota al pie.
  const corte = tope > 0 ? tope : todos.length
  const grupos = todos.slice(0, corte)
  const fuera = todos.slice(corte)

  return {
    grupos,
    gruposOcultos: fuera.length,
    campanasOcultas: fuera.reduce((n, g) => n + g.campanas, 0),
    total,
  }
}
