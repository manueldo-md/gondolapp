/**
 * lib/admin-sesion.ts — el cliente de servicio del panel de admin, con el
 * chequeo de que el que llama SEA admin.
 *
 * ── LO QUE REEMPLAZA, Y POR QUÉ ERA PELIGROSO ───────────────────────────────
 * Había **diez copias** de esta función, una por archivo de actions del panel,
 * y las diez byte a byte idénticas (verificado el 25/9/2026 hasheando los
 * cuerpos). Todas hacían exactamente esto:
 *
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) redirect('/auth')
 *     return createAdminClient(URL, SERVICE_ROLE_KEY, …)
 *
 * O sea que **se llamaba `getAdmin` y lo único que preguntaba era si había
 * alguien logueado**, y a cambio devolvía un cliente con permisos de admin. El
 * nombre afirmaba un chequeo que no existía, que es la peor clase de nombre:
 * quien lee `const admin = await getAdmin()` da por hecho que el permiso ya se
 * resolvió y no vuelve a mirar.
 *
 * Al 25/9/2026 eran **40 actions en el panel de admin y solo 4 miraban
 * `tipo_actor`**: `crearCampanaAdmin`, `asignarLocalidadAdmin`,
 * `crearRepositora` y `cambiarEstadoError`. Las otras 36 se apoyaban en el
 * middleware.
 *
 * ── EL MIDDLEWARE ALCANZABA, Y SIGUE SIENDO UNA CAPA SOLA ───────────────────
 * Está verificado que hoy cubre: su matcher toma todas las rutas,
 * `RUTAS_PERMITIDAS` no incluye `/admin` para ningún actor que no sea admin, y
 * **una server action postea a la ruta de su propia página**, así que un
 * gondolero rebota antes de ejecutarla.
 *
 * Pero es una capa sola, y falla en silencio: el día que alguien toque el
 * matcher, mueva una pantalla de ruta o agregue un Route Handler que llame a
 * la misma función, estas 36 quedan abiertas a cualquier autenticado **sin que
 * nada falle visiblemente**. Eso no se descubre con un error: se descubre
 * cuando alguien lo usa.
 *
 * ── POR QUÉ UNA SOLA DEFINICIÓN Y NO 36 CHEQUEOS ────────────────────────────
 * Un chequeo por action es un chequeo que la action número 41 se va a olvidar
 * de copiar. Acá el permiso está en el único camino que da el cliente de
 * servicio: **no hay forma de conseguirlo sin pasar por el chequeo**, y eso es
 * lo que lo hace difícil de romper por olvido en vez de por decisión.
 *
 * Es la misma forma que `lib/alcance-revision.ts` y `lib/actor-sesion.ts`: el
 * permiso no se repite, se deriva de un solo lugar.
 */
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

function clienteDeServicio(): Admin {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * El cliente de servicio, **solo si el que llama es admin**.
 *
 * Redirige a `/auth` si no hay sesión o si el actor no es admin. Redirige y no
 * devuelve `null` a propósito: las 40 actions que la usan hacen
 * `const admin = await getAdmin()` y siguen derecho — si esto pudiera devolver
 * un valor vacío, cada una tendría que acordarse de mirarlo, y volveríamos al
 * chequeo que se olvida.
 *
 * El perfil se lee con el cliente de servicio y no con el del usuario: la RLS
 * de `profiles` deja leer la fila propia, pero depender de eso haría que un
 * cambio de policy convierta este chequeo en un `null` silencioso — o sea en
 * un rebote a `/auth` para un admin legítimo, que es un bug difícil de
 * diagnosticar.
 */
export async function getAdmin(): Promise<Admin> {
  return (await getAdminConUsuario()).admin
}

/**
 * Lo mismo, más el id del admin que llamó — para las actions que lo escriben
 * (`configuracion.updated_by`).
 *
 * Existe porque `guardarConfiguracion` tenía la ONCEAVA copia del bloque, esta
 * vez inline y sin nombre, así que el grep de `getAdmin` no la veía. Un helper
 * que cubre nueve de diez casos deja el décimo escrito a mano, y el décimo es
 * el que se queda sin el chequeo.
 */
export async function getAdminConUsuario(): Promise<{ admin: Admin; userId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const servicio = clienteDeServicio()
  const { data: perfil, error } = await servicio
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .maybeSingle()

  // supabase-js devuelve el error de Postgres en `.error` y no lo lanza. Sin
  // este chequeo, un fallo de lectura daría `perfil = null` y rebotaría a un
  // admin legítimo sin dejar rastro de por qué.
  if (error) {
    console.error('[admin-sesion] no se pudo leer el perfil:', error.message)
    redirect('/auth')
  }

  if ((perfil as { tipo_actor: string | null } | null)?.tipo_actor !== 'admin') {
    console.error(
      `[admin-sesion] ${user.id} llamó una action de admin sin serlo ` +
      `(tipo_actor=${(perfil as { tipo_actor: string | null } | null)?.tipo_actor ?? 'sin perfil'}). ` +
      `Si esto aparece en producción, el middleware dejó de cubrir /admin.`
    )
    redirect('/auth')
  }

  return { admin: servicio, userId: user.id }
}
