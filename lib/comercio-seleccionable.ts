/**
 * lib/comercio-seleccionable.ts
 * Por qué un comercio no se puede elegir en el paso de selección de la captura.
 *
 * EXISTE PARA QUE NO QUEDE UN CAMINO SIN CUBRIR. La lista de comercios se dibuja
 * DOS veces en captura/page.tsx —la de cercanos por GPS y la de búsqueda por
 * texto— y las dos repetían a mano la condición y el cartel. Ya nos pasó con el
 * chip de distancia, que apareció en cuatro paneles y faltaba en el quinto.
 * Acá la regla está una vez y las dos listas la consultan.
 *
 * Las dos razones son distintas en naturaleza y por eso el texto también:
 *
 *   · YA RELEVADO — otro gondolero (o él mismo) tiene una misión viva ahí, en
 *     una campaña puntual. El comercio está tomado. No hay nada que hacer.
 *   · CUPO PROPIO — llegó a su máximo de comercios DISTINTOS. No es que el
 *     comercio esté tomado: es que no puede sumar uno nuevo. Los que ya tiene
 *     siguen disponibles, y el texto lo dice para que no crea que terminó.
 *
 * Ninguna de las dos es un error del gondolero, así que las dos se muestran en
 * gris, no en rojo.
 */

export type MotivoBloqueo = 'ya_relevado' | 'cupo_propio'

export interface ContextoSeleccion {
  /** Comercios con misión viva de cualquiera. Vacío en campañas de seguimiento. */
  relevadosPorOtros: Set<string>
  /**
   * Comercios que este gondolero ya tomó — incluyendo los que están en la cola
   * offline sin sincronizar. Nunca se bloquean.
   */
  misComercios: Set<string>
  /** `max_comercios_por_gondolero`. null = sin tope. */
  maxComercios: number | null
}

/** `null` = se puede elegir. */
export function motivoBloqueo(
  comercioId: string,
  ctx: ContextoSeleccion,
): MotivoBloqueo | null {
  // Un comercio propio NUNCA se bloquea por cupo: volver a él es exactamente lo
  // que una campaña de seguimiento le pide hacer, y es lo que el gate del
  // servidor ya permite (`esComercioNuevo`).
  const esPropio = ctx.misComercios.has(comercioId)

  if (!esPropio && ctx.relevadosPorOtros.has(comercioId)) return 'ya_relevado'
  if (!esPropio && cupoPropioLleno(ctx)) return 'cupo_propio'
  return null
}

/**
 * `true` cuando el gondolero llegó a su máximo de comercios distintos.
 *
 * Cuenta `misComercios`, que YA incluye los de la cola offline. Sin eso, alguien
 * sin señal toma comercios de más y se los rechazan al sincronizar — el castigo
 * tardío que venimos sacando del sistema.
 */
export function cupoPropioLleno(ctx: ContextoSeleccion): boolean {
  return ctx.maxComercios != null && ctx.misComercios.size >= ctx.maxComercios
}

export const TEXTO_BLOQUEO: Record<MotivoBloqueo, string> = {
  ya_relevado: 'Ya relevado en esta campaña',
  cupo_propio: 'Alcanzaste tu máximo de comercios. Podés seguir trabajando en los que ya tomaste.',
}
