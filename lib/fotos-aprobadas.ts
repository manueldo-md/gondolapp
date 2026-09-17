/**
 * lib/fotos-aprobadas.ts
 * Cuántas fotos aprobadas tiene cada gondolero o fixer. Contadas, no guardadas.
 *
 * ── LA COLUMNA QUE ESTO REEMPLAZA ───────────────────────────────────────────
 * Cinco tablas —admin/fixers, admin/repositoras/[id], admin/distribuidoras/[id],
 * repositora/fixers y repositora/dashboard— mostraban una columna "Fotos
 * aprobadas" leyendo `profiles.fotos_aprobadas`. Esa columna la mantenía la RPC
 * `incrementar_fotos_aprobadas`, que **no existe en la base** (verificado el
 * 17/9/2026): las tres actions de aprobación la llamaban, el error se logueaba y
 * seguía de largo, y el contador nunca se movió.
 *
 * O sea que la columna mostraba 0 para todo el mundo salvo donde el seed había
 * escrito un número a mano. Cinco pantallas prometiendo un dato que no existía.
 *
 * Ahora se cuenta contra `fotos`. Una consulta por pantalla para todos los ids a
 * la vez, no una por fila.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/**
 * Fotos en estado `'aprobada'` por gondolero. Los ids que no aparecen en el
 * resultado tienen cero — el llamador usa `?? 0`.
 *
 * Trae `gondolero_id` y cuenta en JS en vez de pedir un `count` por persona:
 * PostgREST no agrupa, así que la alternativa serían N consultas. Con `head:
 * true` por id, una tabla de 30 fixers hacía 30 round trips.
 */
export async function contarFotosAprobadas(
  ids: string[],
  admin: Admin,
): Promise<Map<string, number>> {
  const conteo = new Map<string, number>()
  if (ids.length === 0) return conteo

  try {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await admin
        .from('fotos')
        .select('gondolero_id')
        .in('gondolero_id', ids)
        .eq('estado', 'aprobada')
        .range(desde, desde + 999)

      if (error) {
        console.error('[fotos-aprobadas] error contando:', error.message)
        return conteo
      }
      const filas = (data ?? []) as { gondolero_id: string | null }[]
      for (const f of filas) {
        if (!f.gondolero_id) continue
        conteo.set(f.gondolero_id, (conteo.get(f.gondolero_id) ?? 0) + 1)
      }
      if (filas.length < 1000) break
    }
  } catch (err) {
    console.error('[fotos-aprobadas] error inesperado:', err)
  }
  return conteo
}
