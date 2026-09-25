/**
 * lib/pertenencia.ts — "esta fila, ¿es tuya?", en un solo lugar.
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 * Es el patrón que las actions de REINICIO ya hacían bien, extraído:
 *
 *     const { data: rel } = await admin
 *       .from('marca_distri_relaciones').select('id, distri_id').eq('id', relacionId).single()
 *     if (!rel || rel.distri_id !== distriId)
 *       return { error: 'No tenés permiso para reiniciar esta relación.' }
 *
 * Leer la fila, comparar el dueño contra la sesión, cortar. Seis de las 47
 * actions relevadas el 25/9/2026 lo hacían así; las otras no lo hacían de
 * ninguna manera.
 *
 * ── POR QUÉ UN HELPER Y NO 23 COPIAS ────────────────────────────────────────
 * Se relevaron las tablas antes de decidirlo, y la forma **se repite**: las
 * seis tablas de vínculo tienen exactamente DOS columnas `*_id`, una por lado,
 * y el chequeo es siempre "la columna de mi lado vale lo que dice mi sesión".
 *
 *   gondolero_distri_solicitudes   gondolero_id  · distri_id
 *   fixer_distri_solicitudes       fixer_id      · distri_id
 *   fixer_repo_solicitudes         fixer_id      · repositora_id
 *   marca_distri_relaciones        marca_id      · distri_id
 *   marca_repo_relaciones          marca_id      · repositora_id
 *   distri_repo_relaciones         distri_id     · repositora_id
 *
 * Lo único que cambia es el NOMBRE de la columna. Eso es un parámetro, no una
 * rama.
 *
 * ── LO QUE EL HELPER NO DECIDE, Y NO DEBERÍA ────────────────────────────────
 * **Cuál de las dos columnas es "mi lado" lo dice el call site**, y tiene que
 * seguir siendo así: una relación marca↔distri la puede tocar cualquiera de
 * los dos, y quién es depende del panel desde el que se llama. Un helper que
 * lo adivinara —por el tipo de actor de la sesión, digamos— acertaría hoy y
 * elegiría mal el día que una repositora ejecute algo de una marca.
 *
 * O sea: **esto saca la plomería, no la decisión.** Lo que centraliza es el
 * chequeo del `.error`, el fallar CERRADO y el log — las tres cosas que cada
 * copia escribiría un poco distinto.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export type Pertenencia =
  | { ok: true; fila: Record<string, unknown> }
  | { ok: false; motivo: 'no_existe' | 'ajena' | 'no_se_pudo_leer' }

/**
 * ¿La fila `id` de `tabla` tiene `columna = valor`?
 *
 * Devuelve la fila cuando sí, porque el llamador casi siempre necesita algo de
 * ella —y leerla dos veces sería, además de un viaje de más, una ventana para
 * que cambie entre el chequeo y el uso.
 *
 * `columnas` son las que el llamador quiere de vuelta; la de dueño se agrega
 * sola, así que no hay forma de pedir el chequeo y olvidarse de traerla.
 *
 * **Falla CERRADO.** Si la lectura da error, la respuesta es "no", no "no sé".
 */
export async function filaPertenece(params: {
  admin: Admin
  tabla: string
  id: string
  columna: string
  valor: string | null
  /** Columnas extra a traer. La de dueño y el id van siempre. */
  columnas?: string[]
}): Promise<Pertenencia> {
  const { admin, tabla, id, columna, valor, columnas = [] } = params

  // Sin dueño de referencia no hay nada contra qué comparar. Es el caso de una
  // sesión sin la entidad cargada, y ahí la respuesta es no.
  if (!valor) return { ok: false, motivo: 'ajena' }

  const select = [...new Set(['id', columna, ...columnas])].join(', ')
  const { data, error } = await admin.from(tabla).select(select).eq('id', id).maybeSingle()

  // supabase-js devuelve el error de Postgres en `.error` y no lo lanza. Sin
  // esto, un fallo de lectura daría `data = null` y se reportaría como
  // "no existe" — un diagnóstico equivocado sobre un permiso.
  if (error) {
    console.error(`[pertenencia] no se pudo leer ${tabla}#${id}:`, error.message)
    return { ok: false, motivo: 'no_se_pudo_leer' }
  }
  if (!data) return { ok: false, motivo: 'no_existe' }

  const fila = data as unknown as Record<string, unknown>
  if (fila[columna] !== valor) return { ok: false, motivo: 'ajena' }
  return { ok: true, fila }
}

/**
 * Lo mismo, pero **tira si la fila es de otro**.
 *
 * La asimetría con `no_existe` es la misma que en `lib/alcance-revision.ts`:
 * tocar algo ajeno no es un camino legítimo de ninguna pantalla —es un bug o un
 * ataque— y las pantallas que llaman estas actions suelen ignorar el valor de
 * retorno, así que devolver `{ error }` sería un no-op mudo que **se ve igual
 * que si hubiera funcionado**. Lo peor posible para una denegación.
 *
 * `no_existe` sí puede pasar de forma legítima —dos pestañas, un botón viejo—
 * y devuelve `null` para que el llamador corte sin ruido.
 */
export async function exigirPertenencia(params: {
  admin: Admin
  tabla: string
  id: string
  columna: string
  valor: string | null
  columnas?: string[]
  /** Para el log: quién llamó. */
  desde: string
}): Promise<Record<string, unknown> | null> {
  const r = await filaPertenece(params)
  if (r.ok) return r.fila

  if (r.motivo === 'ajena') {
    console.error(
      `[pertenencia] ${params.desde}: se intentó tocar ${params.tabla}#${params.id}, ` +
      `que no tiene ${params.columna} = ${params.valor}.`
    )
    throw new Error('Eso no es tuyo.')
  }

  console.warn(`[pertenencia] ${params.desde}: ${params.tabla}#${params.id} — ${r.motivo}.`)
  return null
}
