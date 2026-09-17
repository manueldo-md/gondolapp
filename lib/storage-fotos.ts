/**
 * lib/storage-fotos.ts
 * Resolver la foto de fachada de un comercio para mostrarla.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * `comercios.foto_fachada_url` tenía DOS formatos según por dónde entró el
 * comercio: `crearComercioNuevo` guardaba el **storage path**
 * (`fachadas/<campana>/<ts>_<user>.jpg`) y `crearComercioParaCaptura` guardaba
 * la **URL pública completa**. El nombre de la columna decía "url" y la mitad de
 * las filas tenían otra cosa.
 *
 * Las cinco pantallas que muestran fachadas hacen
 * `createSignedUrl(foto_fachada_url)`, o sea que **asumen un path**. Con una URL
 * adentro, el "path" que le llega a Storage es `https:/proyecto.supabase.co/...`,
 * no existe ningún objeto así, la firma falla y el thumb queda roto. Verificado
 * en dev el 17/9/2026: las 3 filas con URL fallan al firmar, las 4 con path
 * firman bien — y los archivos de las 7 existen.
 *
 * ── POR QUÉ GANA EL PATH ────────────────────────────────────────────────────
 * 1. **Los dos buckets son PRIVADOS** (`fotos-gondola` y `fotos-fachada`). La
 *    URL guardada es del tipo `/object/public/…`, que en un bucket privado no
 *    sirve para nada. No es una preferencia de formato: la URL era dato malo.
 * 2. **La URL lleva el dominio del proyecto adentro.** Un dump de dev restaurado
 *    en prod —o al revés— deja filas apuntando al storage del otro ambiente. Con
 *    un path no puede pasar: el path es relativo al bucket del cliente que
 *    firma, así que siempre resuelve contra el ambiente donde corre.
 * 3. El código ya esperaba un path en los cinco lugares, y `fotos.storage_path`
 *    ya establece la convención.
 *
 * El costo es resolver al leer, y es el que se paga acá una vez.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

/** El bucket donde viven las fachadas. Es el mismo de las fotos de góndola:
 *  `subirFotoFachada` sube a `fotos-gondola` bajo el prefijo `fachadas/`.
 *  (Existe un bucket `fotos-fachada` que no usa nadie.) */
export const BUCKET_FOTOS = 'fotos-gondola'

/**
 * Normaliza lo que haya guardado en `foto_fachada_url` a un storage path.
 *
 * Acepta las tres formas que existen en la base y devuelve `null` cuando no hay
 * nada que firmar:
 *
 *   · path             → se devuelve igual
 *   · URL de Supabase  → se extrae lo que sigue a `/object/public|sign/<bucket>/`
 *   · URL ajena (Drive, picsum, la que sea) → `null`, porque no es de nuestro
 *     storage y firmarla no tiene sentido. El llamador la usa tal cual.
 *
 * La extracción corta en `?` para no arrastrar el token de una URL ya firmada, y
 * pasa por `decodeURIComponent` porque un nombre con espacios o acentos viaja
 * escapado en la URL y el path del objeto no lo está.
 */
export function pathDeFachada(valor: string | null | undefined): string | null {
  if (!valor) return null
  if (!/^https?:\/\//i.test(valor)) return valor

  const m = valor.match(/\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
  if (!m) return null                       // URL ajena: no es de nuestro storage
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]                             // escapado raro: mejor el crudo que nada
  }
}

/** La URL ajena se muestra tal cual; no hay nada que firmar. */
function esUrlAjena(valor: string | null | undefined): boolean {
  return !!valor && /^https?:\/\//i.test(valor) && pathDeFachada(valor) === null
}

/**
 * Firma las fachadas de una lista de comercios. Devuelve `id → url mostrable`.
 *
 * Existe como helper y no suelto en cada pantalla porque las cinco hacían el
 * mismo `Promise.all` con el mismo `3600`, y las cinco tenían el mismo bug.
 *
 * Nunca tira: una fachada que no se puede firmar queda fuera del mapa y la
 * pantalla muestra el comercio sin foto, que es lo que corresponde. Un listado
 * de comercios no se cae porque falte un thumb.
 */
export async function firmarFachadas(
  comercios: { id: string; foto_fachada_url: string | null }[],
  admin: Admin,
  segundos = 3600,
): Promise<Record<string, string>> {
  const conFachada = comercios.filter(c => c.foto_fachada_url)
  if (conFachada.length === 0) return {}

  const pares = await Promise.all(
    conFachada.map(async c => {
      const valor = c.foto_fachada_url as string
      if (esUrlAjena(valor)) return [c.id, valor] as const

      const path = pathDeFachada(valor)
      if (!path) return [c.id, null] as const

      try {
        const { data } = await admin.storage.from(BUCKET_FOTOS).createSignedUrl(path, segundos)
        return [c.id, data?.signedUrl ?? null] as const
      } catch {
        return [c.id, null] as const
      }
    })
  )

  return Object.fromEntries(pares.filter((p): p is readonly [string, string] => p[1] !== null))
}

/** Una sola fachada. Mismo criterio que `firmarFachadas`. */
export async function firmarFachada(
  valor: string | null | undefined,
  admin: Admin,
  segundos = 3600,
): Promise<string | null> {
  if (!valor) return null
  const mapa = await firmarFachadas([{ id: 'x', foto_fachada_url: valor }], admin, segundos)
  return mapa['x'] ?? null
}

// ── Fotos de góndola ─────────────────────────────────────────────────────────

/**
 * Firma las fotos de góndola de una lista. Devuelve `id → url mostrable`.
 *
 * ── POR QUÉ `url` ES UN FALLBACK Y NO LA FUENTE ─────────────────────────────
 * `fotos` tiene dos columnas: `storage_path`, que es la buena —100% paths en dev
 * y en prod— y `url`, que es un cajón mezclado del seed: 112 URLs de Drive, 73
 * de picsum y unas cuantas de Supabase.
 *
 * Las de Drive y picsum **no tienen objeto en Storage**, así que para esas filas
 * el fallback es lo único que hay y por eso la columna no se puede borrar sin
 * más. Las de Supabase sí tienen `storage_path` válido, así que el fallback
 * nunca se dispara para ellas — y menos mal, porque son las que llevan el
 * dominio del proyecto adentro.
 *
 * El orden importa y es el mismo que ya usaban los cinco paneles que muestran
 * góndolas: **firmar primero, `url` después**.
 */
export async function firmarFotos(
  fotos: { id: string; storage_path?: string | null; url?: string | null }[],
  admin: Admin,
  segundos = 3600,
): Promise<Record<string, string>> {
  if (fotos.length === 0) return {}

  const pares = await Promise.all(
    fotos.map(async f => {
      if (f.storage_path) {
        try {
          const { data } = await admin.storage.from(BUCKET_FOTOS).createSignedUrl(f.storage_path, segundos)
          if (data?.signedUrl) return [f.id, data.signedUrl] as const
        } catch { /* cae al fallback */ }
      }
      return [f.id, f.url ?? null] as const
    })
  )

  return Object.fromEntries(pares.filter((p): p is readonly [string, string] => p[1] !== null))
}
