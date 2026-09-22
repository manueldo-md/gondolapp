/**
 * lib/nivel-maximo.ts
 * El nivel MÁXIMO que el gondolero alcanzó alguna vez. Es el que abre los gates.
 *
 * ── POR QUÉ EL MÁXIMO Y NO EL DEL MES ───────────────────────────────────────
 * El nivel que se MUESTRA es el del mes en curso (lib/nivel-mensual.ts): mide
 * actividad reciente y por eso baja cuando el gondolero afloja. Los GATES no
 * pueden usar ese número: **el privilegio ganado no se pierde**. Un Pro de marzo
 * que no trabaja en abril no puede quedarse sin acceso a las campañas Pro ni sin
 * poder canjear una transferencia con los puntos que ya ganó. Si algún día se
 * quiere penalizar la inactividad va a ser con una regla explícita, no como
 * efecto lateral de cómo se calcula el nivel.
 *
 * Los cuatro gates que lo usan:
 *   1. gondolero/campanas/page.tsx          (el chip "Requiere nivel X")
 *   2. gondolero/campanas/[id]/page.tsx     (idem, en el detalle)
 *   3. gondolero/campanas/[id]/actions.ts   ← el control real, el de unirse
 *   4. gondolero/perfil/actions.ts          (canje de transferencia, solo Pro)
 *
 * Hasta el 17/9/2026 los cuatro leían `profiles.nivel`, una columna que ningún
 * camino de la app escribía: lo que había adentro lo puso el seed. En prod eso
 * significaba 8 gondoleros con acceso de nivel Activo sin haber hecho nunca una
 * misión.
 *
 * ── POR QUÉ SE DERIVA Y NO SE GUARDA ────────────────────────────────────────
 * Mismo criterio que el nivel del mes, `lib/campana-avance.ts` y
 * `lib/campana-vigencia.ts`: se cuenta al leer. Y acá la propiedad importa más
 * que en los otros, porque el máximo también tiene que poder BAJAR — si una
 * misión se descarta o se anula, el mes deja de contarla. Una columna guardada
 * se habría quedado con el número viejo.
 *
 * ── COSTO ───────────────────────────────────────────────────────────────────
 * Una query por gondolero que devuelve sus misiones aprobadas de toda la vida.
 * Medido el 17/9/2026: prod tiene 137 misiones aprobadas EN TOTAL entre 29
 * gondoleros, y el mejor mes de cualquiera es 12. O sea ~10 filas por llamada.
 * El índice `misiones (gondolero_id, campana_id, estado)` cubre la igualdad por
 * gondolero. En los dos gates de pantalla entra en el `Promise.all` que ya está,
 * así que no agrega un round trip; en los dos de action reemplaza al
 * `select('nivel')` que había.
 *
 * **La señal para revisarlo**: lo que vuelve es la vida entera del gondolero, y
 * crece para siempre. Si el volumen sube mucho —un Pro sostenido a 100 misiones
 * por mes son 2.400 filas en dos años— la salida es cachear por request con
 * `cache()` de React, o materializar la agregación en una vista `niveles_por_mes`
 * leída por PostgREST. Una vista sigue siendo derivada: no guarda estado. Hoy no
 * hace falta ninguna de las dos, y adelantarse sería inventar el problema.
 */

import type { NivelGondolero } from '@/types'
import { nivelPorMisiones } from './nivel-mensual'
import { diaAR } from './fecha-ar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Clave de mes en la MISMA zona horaria que `inicioDelMes`, para que el mes en
 * curso cuente igual en las dos familias.
 *
 * Eso lo decía este comentario desde que se escribió, y desde el 22/9/2026 es
 * cierto: `inicioDelMes` pasó a hora argentina y esto usaba
 * `getFullYear/getMonth`, o sea la del proceso. Con las dos en UTC coincidían
 * por casualidad; con una sola cambiada habrían divergido tres horas por mes, y
 * un gondolero podría haber visto un nivel del mes que su propio máximo no
 * alcanza — que es justo lo que el comentario venía a evitar.
 */
export function claveMes(fecha: string | Date): string {
  return diaAR(fecha).slice(0, 7)
}

/**
 * Misiones aprobadas por mes, de toda la historia del gondolero.
 *
 * `created_at` es cuándo se creó la misión, no cuándo se aprobó: el mes es el
 * del TRABAJO, no el de la revisión. Es la misma semántica que
 * `contarMisionesAprobadasDelMes`, y tiene que seguir siéndolo — si divergieran,
 * un gondolero podría ver un nivel del mes que su propio máximo no alcanza.
 *
 * Devuelve `null` si la consulta falló. No es lo mismo que "cero meses": ver
 * `nivelMaximoAlcanzado`.
 */
export async function misionesAprobadasPorMes(
  gondoleroId: string,
  admin: Admin,
): Promise<Map<string, number> | null> {
  const porMes = new Map<string, number>()
  try {
    // Paginado: PostgREST corta en 1000 filas y un gondolero veterano puede
    // tener más. Hoy son ~10, pero el corte silencioso sería una medida mal
    // hecha, no un error visible.
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await admin
        .from('misiones')
        .select('created_at')
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'aprobada')
        .range(desde, desde + 999)

      if (error) {
        console.error('[nivel-maximo] error contando misiones:', error.message)
        return null
      }
      const filas = (data ?? []) as { created_at: string }[]
      for (const m of filas) {
        const k = claveMes(m.created_at)
        porMes.set(k, (porMes.get(k) ?? 0) + 1)
      }
      if (filas.length < 1000) break
    }
  } catch (err) {
    console.error('[nivel-maximo] error inesperado:', err)
    return null
  }
  return porMes
}

/** El mes con más misiones aprobadas. `null` si no se pudo medir. */
export async function mejorMesDeMisiones(
  gondoleroId: string,
  admin: Admin,
): Promise<number | null> {
  const porMes = await misionesAprobadasPorMes(gondoleroId, admin)
  if (porMes === null) return null
  let mejor = 0
  for (const n of porMes.values()) if (n > mejor) mejor = n
  return mejor
}

/**
 * El nivel máximo alcanzado, o `null` si la consulta falló.
 *
 * **El `null` importa y no hay que aplastarlo a `'casual'`.** Un gondolero que
 * ganó el nivel Pro y se topa con un 500 de Supabase no puede recibir "esta
 * campaña requiere nivel Pro": sería el rechazo tardío de siempre, esta vez
 * disfrazado de regla de negocio. Cada llamador decide:
 *
 *   · Las actions (unirse, canje) devuelven un error de infraestructura, que
 *     dice "probá de nuevo" en vez de acusarlo de no tener el nivel.
 *   · Las pantallas no bloquean: informan, y el control real está en la action,
 *     que vuelve a medir. Una pantalla que bloquea con un número que no pudo
 *     leer miente en la dirección que no tiene arreglo para el gondolero.
 *
 * `umbrales` es opcional para que el llamador que ya tiene la config no la
 * vuelva a pedir; sin él se leen de `configuracion` (hoy activo=50, pro=100).
 */
export async function nivelMaximoAlcanzado(
  gondoleroId: string,
  admin: Admin,
  umbrales: { activo: number; pro: number },
): Promise<NivelGondolero | null> {
  return nivelDeMejorMes(await mejorMesDeMisiones(gondoleroId, admin), umbrales)
}

/**
 * La mitad sincrónica de `nivelMaximoAlcanzado`, para el llamador que ya tiene
 * el número. Las dos pantallas la usan porque piden el mejor mes y la config
 * dentro del `Promise.all` que ya tenían: así el nivel no cuesta un round trip
 * extra, y la regla sigue estando en un solo lugar.
 */
export function nivelDeMejorMes(
  mejorMes: number | null,
  umbrales: { activo: number; pro: number },
): NivelGondolero | null {
  if (mejorMes === null) return null
  return nivelPorMisiones(mejorMes, umbrales.activo, umbrales.pro)
}
