/**
 * probar-alertas-distri.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-alertas-distri.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 * Que la alerta de Quiebre de stock no vuelva a AFIRMAR algo que no midió.
 *
 * El defecto que se arregló no era un número mal calculado: era un tilde verde
 * —"✅ Sin alertas de stock activas"— sobre una consulta que devolvía cero
 * porque su fuente está congelada desde abril de 2026. Un cero de algo que no
 * se mide y un cero de algo que se midió y dio bien se veían IGUAL.
 *
 * Por eso los controles de acá son sobre el TEXTO y no solo sobre el estado:
 * el estado es un booleano que cualquiera lee bien, y el daño estaba en la
 * frase. Un test que solo mirara `midiendo` habría pasado con el cartel viejo.
 */
import { estadoQuiebre, textoQuiebre } from '../lib/alertas-distri'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
function contiene(nombre: string, texto: string, aguja: string) {
  caso(nombre, texto.includes(aguja), true)
}
function noContiene(nombre: string, texto: string, aguja: string) {
  caso(nombre, texto.includes(aguja), false)
}

console.log('\n▸ El estado sale del conteo, no de una constante')
caso('cero preguntas tipificadas → no mide', estadoQuiebre(0), { midiendo: false, campos: 0 })
caso('una → mide',                           estadoQuiebre(1), { midiendo: true,  campos: 1 })
caso('varias → mide, y conserva cuántas',    estadoQuiebre(7), { midiendo: true,  campos: 7 })

console.log('\n▸ Sin medir: la frase dice el hueco y qué hacer')
{
  const t = textoQuiebre(estadoQuiebre(0))
  caso('el título es el mismo que usa Presencia en marca', t.titulo, 'No se está midiendo')
  contiene('nombra la métrica que falta', t.detalle, 'Quiebre de stock')
  contiene('dice dónde se arregla',       t.detalle, 'campaña')
  contiene('dice que es una pregunta tipificada', t.detalle, 'tipificada')
}

console.log('\n▸ Y sobre todo: NO afirma que no haya quiebres')
{
  const t = textoQuiebre(estadoQuiebre(0))
  const todo = `${t.titulo} ${t.detalle}`
  // Los cuatro que producía el cartel viejo. Este es el control que se habría
  // puesto rojo contra el código de ayer, y el único que importa de verdad.
  noContiene('sin tilde verde',        todo, '✅')
  noContiene('sin "todo en orden"',    todo.toLowerCase(), 'todo en orden')
  noContiene('sin "sin alertas"',      todo.toLowerCase(), 'sin alertas')
  noContiene('sin "no hay quiebres"',  todo.toLowerCase(), 'no hay quiebre')
}

console.log('\n▸ Midiendo: tampoco miente, y no promete una fecha')
{
  const t = textoQuiebre(estadoQuiebre(3))
  caso('el título cambia', t.titulo, 'Todavía sin leer')
  contiene('dice cuántas preguntas hay', t.detalle, '3 preguntas')
  // Biomega en dev tiene la pregunta tipificada y CERO respuestas, así que la
  // frase no puede afirmar que haya respuestas guardadas: dice qué pasa con
  // las que entren.
  contiene('y que la respuesta no se pierde', t.detalle, 'quedan guardadas')
  noContiene('sin afirmar respuestas que quizás no existan', t.detalle, 'se están guardando')
  noContiene('no promete una etapa ni una fecha', t.detalle.toLowerCase(), 'próximamente')
  noContiene('tampoco dice "pronto"',            t.detalle.toLowerCase(), 'pronto')
}

console.log('\n▸ Singular y plural, que es donde estas frases se ven mal')
contiene('una sola pregunta', textoQuiebre(estadoQuiebre(1)).detalle, '1 pregunta tipificada')
noContiene('y no dice "1 preguntas"', textoQuiebre(estadoQuiebre(1)).detalle, '1 preguntas')
contiene('dos', textoQuiebre(estadoQuiebre(2)).detalle, '2 preguntas tipificadas')

console.log('\n▸ Un conteo imposible no inventa un estado')
caso('negativo se trata como sin medir', estadoQuiebre(-1), { midiendo: false, campos: 0 })

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
