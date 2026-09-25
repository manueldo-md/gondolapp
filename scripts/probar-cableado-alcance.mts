/**
 * probar-cableado-alcance.mts — ¿alguna action escribe `fotos` sin el guard?
 *
 *   npx tsx scripts/probar-cableado-alcance.mts
 *
 * No toca la base. Lee el código.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * `probar-alcance-revision.mts` prueba la DECISIÓN con actores y fotos reales,
 * y no puede probar otra cosa: la línea sesión → actor necesita cookies.
 *
 * Y justamente ahí es donde este proyecto se equivoca. Cuatro veces:
 *
 *   rutaEvidencia      la función andaba · le pasaban 'distribuidora' por 'distri'
 *   la sonda del mapa  andaba            · medía una URL escrita a mano
 *   hrefDelMapa        andaba            · mergeaba sobre una base incompleta
 *   textoGrupo         andaba            · la cabecera no le pasaba el modo
 *
 * En los cuatro la lib estaba bien y su test verde. **Lo que falla es quién la
 * llama.** Así que acá no se prueba la función: se prueba que esté enchufada.
 *
 * ── QUÉ AFIRMA, EXACTAMENTE ─────────────────────────────────────────────────
 * Toda función exportada de un archivo `'use server'` que ESCRIBA sobre `fotos`
 * tiene que pasar por `exigirFotoRevisable` o por `fotosQuePuedeRevisar`.
 *
 * Es una heurística de texto y lo dice de frente: **no prueba que el guard se
 * llame ANTES de escribir, ni con los estados correctos.** Prueba lo único que
 * un grep puede probar, que es lo que falló las cuatro veces: que el llamador
 * exista. El resto lo cubre el tipo — las tres funciones que toman `estados` no
 * tienen default, así que olvidarse no compila.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const GUARDS = ['exigirFotoRevisable', 'fotosQuePuedeRevisar', 'campanaEnAlcance']

/**
 * La OTRA forma legítima de la misma regla: la action no revisa el trabajo de
 * nadie, toca el propio. Ahí el permiso es `user.id`, no el alcance.
 *
 * Están enumeradas y no derivadas de un regex a propósito. `user.id` en el
 * cuerpo no prueba que la escritura esté acotada — puede estar usado para
 * cualquier otra cosa— así que **las cinco se leyeron una por una**, el
 * 25/9/2026, y esto es el registro de esa lectura:
 *
 *   retirarFoto          if (foto.gondolero_id !== user.id) return { error }
 *   registrarRecaptura   if (mision.gondolero_id !== user.id) throw
 *   descartarRecaptura   if (mision.gondolero_id !== user.id) throw
 *   registrarMision      inserta con gondolero_id: user.id
 *   crearComercioNuevo   inserta la fachada con gondolero_id: user.id
 *
 * Una función NUEVA que escriba sobre `fotos` NO entra sola en esta lista:
 * el control la marca hasta que alguien la lea y la agregue. Eso es el punto
 * — una lista que se completa sola no verifica nada.
 */
const ACOTADAS_AL_PROPIO_USUARIO = [
  'retirarFoto', 'registrarRecaptura', 'descartarRecaptura',
  'registrarMision', 'crearComercioNuevo',
]

/** Escrituras sobre `fotos` que cambian su estado o sus puntos. */
const ESCRIBE_FOTOS = /\.from\('fotos'\)[\s\S]{0,400}?\.(update|insert|upsert|delete)\(/

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '.git') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) archivos(p, out)
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(p)
  }
  return out
}

let fallos = 0
const revisados: string[] = []

console.log('\n▸ Actions que escriben sobre `fotos`\n')

for (const ruta of archivos(join(RAIZ, 'app'))) {
  const src = readFileSync(ruta, 'utf8')
  if (!src.includes("'use server'")) continue

  // Trocear por función exportada: el guard tiene que estar en LA MISMA, no en
  // otra del mismo archivo. Un archivo con una función guardada y otra sin
  // guardar pasaría un chequeo a nivel de archivo.
  const partes = src.split(/^export async function /m).slice(1)
  for (const parte of partes) {
    const nombre = parte.slice(0, parte.indexOf('(')).trim()
    if (!ESCRIBE_FOTOS.test(parte)) continue

    const rel = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/')
    const tieneGuard = GUARDS.some(g => parte.includes(g))
    // Una que delega entera en otra guardada también está cubierta: es el caso
    // de `cambiarEstadoFoto`, que llama a las dos de arriba.
    const delega = /await (aprobarFotoAdmin|rechazarFotoAdmin|aprobarFotoBase|rechazarFotoBase)\(/.test(parte)

    // Una acotada al propio usuario sigue teniendo que mirar `user.id`: la
    // lista dice "se leyó y estaba bien", no "está exenta para siempre". Si
    // alguien saca el chequeo, el nombre en la lista no la salva.
    const propia = ACOTADAS_AL_PROPIO_USUARIO.includes(nombre) && parte.includes('user.id')

    revisados.push(nombre)
    const ok = tieneGuard || delega || propia
    if (!ok) fallos++
    const nota = !tieneGuard && delega ? '   (delega)' : propia ? '   (acotada a user.id)' : ''
    console.log(`   ${ok ? '✓' : '✗'}  ${nombre.padEnd(24)} ${rel}${nota}`)
    if (!ok) {
      console.log(ACOTADAS_AL_PROPIO_USUARIO.includes(nombre)
        ? '       está en ACOTADAS_AL_PROPIO_USUARIO pero ya no menciona `user.id`: volver a leerla'
        : `       escribe sobre \`fotos\` y no llama a ninguno de: ${GUARDS.join(', ')}`)
    }
  }
}

// El re-export de repositora: no declara funciones propias que escriban, así
// que el barrido de arriba no lo ve. Pero es EL caso del tramo — su panel usa
// la action de distri— así que se afirma aparte que sigue siendo un re-export
// y no una copia que se pueda quedar vieja.
console.log('\n▸ El panel de repositora sigue REUSANDO la action de distri')
{
  const rel = 'app/(repositora)/repositora/campanas/[id]/resultados/actions.ts'
  const src = readFileSync(join(RAIZ, rel), 'utf8')
  const reusa = src.includes("(distribuidora)/distribuidora/gondolas/actions")
  const copia = ESCRIBE_FOTOS.test(src)
  if (!reusa || copia) fallos++
  console.log(`   ${reusa && !copia ? '✓' : '✗'}  importa de distri y no escribe fotos por su cuenta`)
  if (!reusa) console.log('       dejó de reusarla: si ahora tiene su propia copia, necesita su propio guard')
  if (copia) console.log('       escribe sobre `fotos` directamente: es una copia, no un re-export')
}

// Y que el actor salga de la SESIÓN en todas. Sin esto, el guard podría estar
// llamado con un actor fabricado desde un parámetro, que es el agujero entero.
console.log('\n▸ El actor sale de la sesión, nunca de un parámetro')
{
  for (const ruta of archivos(join(RAIZ, 'app'))) {
    const src = readFileSync(ruta, 'utf8')
    if (!GUARDS.some(g => src.includes(g))) continue
    const rel = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/')
    const ok = src.includes('actorRevisorDeLaSesion')
    if (!ok) fallos++
    console.log(`   ${ok ? '✓' : '✗'}  ${rel}`)
    if (!ok) console.log('       usa el guard pero no deriva el actor de la sesión')
  }
}

// ── La otra mitad de la regla: el id del que LLAMA no viene por parámetro ───
// Estas cinco lo recibían. Dos no chequeaban nada —`previsualizarDesvincular*`
// ni siquiera llamaba a `getUser()`—, dos lo comparaban contra
// `perfil.distri_id`, y `desvincularFixer` de repositora **escribía con el
// `repoId` que mandara el cliente, sin verificar nada**.
//
// Ahora los cinco lo derivan de la sesión. El control es que no vuelva: un
// parámetro que el cliente elige es un parámetro que alguien se puede olvidar
// de verificar, y agregarlo de nuevo compila perfecto.
console.log('\n▸ El id de la entidad del que llama NO está en la firma')
{
  const CERRADAS: [string, string, string[]][] = [
    ['app/(distribuidora)/distribuidora/gondoleros/desvincular-actions.ts',
      'distriDeLaSesion', ['previsualizarDesvincularGondolero', 'desvincularGondolero']],
    ['app/(distribuidora)/distribuidora/fixers/desvincular-actions.ts',
      'distriDeLaSesion', ['previsualizarDesvincularFixer', 'desvincularFixer']],
    ['app/(repositora)/repositora/fixers/invitar-actions.ts',
      'repositoraDeLaSesion', ['desvincularFixer']],
    ['app/(distribuidora)/distribuidora/comercios/pendientes/actions.ts',
      'distriDeLaSesion', ['aprobarComercioDistri', 'rechazarComercioDistri', 'asignarLocalidadDistri']],
  ]

  for (const [rel, derivador, funciones] of CERRADAS) {
    const src = readFileSync(join(RAIZ, rel), 'utf8')
    for (const fn of funciones) {
      const i = src.indexOf(`export async function ${fn}(`)
      if (i < 0) { fallos++; console.log(`   ✗  ${fn}: ya no existe en ${rel}`); continue }
      // La firma es todo hasta el `{` que abre el cuerpo.
      const firma = src.slice(i, i + src.slice(i).indexOf('{'))
      const tieneIdPropio = /\b(distriId|repoId|repositoraId|marcaId)\s*:/.test(firma)
      const deriva = src.includes(derivador)
      const ok = !tieneIdPropio && deriva
      if (!ok) fallos++
      console.log(`   ${ok ? '✓' : '✗'}  ${fn.padEnd(32)} ${rel.split('/').slice(-2).join('/')}`)
      if (tieneIdPropio) console.log(`       volvió a recibir el id de su propia entidad por parámetro`)
      if (!deriva) console.log(`       el archivo ya no usa ${derivador}`)
    }
  }
}

// ── El panel de admin: un solo camino al cliente de servicio ────────────────
// Había ONCE copias del bloque `getUser()` + `createAdminClient(...)`, diez con
// nombre y una inline. Se llamaban `getAdmin` y lo único que preguntaban era si
// había alguien logueado.
//
// Lo que hace seguro el arreglo no es que ahora chequeen: es que **no se pueda
// conseguir el cliente de servicio sin pasar por el chequeo**. Eso solo vale
// mientras nadie se arme el suyo, y eso es lo que mide este bloque.
console.log('\n▸ Ninguna action de admin se arma su propio cliente de servicio')
{
  let propios = 0
  for (const ruta of archivos(join(RAIZ, 'app', '(admin)'))) {
    const src = readFileSync(ruta, 'utf8')
    if (!src.includes("'use server'")) continue
    const rel = ruta.slice(RAIZ.length + 1).replace(/\\/g, '/')
    if (src.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      propios++; fallos++
      console.log(`   ✗  ${rel}`)
      console.log('       arma su propio cliente de servicio en vez de usar getAdmin()')
    }
  }
  if (!propios) console.log('   ✓  todas pasan por lib/admin-sesion.ts')
}

// ── El crédito por foto, en un solo lugar ───────────────────────────────────
// Los seis inserts no chequeaban `.error`. Con el índice único puesto y sin el
// chequeo, un duplicado deja de pagar dos veces y pasa a NO PAGAR NADA en
// silencio — un bug mudo por otro, y el segundo le saca plata al gondolero.
console.log('\n▸ El crédito por foto pasa por `acreditarPorFoto`')
{
  let crudos = 0
  for (const ruta of [...archivos(join(RAIZ, 'app')), ...archivos(join(RAIZ, 'lib'))]) {
    if (ruta.endsWith('credito-foto.ts')) continue
    const src = readFileSync(ruta, 'utf8')
    // Un insert sobre el libro de puntos que mencione `foto_id` en el objeto.
    const m = src.match(/\.from\('movimientos_puntos'\)\s*\.insert\(\{[\s\S]{0,400}?\}\)/g) ?? []
    for (const bloque of m) {
      if (!bloque.includes('foto_id')) continue
      crudos++; fallos++
      console.log(`   ✗  ${ruta.slice(RAIZ.length + 1).replace(/\\/g, '/')}`)
      console.log('       inserta un crédito con foto_id sin pasar por acreditarPorFoto')
    }
  }
  if (!crudos) console.log('   ✓  ningún insert crudo con foto_id')
  const llamadores = archivos(join(RAIZ, 'app'))
    .filter(r => readFileSync(r, 'utf8').includes('acreditarPorFoto({')).length
  console.log(`   (${llamadores} archivos lo llaman)`)
}

console.log(`\n   (${revisados.length} funciones que escriben sobre \`fotos\`)`)
console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todas pasan por el guard.\n')
process.exit(fallos ? 1 : 0)
