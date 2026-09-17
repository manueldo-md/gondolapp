/**
 * lib/nivel.ts
 * Qué es un nivel y cómo se ordenan. Sin dependencias: lo importan tanto
 * componentes de servidor como de cliente.
 *
 * Los otros dos archivos de la familia:
 *   · lib/nivel-mensual.ts — el nivel que se MUESTRA (misiones del mes en curso)
 *   · lib/nivel-maximo.ts  — el nivel que habilita los GATES (el mejor mes de
 *                            toda su historia)
 *
 * ── LO QUE VIVÍA ACÁ ────────────────────────────────────────────────────────
 * `calcularNuevoNivel` se borró el 17/9/2026 junto con `profiles.nivel`. Leía
 * `profiles.fotos_aprobadas`, que nunca se incrementó en ningún ambiente porque
 * la RPC `incrementar_fotos_aprobadas` no existe en la base. O sea que las cinco
 * llamadas que tenía —las tres pantallas de aprobación de fotos— comparaban el
 * nivel guardado contra un contador clavado en cero y nunca subían a nadie.
 *
 * `calcularNivelMensual` también vivía acá y se fue antes, el mismo día: contaba
 * FOTOS del mes, y eso dejaba a las campañas de solo preguntas fuera de la
 * progresión. Su reemplazo es `nivelPorMisiones` en lib/nivel-mensual.ts.
 */

import type { NivelGondolero } from '@/types'

/**
 * El orden de los niveles. Estaba copiado en tres archivos —los dos gates de
 * pantalla y la action de unirse— y las tres copias decían lo mismo, que es
 * exactamente cuando conviene que haya una sola.
 */
export const NIVEL_ORDEN: Record<string, number> = { casual: 0, activo: 1, pro: 2 }

export const NIVEL_LABEL: Record<string, string> = {
  casual: 'Casual',
  activo: 'Activo',
  pro:    'Pro',
}

/**
 * ¿El nivel alcanzado pasa el mínimo que pide la campaña?
 *
 * Dos ausencias que NO significan lo mismo:
 *
 *   · `nivelMinimo` nulo o desconocido → vale como `casual`. Una campaña sin
 *     requisito no se le cierra a nadie por un dato faltante.
 *   · `nivelAlcanzado` **`null`** → **pasa**. `null` no es "casual": es "no se
 *     pudo medir" (ver lib/nivel-maximo.ts). Decirle "requiere nivel Pro" a un
 *     gondolero que ES Pro porque Supabase devolvió un 500 es el rechazo tardío
 *     de siempre disfrazado de regla de negocio, y del lado del gondolero no
 *     tiene arreglo. Las pantallas informan; el control real es la action, que
 *     vuelve a medir y ahí sí distingue el `null`.
 */
export function cumpleNivelMinimo(
  nivelAlcanzado: NivelGondolero | string | null | undefined,
  nivelMinimo: string | null | undefined,
): boolean {
  if (nivelAlcanzado === null || nivelAlcanzado === undefined) return true
  return (NIVEL_ORDEN[nivelAlcanzado] ?? 0) >= (NIVEL_ORDEN[nivelMinimo ?? 'casual'] ?? 0)
}
