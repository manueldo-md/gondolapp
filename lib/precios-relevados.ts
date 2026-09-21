/**
 * El precio que se le muestra al que revisa una foto.
 *
 * ── DE DÓNDE SALE AHORA ──────────────────────────────────────────────────────
 * De las respuestas a preguntas tipificadas con la métrica **Precio**, no de
 * `fotos.precio_confirmado`.
 *
 * La columna vieja se llenaba con un input que dependía de la casilla "Pedirle
 * precio al gondolero", y esa casilla nunca funcionó: escribía
 * `bloques_foto.solicitar_precio` y el input miraba
 * `bloque_campos.solicitar_precio` —dos columnas distintas con el mismo
 * nombre—. Medido el 21/9/2026: **0 fotos con `precio_confirmado` en dev y en
 * prod**, sobre 258 y 194. No se pierde nada al cambiar de fuente porque no
 * había nada.
 *
 * ── POR QUÉ AL LADO DE LA FOTO Y NO SOLO EN EL PANEL ─────────────────────────
 * El precio pegado a la imagen es lo que deja ver un 0 o un 7777 mientras se
 * mira la góndola. Es el contexto que convierte la revisión en una validación
 * de verdad, y es la mitad barata del pendiente de validación de rangos.
 *
 * ── TODAS, NO UNA ────────────────────────────────────────────────────────────
 * Una misión puede tener más de una pregunta tipificada como Precio —dos
 * productos, dos presentaciones— y quedarse con la primera sería inventar cuál
 * importa. Se muestran todas, con su pregunta al lado, que es lo único que las
 * distingue.
 */

export interface RespuestaTipificada {
  pregunta: string
  tipo: string
  valor: unknown
  /** `bloque_campos.metrica_id`. Ausente en las respuestas viejas del panel. */
  metricaId?: string | null
}

export interface PrecioRelevado {
  pregunta: string
  valor: number
}

/**
 * Convierte el `valor` jsonb a número, o `null` si no lo es.
 *
 * Los campos `numero` guardan un number nativo desde que se normalizó el seed
 * el 14/9/2026, pero antes de eso el seed escribía `String(n)`. Se acepta el
 * string numérico para no esconder datos viejos; lo que no se acepta es el
 * string vacío, que `Number('')` convertiría en 0 — un precio de cero es
 * exactamente el dato sospechoso que esto tiene que dejar ver, y no puede venir
 * de una respuesta en blanco.
 */
function comoNumero(valor: unknown): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null
  if (typeof valor === 'string' && valor.trim() !== '') {
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function preciosDeRespuestas(
  respuestas: RespuestaTipificada[] | undefined,
  metricaPrecioId: string | null,
): PrecioRelevado[] {
  if (!respuestas || !metricaPrecioId) return []
  const out: PrecioRelevado[] = []
  for (const r of respuestas) {
    if (r.metricaId !== metricaPrecioId) continue
    const n = comoNumero(r.valor)
    if (n === null) continue
    out.push({ pregunta: r.pregunta, valor: n })
  }
  return out
}

/**
 * El id de la métrica Precio en este ambiente.
 *
 * Se busca por SLUG, que es la constante que el código conoce; el uuid cambia
 * entre dev y prod. Devuelve `null` si el catálogo no la tiene —por ejemplo en
 * un ambiente donde la migración todavía no corrió— y con `null` no se muestra
 * ningún precio, que es lo correcto: mejor no mostrar nada que mostrar un
 * número sin saber de qué es.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function idMetricaPrecio(admin: any): Promise<string | null> {
  const { data } = await admin.from('metricas').select('id').eq('slug', 'precio').maybeSingle()
  return data?.id ?? null
}
