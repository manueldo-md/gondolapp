/**
 * probar-visitas-comercio.mts — contra datos reales, SOLO LECTURA.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-visitas-comercio.mts
 *   GONDOLAPP_PROD=1 npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-visitas-comercio.mts --prod
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * Que la línea de tiempo de un comercio muestre SOLO la evidencia del alcance
 * desde el que se entró.
 *
 * El caso que rompe es real y está medido: **35 comercios en dev y 21 en
 * producción aparecen en campañas de más de un alcance**. El mismo local tiene
 * fotos de Georgalos y de Suprante. Si el filtro no estuviera, entrar con el
 * alcance de una mostraría la góndola de la otra — y no hay nada en pantalla
 * que lo delate, porque una foto de góndola no lleva escrito de quién es.
 *
 * ── Y POR QUÉ ESTE ARCHIVO LLAMA AL CÓDIGO DE VERDAD ────────────────────────
 * Llama a `cabeceraSiPertenece` y `filasDeLaLinea` de `lib/visitas-comercio.ts`,
 * que son las mismas que corren en producción, más `armarLinea` de la lib pura.
 * No replica una sola consulta: es la lección de la primera versión de
 * `probar-fotos-por-campana`, que reproducía el SQL de la acción y por eso daba
 * verde sin verificar nada. Lo único que no se ejercita acá es la resolución del
 * permiso desde la sesión, que necesita una.
 *
 * Necesita el caso sembrado por `scripts/sembrar-linea-comercio.mjs`. Sin él se
 * reporta NO VERIFICABLE, no verde: un control que no distingue un filtro que
 * anda de uno que no existe no es un control.
 *
 * ── ROTURAS VERIFICADAS — medidas, no estimadas ─────────────────────────────
 *   sacar el filtro por campaña de las misiones          →  6 en rojo
 *   la cabecera lee `comercios` en vez de `panel_pdv`    →  1
 *   las fotos se piden por campaña y no por misión       →  1
 *   traer solo las aprobadas, como hace el mapa          →  1
 *   no resolver la pregunta de cada respuesta            →  1
 *   sacar el guard de scope vacío                        →  0  ← ver §3
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { cabeceraSiPertenece, filasDeLaLinea, alcancesDelComercio } from '../lib/visitas-comercio'
import { opcionesDeDistri, alcanceDesde } from '../lib/panel-distri'
import { campanasDe } from '../lib/campanas-de'
import { armarLinea, parDeComparacion } from '../lib/linea-comercio'
import { firmarFotosEnLote } from '../lib/storage-fotos'

const esProd = process.argv.includes('--prod')
const ref = esProd ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'

if (esProd && process.env.GONDOLAPP_PROD !== '1') {
  console.error('\n✗ Para correrlo contra producción hace falta GONDOLAPP_PROD=1.\n')
  process.exit(1)
}

const cred = credencialesDeRef(ref) as { vars: Record<string, string>; archivo: string }
console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

const admin = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/**
 * Un caso que necesita el fixture sembrado, y que **en producción no puede
 * existir**: `sembrar-linea-comercio.mjs` se niega a correr ahí a propósito.
 *
 * Sin esto, correr el script contra prod daba 4 en rojo por estructura y no por
 * un bug. Un control que está rojo siempre es uno que se aprende a ignorar — el
 * mismo defecto que este proyecto ya sacó del "se reintentará automáticamente"
 * y del tilde verde de las alertas. Se reporta ⊘ NO VERIFICABLE, que dice
 * exactamente lo que pasa: acá no hay con qué probarlo.
 */
function casoSiHay(hayFixture: boolean, nombre: string, real: unknown, esperado: unknown) {
  if (!hayFixture) { console.log(`   ⊘  ${nombre} — no verificable sin el caso sembrado`); return }
  caso(nombre, real, esperado)
}

/** Las campañas de un alcance, como las arma `campanasDe`. */
async function campanasDeAlcance(sql: string, args: unknown[]): Promise<string[]> {
  const { rows } = await c.query(sql, args)
  return rows.map(r => r.id as string)
}

try {
  // ── El comercio que está en DOS alcances de la misma distribuidora ────────
  // Uno donde el filtro tiene algo que hacer: con el alcance de la marca no
  // pueden aparecer las visitas de las campañas propias de la distri, ni al
  // revés.
  const { rows: candidatos } = await c.query(`
    WITH porAlcance AS (
      SELECT mi.comercio_id,
             COALESCE(ca.marca_id::text, 'propias') AS alcance,
             ca.distri_id,
             count(*)::int AS visitas
        FROM misiones mi
        JOIN campanas ca ON ca.id = mi.campana_id
       WHERE ca.distri_id IS NOT NULL AND mi.estado IS DISTINCT FROM 'descartada'
       GROUP BY 1, 2, 3)
    SELECT a.comercio_id, a.distri_id, co.nombre AS comercio,
           a.alcance AS alcance_a, a.visitas AS visitas_a,
           b.alcance AS alcance_b, b.visitas AS visitas_b
      FROM porAlcance a
      JOIN porAlcance b ON b.comercio_id = a.comercio_id
                       AND b.distri_id   = a.distri_id
                       AND b.alcance <> a.alcance
      JOIN comercios co ON co.id = a.comercio_id
     WHERE a.alcance <> 'propias'
     ORDER BY a.visitas DESC, b.visitas DESC
     LIMIT 1`)

  console.log('\n▸ El caso que hace falta para que esto pruebe algo')
  if (candidatos.length === 0) {
    console.log('   ⊘ NO HAY ningún comercio con visitas en dos alcances de la misma')
    console.log('     distribuidora. Sin ese dato, este control no distingue un filtro')
    console.log('     que anda de uno que no existe: se reporta como NO VERIFICABLE.')
    console.log('     Sembralo con: node scripts/sembrar-linea-comercio.mjs --ref <ref>')
    fallos++
  } else {
    const x = candidatos[0]
    console.log(`   ·  ${x.comercio}`)
    console.log(`      alcance A (marca)   ${String(x.alcance_a).slice(0, 8)}…  ${x.visitas_a} visitas`)
    console.log(`      alcance B           ${x.alcance_b}            ${x.visitas_b} visitas`)

    const deLaMarca = await campanasDeAlcance(
      `SELECT id FROM campanas WHERE distri_id = $1 AND marca_id = $2`, [x.distri_id, x.alcance_a])
    // El OTRO alcance es el que trajo la consulta, que puede ser otra marca y
    // no las propias. Asumir 'propias' daba un arreglo vacío en producción y
    // ponía en rojo el CONTROL de que los dos alcances traen algo — el test
    // estaba mal, no el filtro.
    const otro = x.alcance_b === 'propias'
      ? await campanasDeAlcance(`SELECT id FROM campanas WHERE distri_id = $1 AND marca_id IS NULL`, [x.distri_id])
      : await campanasDeAlcance(`SELECT id FROM campanas WHERE distri_id = $1 AND marca_id = $2`, [x.distri_id, x.alcance_b])

    // El sembrador se niega a correr contra producción, así que los casos que
    // dependen de él no se pueden verificar ahí. Se detecta por su campaña.
    const { rows: [{ n: sembradas }] } = await c.query(
      "SELECT count(*)::int AS n FROM campanas WHERE nombre LIKE '[TEST]%línea de visitas%'")
    const sembrado = sembradas > 0

    // ── 1. El permiso ─────────────────────────────────────────────────────
    console.log('\n▸ 1. El comercio pertenece al alcance, y la cabecera sale de ahí')
    const cab = await cabeceraSiPertenece(x.comercio_id, deLaMarca, admin)
    caso('pertenece', cab !== null, true)
    caso('con su nombre', cab?.nombre, x.comercio)
    caso('y el id que se pidió', cab?.comercioId, x.comercio_id)

    console.log('\n▸ 2. Un comercio que NO está en el alcance no se puede abrir')
    // Uno cualquiera que no tenga ninguna visita en las campañas de esa marca.
    const { rows: [ajeno] } = await c.query(`
      SELECT co.id, co.nombre FROM comercios co
       WHERE NOT EXISTS (
         SELECT 1 FROM misiones mi WHERE mi.comercio_id = co.id AND mi.campana_id = ANY($1))
       ORDER BY co.nombre LIMIT 1`, [deLaMarca])
    caso('la cabecera da null', await cabeceraSiPertenece(ajeno.id, deLaMarca, admin), null)
    caso('y no trae ninguna visita',
      (await filasDeLaLinea(ajeno.id, deLaMarca, admin)).misiones.length, 0)

    // OJO: estos tres verifican el COMPORTAMIENTO, no el guard. Sacando el
    // `campanaIds.length === 0` de la lib siguen en verde, porque la base ya
    // falla cerrada sola: `.in('campana_id', [])` y `c.id = ANY('{}')` no
    // devuelven filas. Se dejan —el comportamiento es lo que importa— pero que
    // nadie concluya de este verde que el guard está probado. Ver la nota en
    // `lib/visitas-comercio.ts`.
    console.log('\n▸ 3. Falla CERRADO: sin campañas no hay nada')
    caso('cabecera con el arreglo vacío', await cabeceraSiPertenece(x.comercio_id, [], admin), null)
    caso('visitas con el arreglo vacío',
      (await filasDeLaLinea(x.comercio_id, [], admin)).misiones.length, 0)
    caso('sin comercio tampoco', (await filasDeLaLinea('', deLaMarca, admin)).misiones.length, 0)

    // ── 4. LO QUE IMPORTA: la evidencia no cruza de alcance ───────────────
    console.log('\n▸ 4. Las visitas son SOLO las del alcance con el que se entró')
    const conMarca = await filasDeLaLinea(x.comercio_id, deLaMarca, admin)
    const conOtro = await filasDeLaLinea(x.comercio_id, otro, admin)

    const campanasDe = (f: { misiones: { campana_id: string | null }[] }) =>
      [...new Set(f.misiones.map(m => m.campana_id))]

    caso('todas las visitas son de campañas de la marca',
      campanasDe(conMarca).every(id => deLaMarca.includes(id as string)), true)
    caso('y ninguna es del otro alcance',
      campanasDe(conMarca).some(id => otro.includes(id as string)), false)
    caso('del otro lado, lo mismo',
      campanasDe(conOtro).every(id => otro.includes(id as string)), true)

    // EL CONTROL. Si los dos alcances dieran lo mismo, todo lo de arriba sería
    // decorativo: no habría filtro que probar.
    caso('CONTROL — los dos alcances traen visitas DISTINTAS',
      conMarca.misiones.map(m => m.id).some(id => conOtro.misiones.map(n => n.id).includes(id)),
      false)
    caso('CONTROL — y los dos traen algo',
      conMarca.misiones.length > 0 && conOtro.misiones.length > 0, true)

    // Y que las fotos sigan a las misiones, no a otra cosa.
    const misionesDe = new Set(conMarca.misiones.map(m => m.id))
    caso('ninguna foto cuelga de una misión de afuera',
      conMarca.fotos.every(f => f.mision_id && misionesDe.has(f.mision_id)), true)
    caso('ninguna respuesta tampoco',
      conMarca.respuestas.every(r => r.mision_id && misionesDe.has(r.mision_id)), true)

    // ── 5. La línea armada con datos reales ───────────────────────────────
    console.log('\n▸ 5. La línea, armada con el código de la etapa 1')
    const l = armarLinea(conMarca)
    console.log(`   ${l.total} visitas · ${l.recortadas} recortadas · ${l.sinFecha} sin fecha`)
    for (const v of l.visitas) {
      const rev = v.enRevision ? ` · ${v.enRevision} en revisión` : ''
      console.log(`      ${v.instante.slice(0, 10)}  ${String(v.fotos.length)} foto(s)${rev}` +
        `  ${String(v.campanaNombre ?? '—').slice(0, 44)}  ${v.gondolero ?? '—'}`)
    }

    const { rows: [conteo] } = await c.query(`
      SELECT count(*) FILTER (WHERE estado IS DISTINCT FROM 'descartada')::int AS vivas,
             count(*) FILTER (WHERE estado = 'descartada')::int AS descartadas
        FROM misiones WHERE comercio_id = $1 AND campana_id = ANY($2)`,
      [x.comercio_id, deLaMarca])

    caso('hay tantas visitas como misiones vivas', l.total, conteo.vivas)
    // Depende del fixture: en prod no hay ninguna descartada en ese comercio.
    casoSiHay(sembrado, 'y la base tiene alguna descartada, que no entró', conteo.descartadas > 0, true)
    caso('el orden es cronológico',
      l.visitas.map(v => v.instante).join('|'),
      [...l.visitas.map(v => v.instante)].sort().join('|'))

    console.log('\n▸ 6. Los casos sembrados llegan enteros hasta acá')
    casoSiHay(sembrado, 'hay una visita con DOS fotos', l.visitas.some(v => v.fotos.length === 2), true)
    casoSiHay(sembrado, 'hay una visita en revisión sin foto mostrable',
      l.visitas.some(v => v.enRevision > 0 && v.fotos.length === 0), true)
    caso('las visitas traen respuestas con su pregunta',
      l.visitas.some(v => v.respuestas.length > 0 && v.respuestas[0].pregunta.length > 0), true)
    caso('y más de una campaña en la misma línea',
      new Set(l.visitas.map(v => v.campanaNombre)).size > 1, true)

    console.log('\n▸ 7. El par por default, sobre datos reales')
    const par = parDeComparacion(l.visitas)
    caso('hay par', par !== null, true)
    caso('y es cronológico', (par!.anterior.instante <= par!.ultima.instante), true)
    caso('las dos con foto', par!.anterior.fotos.length > 0 && par!.ultima.fotos.length > 0, true)
    if (par) {
      console.log(`   ${par.anterior.instante.slice(0, 10)}  →  ${par.ultima.instante.slice(0, 10)}`)
    }

    // ── 8. Las fotos de la línea se pueden mostrar ────────────────────────
    //
    // Se llama al helper de verdad y no a `createSignedUrls` a mano. La primera
    // versión de este bloque firmaba los paths directo y afirmaba que firmaban
    // TODOS: dio 7 de 10 y la que estaba mal era la afirmación. Las tres que no
    // firman son del seed viejo —`storage_path` sin objeto en Storage— y para
    // ésas el fallback a `url` es lo único que hay. Medir la firma cruda, sin el
    // fallback, es medir algo que la pantalla no hace.
    console.log('\n▸ 8. Todas las fotos de la línea resuelven a algo mostrable')
    const deLaLinea = l.visitas.flatMap(v => v.fotos)
      .map(f => ({ id: f.id, storage_path: f.storagePath, url: f.url }))
    const urls = await firmarFotosEnLote(deLaLinea, admin)

    caso('ninguna foto queda sin URL', deLaLinea.filter(f => !urls[f.id]).length, 0)

    const firmadas = Object.values(urls).filter(u => u.includes('/object/sign/')).length
    console.log(`   ${firmadas} por Storage · ${deLaLinea.length - firmadas} por el fallback a url`)
    // En producción son CERO: las fotos de ese comercio son del seed viejo, sin
    // objeto en Storage. Es el hueco que el tramo ya tiene documentado, no un bug.
    casoSiHay(sembrado, 'y alguna sale firmada de Storage de verdad', firmadas > 0, true)
  }

  // ── 9. EL PADRÓN NO PUEDE PROMETER LO QUE LA PANTALLA NIEGA ──────────────
  //
  // `alcancesDelComercio` decide si el padrón ofrece el link y con qué alcance;
  // `cabeceraSiPertenece` decide si la pantalla deja entrar. **Tienen que
  // coincidir siempre**: si el padrón dijera que el comercio está en Georgalos y
  // la pantalla lo negara, el click caería en un 404 — el problema de dos
  // definiciones que `rutaEvidencia` vino a evitar. Comparten `filaPdv`, y esto
  // es lo que verifica que sigan compartiéndola.
  console.log('\n▸ 9. Los alcances que ofrece el padrón son los que la pantalla acepta')
  {
    const { rows: distris } = await c.query(
      `SELECT id, razon_social FROM distribuidoras ORDER BY razon_social`)

    // Una muestra de comercios de los tres casos: sin alcance, con uno, con
    // varios. Sin los tres, el control no distinguiría nada.
    const { rows: muestra } = await c.query(`
      SELECT co.id, co.nombre FROM comercios co ORDER BY co.nombre LIMIT 12`)

    let comparaciones = 0, desacuerdos = 0
    for (const d of distris) {
      const opciones = await opcionesDeDistri(d.id, admin)
      for (const com of muestra) {
        const ofrecidos = (await alcancesDelComercio(com.id, d.id, admin)).map(o => o.clave)
        // La otra punta, comprobada una por una con la función de la pantalla.
        const aceptados: string[] = []
        for (const o of opciones) {
          const alc = alcanceDesde(o.clave, d.id, opciones)
          if (!alc) continue
          const ids = (await campanasDe(alc, admin)).map(x => x.id)
          if (await cabeceraSiPertenece(com.id, ids, admin)) aceptados.push(o.clave)
        }
        comparaciones++
        if (JSON.stringify([...ofrecidos].sort()) !== JSON.stringify([...aceptados].sort())) {
          desacuerdos++
          console.log(`       ✗ ${d.razon_social} · ${com.nombre}: ofrece ${JSON.stringify(ofrecidos)} y acepta ${JSON.stringify(aceptados)}`)
        }
      }
    }
    caso(`las dos fuentes coinciden en las ${comparaciones} combinaciones`, desacuerdos, 0)
  }

  // ── 10. Las tres ramas, medidas con la fuente de verdad ──────────────────
  // La medición que decidió el diseño se hizo sobre `misiones`, que se le parece
  // pero no es lo que el código usa. Acá se rehace con `panel_pdv`, que es la
  // que manda — una vez por alcance y no una por comercio, que sería lo mismo
  // pero 300 veces más lento.
  console.log('\n▸ 10. El reparto real del padrón, con panel_pdv')
  {
    const { rows: [{ n: padron }] } = await c.query(`SELECT count(*)::int AS n FROM comercios`)
    const { rows: distris } = await c.query(
      `SELECT id, razon_social FROM distribuidoras ORDER BY razon_social`)

    for (const d of distris) {
      const opciones = await opcionesDeDistri(d.id, admin)
      const porComercio = new Map<string, number>()
      for (const o of opciones) {
        const alc = alcanceDesde(o.clave, d.id, opciones)
        if (!alc) continue
        const ids = (await campanasDe(alc, admin)).map(x => x.id)
        if (ids.length === 0) continue
        const { data } = await admin.rpc('panel_pdv', { _campanas: ids })
        for (const f of (data ?? []) as { comercio_id: string }[]) {
          porComercio.set(f.comercio_id, (porComercio.get(f.comercio_id) ?? 0) + 1)
        }
      }
      const enUno = [...porComercio.values()].filter(n => n === 1).length
      const enVarios = [...porComercio.values()].filter(n => n > 1).length
      const sinAlcance = padron - porComercio.size
      if (porComercio.size === 0) continue
      console.log(`   ${String(d.razon_social).slice(0, 24).padEnd(24)} ` +
        `padrón ${String(padron).padStart(3)} · sin alcance ${String(sinAlcance).padStart(3)} · ` +
        `en uno ${String(enUno).padStart(3)} · en varios ${String(enVarios).padStart(3)}`)
    }
  }

  // ── El tamaño del problema, medido ───────────────────────────────────────
  const { rows: [tam] } = await c.query(`
    WITH x AS (
      SELECT mi.comercio_id, COALESCE(ca.marca_id::text, 'propias') AS alcance
        FROM misiones mi JOIN campanas ca ON ca.id = mi.campana_id GROUP BY 1, 2)
    SELECT count(*)::int AS n FROM (SELECT comercio_id FROM x GROUP BY 1 HAVING count(*) > 1) y`)
  console.log('\n▸ Tamaño del problema si el filtro no estuviera')
  console.log(`   ${tam.n} comercios están en campañas de más de un alcance`)

} catch (e) {
  fallos++
  console.error(`\n✗ ${(e as Error).message}`)
} finally {
  await c.end()
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
