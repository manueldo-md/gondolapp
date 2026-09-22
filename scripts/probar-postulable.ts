/**
 * probar-postulable.ts — SOLO LÓGICA, sin base.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI UNA OFERTA SE VUELVE TRABAJABLE.
 *
 * `postulable` habilita MIRAR una campaña, no trabajarla. Los gates que deciden
 * si se puede trabajar —`validarUnion` al unirse, `registrarMision` al enviar—
 * miran `ok`, así que la propiedad que hay que proteger es una sola y es esta:
 *
 *     postulable nunca, jamás, viene con ok: true
 *
 * Si alguien "simplifica" eso algún día, una campaña de una repositora ajena
 * pasa a ser trabajable por cualquier fixer, y el trabajo se paga contra un
 * ejecutor que nunca lo aceptó.
 *
 *   npx tsx scripts/probar-postulable.ts
 */
import { accesoACampana, ejecutorDeCampana, type CampanaAcceso, type ContextoAcceso } from '../lib/acceso-campana'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const REPO_A = 'repo-a', REPO_B = 'repo-b', DISTRI_A = 'distri-a', MARCA = 'marca-1'

const fixerSinVinculo: ContextoAcceso = {
  esFixer: true, misDistriIds: [], misRepoIds: [], relacionesMarcaDistri: [],
}
const fixerDeA: ContextoAcceso = {
  esFixer: true, misDistriIds: [], misRepoIds: [REPO_A], relacionesMarcaDistri: [],
}
const gondolero: ContextoAcceso = {
  esFixer: false, misDistriIds: [], misRepoIds: [], relacionesMarcaDistri: [],
}

/** Campaña de fixers ejecutada por la repositora B, abierta a postulaciones. */
const oferta: CampanaAcceso = {
  financiada_por: 'marca', marca_id: MARCA, distri_id: null,
  repositora_id: REPO_B, actor_campana: 'fixer', abierta_a_postulaciones: true,
}

console.log('\n▸ LO QUE NO PUEDE PASAR NUNCA')
// Es un solo invariante y es el que sostiene todo el tramo.
const combinaciones: Array<[string, CampanaAcceso, ContextoAcceso]> = [
  ['oferta de repositora, fixer sin vínculo', oferta, fixerSinVinculo],
  ['oferta de repositora, fixer de otra',     oferta, fixerDeA],
  ['oferta de distri',  { ...oferta, repositora_id: null, distri_id: DISTRI_A, financiada_por: 'distri' }, fixerSinVinculo],
]
for (const [nombre, c, ctx] of combinaciones) {
  const r = accesoACampana(c, ctx)
  caso(`${nombre}: postulable pero ok=false`,
    { ok: r.ok, postulable: !r.ok && !!r.postulable }, { ok: false, postulable: true })
}

console.log('\n▸ Quién ejecuta — y por qué no se lee via_ejecucion')
caso('con repositora_id manda la repositora',
  ejecutorDeCampana(oferta), { tipo: 'repositora', id: REPO_B })
caso('aunque via_ejecucion diga "distribuidora", como dice en el 100% de las filas',
  ejecutorDeCampana({ ...oferta, via_ejecucion: 'distribuidora' }), { tipo: 'repositora', id: REPO_B })
caso('sin repositora, manda la distri',
  ejecutorDeCampana({ ...oferta, repositora_id: null, distri_id: DISTRI_A }), { tipo: 'distri', id: DISTRI_A })
caso('sin ninguno, no hay ejecutor: es de GondolApp',
  ejecutorDeCampana({ ...oferta, repositora_id: null, distri_id: null }), null)

console.log('\n▸ Cuándo NO se ofrece postularse')
const sinPostular = (nombre: string, c: CampanaAcceso, ctx: ContextoAcceso) => {
  const r = accesoACampana(c, ctx)
  caso(nombre, !r.ok && !!r.postulable, false)
}
sinPostular('sin el flag, la misma campaña no es oferta',
  { ...oferta, abierta_a_postulaciones: false }, fixerSinVinculo)
sinPostular('un GONDOLERO no ve una oferta de fixers', oferta, gondolero)
sinPostular('una campaña de gondoleros con el flag puesto tampoco',
  { ...oferta, actor_campana: 'gondolero' }, gondolero)
// ── OJO CON LOS DOS DE ABAJO: pasan por una guarda distinta de la que parece ──
//
// Se verificó rompiendo el código: sacar el filtro por `motivo` de
// `acceso-campana.ts` NO pone rojo ninguno de estos dos, porque los agarra la
// guarda del EJECUTOR. `sin_vinculo_marca` y `campana_sin_financiador` solo se
// devuelven cuando no hay ni `distri_id` ni `repositora_id`, así que nunca hay a
// quién postularse y `ejecutorDeCampana` ya devuelve null.
//
// O sea que estos casos prueban el RESULTADO, no la guarda que uno cree. Se
// dejan igual —el resultado es el que importa— pero anotado para que nadie
// concluya del verde que el filtro por motivo está cubierto: no lo está, y no
// se puede cubrir, porque esas combinaciones no existen.
sinPostular('falta el vínculo MARCA↔distri: eso no lo arregla postulándose',
  { financiada_por: 'marca', marca_id: MARCA, distri_id: null, repositora_id: null,
    actor_campana: 'fixer', abierta_a_postulaciones: true },
  fixerSinVinculo)
sinPostular('una campaña sin financiador coherente no se ofrece',
  { financiada_por: 'distri', marca_id: null, distri_id: null, repositora_id: null,
    actor_campana: 'fixer', abierta_a_postulaciones: true },
  fixerSinVinculo)

console.log('\n▸ El que YA tiene vínculo no ve una oferta: entra derecho')
const conVinculo = accesoACampana({ ...oferta, repositora_id: REPO_A }, fixerDeA)
caso('ok true', conVinculo.ok, true)
caso('y sin postulable, porque no hay nada que pedir',
  'postulable' in conVinculo ? conVinculo.postulable : undefined, undefined)

console.log('\n▸ CONTROL — el flag no cambia nada de lo que ya decidía')
// Si la campaña no acepta postulaciones, el resultado tiene que ser IDÉNTICO al
// de antes del tramo. Es lo que prueba que esto no tocó los gates existentes.
for (const [nombre, c, ctx] of combinaciones) {
  const conFlag = accesoACampana(c, ctx)
  const sinFlag = accesoACampana({ ...c, abierta_a_postulaciones: false }, ctx)
  caso(`${nombre}: mismo motivo y mensaje con o sin flag`,
    { m: sinFlag.ok ? null : sinFlag.motivo, t: sinFlag.ok ? null : sinFlag.mensaje },
    { m: conFlag.ok ? null : conFlag.motivo, t: conFlag.ok ? null : conFlag.mensaje })
}
caso('y una campaña de GondolApp sigue abierta para todos',
  accesoACampana({ financiada_por: 'gondolapp', marca_id: null, distri_id: null,
                   repositora_id: null, actor_campana: null }, fixerSinVinculo).ok, true)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
