/**
 * probar-precios.ts — SOLO LECTURA
 *
 *   1. `preciosDeRespuestas` como casos.
 *   2. Contra la base: qué badge de precio mostraría cada foto HOY, y cuál
 *      mostraría si se tipificaran las preguntas candidatas. Sin escribir nada.
 *
 *   npx tsx scripts/probar-precios.ts --ref <project-ref>
 */
import { createClient } from '@supabase/supabase-js'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { preciosDeRespuestas, type RespuestaTipificada } from '../lib/precios-relevados'

let fallos = 0
const PRECIO = 'uuid-de-precio'
const FRENTES = 'uuid-de-frentes'

function caso(nombre: string, resps: RespuestaTipificada[], metricaId: string | null, esperado: number[]) {
  const r = preciosDeRespuestas(resps, metricaId)
  const ok = JSON.stringify(r.map(x => x.valor)) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(r.map(x => x.valor))}`)
}

const r = (pregunta: string, valor: unknown, metricaId: string | null): RespuestaTipificada =>
  ({ pregunta, tipo: 'numero', valor, metricaId })

console.log('\n▸ preciosDeRespuestas')

caso('una pregunta de precio', [r('Precio del Mantecol', 1200, PRECIO)], PRECIO, [1200])

// Lo que pidió el usuario explícitamente: si hay dos, se muestran las dos.
caso('DOS preguntas de precio → las dos, en orden',
  [r('Precio del Mantecol', 1200, PRECIO), r('Precio del Flow', 950, PRECIO)], PRECIO, [1200, 950])

caso('ignora las de otra métrica',
  [r('Frentes', 4, FRENTES), r('Precio', 1200, PRECIO)], PRECIO, [1200])

caso('ignora las no tipificadas',
  [r('Precio, sin tipificar', 1200, null)], PRECIO, [])

// Los dos casos que motivan el badge: tienen que LLEGAR a la pantalla, no
// filtrarse. El revisor es quien decide si son un error.
caso('el 0 se muestra — es justo el dato sospechoso', [r('Precio', 0, PRECIO)], PRECIO, [0])
caso('el 7777 se muestra', [r('Precio', 7777, PRECIO)], PRECIO, [7777])

// Y los que NO son un precio.
caso('respuesta en blanco no es un precio de 0', [r('Precio', '', PRECIO)], PRECIO, [])
caso('null no es un precio', [r('Precio', null, PRECIO)], PRECIO, [])
caso('texto no numérico se descarta', [r('Precio', 'no había', PRECIO)], PRECIO, [])
caso('string numérico viejo del seed se acepta', [r('Precio', '1200', PRECIO)], PRECIO, [1200])

// CONTROLES: sin catálogo no se inventa nada.
caso('CONTROL — sin métrica Precio en el catálogo', [r('Precio', 1200, PRECIO)], null, [])
caso('CONTROL — sin respuestas', [], PRECIO, [])

async function main() {
  const ref = process.argv[process.argv.indexOf('--ref') + 1]
  const cred = credencialesDeRef(ref)
  if (!cred) {
    console.error('\n✗ sin credenciales para ' + ref)
    process.exitCode = 1
    return
  }
  const db = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`\n▸ El badge en ${nombreDeRef(ref)} (${ref})`)

  const [metricasRes, camposRes, respsRes, fotosRes] = await Promise.all([
    db.from('metricas').select('id, slug'),
    db.from('bloque_campos').select('id, tipo, pregunta, metrica_id'),
    db.from('mision_respuestas').select('mision_id, campo_id, valor').is('reemplazada_por', null),
    db.from('fotos').select('id, mision_id').not('mision_id', 'is', null),
  ])

  const idPrecio = (metricasRes.data ?? []).find(m => m.slug === 'precio')?.id ?? null
  console.log(`   métrica Precio: ${idPrecio ? 'en el catálogo' : 'AUSENTE — el badge no muestra nada'}`)

  const campo = new Map((camposRes.data ?? []).map(c => [c.id, c]))

  // Lo que se ve hoy, con la tipificación que realmente hay.
  const porMision = new Map<string, RespuestaTipificada[]>()
  for (const resp of respsRes.data ?? []) {
    const c = campo.get(resp.campo_id)
    if (!c) continue
    const lista = porMision.get(resp.mision_id) ?? []
    lista.push({ pregunta: c.pregunta ?? '', tipo: c.tipo, valor: resp.valor, metricaId: (c as { metrica_id?: string | null }).metrica_id ?? null })
    porMision.set(resp.mision_id, lista)
  }

  let conBadge = 0
  for (const f of fotosRes.data ?? []) {
    if (preciosDeRespuestas(porMision.get(f.mision_id!), idPrecio).length > 0) conBadge++
  }
  console.log(`   fotos que muestran precio HOY: ${conBadge} de ${(fotosRes.data ?? []).length}`)

  // Y lo que se vería tipificando cada candidata. Es la previsualización de lo
  // que el usuario va a hacer a mano desde /admin/metricas.
  const candidatas = (camposRes.data ?? []).filter(c => c.tipo === 'numero' && !(c as { metrica_id?: string | null }).metrica_id)
  if (candidatas.length === 0) {
    console.log('   no quedan preguntas `numero` sin tipificar')
  } else {
    console.log(`\n   Si se tipificara como Precio cada una de estas ${candidatas.length}:`)
    for (const c of candidatas) {
      const fotosDeEsaPregunta = new Set<string>()
      const valores: unknown[] = []
      for (const resp of respsRes.data ?? []) {
        if (resp.campo_id !== c.id) continue
        valores.push(resp.valor)
        for (const f of fotosRes.data ?? []) if (f.mision_id === resp.mision_id) fotosDeEsaPregunta.add(f.id)
      }
      const simulados = preciosDeRespuestas(
        valores.map(v => ({ pregunta: c.pregunta ?? '', tipo: 'numero', valor: v, metricaId: idPrecio })),
        idPrecio,
      )
      const nums = simulados.map(s => s.valor)
      const raros = nums.filter(n => n === 0 || n > 100000)
      console.log(`     "${c.pregunta}"`)
      console.log(`       ${simulados.length} de ${valores.length} respuestas son un precio válido · badge en ${fotosDeEsaPregunta.size} fotos`)
      if (nums.length) console.log(`       min ${Math.min(...nums)} · max ${Math.max(...nums)}${raros.length ? `  ← ${raros.length} sospechoso(s): ${raros.join(', ')}` : ''}`)
    }
  }

  console.log(fallos ? `\n✗ ${fallos} caso(s) mal\n` : '\n✓ Todo como se esperaba.\n')
  process.exitCode = fallos ? 1 : 0
}

main()
