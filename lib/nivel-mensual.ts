/**
 * lib/nivel-mensual.ts
 * El nivel del gondolero según su actividad del mes en curso.
 *
 * ── POR QUÉ MISIONES Y NO FOTOS ─────────────────────────────────────────────
 * Hasta el 17/9/2026 el nivel salía de contar filas en `fotos`. Eso dejaba a las
 * campañas de solo preguntas fuera de la progresión: pagaban puntos pero no
 * sumaban nada al nivel. **Una misión cumplida es una misión cumplida**, y en una
 * campaña sin foto el gondolero suele cargar más datos, no menos.
 *
 * No era una decisión de producto: era un efecto de dónde había quedado el
 * gancho. El único incremento estaba en el camino de aprobación de FOTO.
 *
 * ── POR QUÉ SE DERIVA Y NO SE GUARDA ────────────────────────────────────────
 * `profiles.nivel` y `profiles.fotos_aprobadas` existen pero **el mecanismo que
 * las mantenía nunca funcionó**: la RPC `incrementar_fotos_aprobadas` que las
 * tres actions de aprobación llaman NO EXISTE en la base (verificado en dev el
 * 17/9/2026, `pg_proc` vacío). O sea que cada aprobación de foto viene
 * registrando un error en `rpcFotosError` y el contador nunca se movió. El nivel
 * guardado en dev es lo que escribió el seed a mano o el DEFAULT de la columna.
 *
 * Por eso acá no hay contador que mantener: se cuenta al leer. Es el mismo
 * criterio de `lib/campana-avance.ts` y `lib/campana-vigencia.ts` — derivado, no
 * guardado — y acá encima no hay nada que migrar, porque no había estado válido.
 *
 * ── LO QUE ESTE ARCHIVO NO DECIDE ───────────────────────────────────────────
 * Los GATES —acceso a campañas por `nivel_minimo` y el canje de transferencia—
 * siguen leyendo `profiles.nivel`. Pasan a usar el "máximo alcanzado" en un
 * tramo aparte, para que nadie pierda un privilegio ya ganado por dejar de
 * trabajar un mes. Ver CLAUDE.md.
 */

import type { NivelGondolero } from '@/types'
import { diaAR, medianocheAR } from '@/lib/fecha-ar'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Primer instante del mes en curso, EN HORA ARGENTINA.
 *
 * `new Date(ahora.getFullYear(), ahora.getMonth(), 1)` usaba la hora local del
 * proceso, que en Vercel es UTC: el "mes" arrancaba el 1° a las 00:00 UTC, o sea
 * a las 21:00 del último día del mes ANTERIOR. Tres horas del mes pasado
 * contaban para éste.
 *
 * Medido el 22/9/2026 antes de cambiarlo: 0 de 182 misiones en dev y 0 de 136 en
 * prod cambian de mes con este arreglo, y a nadie le cambia el "mejor mes" del
 * que salen los gates de nivel. Se arregla ahora justamente porque hoy no mueve
 * a nadie.
 */
export function inicioDelMes(ahora: Date = new Date()): Date {
  const [anio, mes] = diaAR(ahora).split('-')
  return medianocheAR(`${anio}-${mes}-01`)
}

/**
 * Misiones APROBADAS del mes en curso, por gondolero.
 *
 * Aprobadas y no "todas": el nivel mide trabajo validado, igual que el mínimo
 * para cobrar y que `pdvRelevados` en el dashboard. Una misión pendiente de
 * revisión todavía no aportó nada.
 *
 * Devuelve el mapa completo en una consulta porque las pantallas que lo usan
 * —el ranking, los paneles— necesitan el número de varios gondoleros a la vez.
 */
export async function contarMisionesAprobadasDelMes(
  admin: Admin,
  ahora: Date = new Date(),
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>()
  try {
    const { data, error } = await admin
      .from('misiones')
      .select('gondolero_id')
      .eq('estado', 'aprobada')
      .gte('created_at', inicioDelMes(ahora).toISOString())

    if (error) {
      console.error('[nivel-mensual] error contando misiones:', error.message)
      return conteo
    }
    for (const m of ((data ?? []) as { gondolero_id: string | null }[])) {
      if (!m.gondolero_id) continue
      conteo.set(m.gondolero_id, (conteo.get(m.gondolero_id) ?? 0) + 1)
    }
  } catch (err) {
    console.error('[nivel-mensual] error inesperado:', err)
  }
  return conteo
}

/**
 * El nivel a partir de las misiones del mes.
 *
 * Los umbrales no cambian respecto de cuando esto contaba fotos: en las campañas
 * con foto hay casi siempre una foto por misión, así que el número se mueve poco.
 * Si resultan fáciles de alcanzar, lo eran antes también — es otra discusión.
 */
export function nivelPorMisiones(
  misionesDelMes: number,
  umbralActivo: number,
  umbralPro: number,
): NivelGondolero {
  if (misionesDelMes >= umbralPro) return 'pro'
  if (misionesDelMes >= umbralActivo) return 'activo'
  return 'casual'
}

/** Cuántas misiones le faltan para el nivel siguiente. 0 = ya está en Pro. */
export function misionesParaSiguienteNivel(
  misionesDelMes: number,
  nivel: NivelGondolero,
  umbralActivo: number,
  umbralPro: number,
): number {
  if (nivel === 'casual') return Math.max(0, umbralActivo - misionesDelMes)
  if (nivel === 'activo') return Math.max(0, umbralPro - misionesDelMes)
  return 0
}
