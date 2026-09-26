/**
 * probar-campanas-bloqueadas.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-campanas-bloqueadas.ts
 *
 * Lo que importa acá no es que agrupe: es **qué NO muestra** y **qué no se
 * pierde**.
 *
 *   · Que un motivo que no es del gondolero —`campana_sin_financiador`— no le
 *     ocupe una fila con un texto con el que no puede hacer nada.
 *   · Que el total siga cerrando cuando el tope recorta: lo que sale de la
 *     lista tiene que aparecer en el "y N más", o el tope pasa a esconder.
 *   · Que el mensaje sea EL DE `accesoACampana` y no una copia. Si alguien
 *     cambia el texto allá y acá no se entera, la pantalla dice una cosa
 *     distinta de la que hace el gate — que es exactamente el problema que
 *     `lib/acceso-campana.ts` vino a resolver con sus tres copias.
 */
import {
  agruparBloqueadas,
  TOPE_GRUPOS,
  type CampanaBloqueable,
} from '../lib/campanas-bloqueadas'
import { accesoACampana, type ContextoAcceso } from '../lib/acceso-campana'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const SIN_VINCULOS: ContextoAcceso = {
  esFixer: false, misDistriIds: [], misRepoIds: [], relacionesMarcaDistri: [],
}

let n = 0
/** Campaña de distri, con nombre de distri. */
const deDistri = (distriId: string, razon: string): CampanaBloqueable => ({
  id: `c${++n}`, nombre: `Campaña ${n}`,
  financiada_por: 'distri', distri_id: distriId, marca_id: null, repositora_id: null,
  actor_campana: 'gondolero',
  marca: null, distri: { razon_social: razon }, repositora: null,
})
/** Campaña de marca sin ejecutora: pide relación marca↔distri. */
const deMarca = (marcaId: string, razon: string): CampanaBloqueable => ({
  id: `c${++n}`, nombre: `Campaña ${n}`,
  financiada_por: 'marca', distri_id: null, marca_id: marcaId, repositora_id: null,
  actor_campana: 'gondolero',
  marca: { razon_social: razon }, distri: null, repositora: null,
})

console.log('\n▸ 1. Agrupa por ejecutor, no por campaña')
{
  const r = agruparBloqueadas([
    deDistri('d1', 'Zeta S.A.'),
    deDistri('d1', 'Zeta S.A.'),
    deDistri('d1', 'Zeta S.A.'),
    deDistri('d2', 'Alfa S.R.L.'),
  ], SIN_VINCULOS)
  caso('4 campañas → 2 grupos', r.grupos.length, 2)
  caso('el total no se pierde', r.total, 4)
  // Los nombres van A PROPÓSITO en contra del alfabético. Con 'Biomega' (3) y
  // 'Distri Norte' (1) los dos órdenes coincidían y este control NO PODÍA
  // FALLAR: verificado rompiendo el sort, quedaba en verde igual.
  caso('ordenados de más a menos, NO alfabético', r.grupos.map(g => [g.nombre, g.campanas]),
    [['Zeta S.A.', 3], ['Alfa S.R.L.', 1]])
  caso('cada grupo dice con quién hay que vincularse', r.grupos.map(g => g.tipo),
    ['distribuidora', 'distribuidora'])
}

console.log('\n▸ 2. El mensaje es EL de accesoACampana, no una copia')
{
  const c = deDistri('d1', 'Biomega S.A.')
  const delGate = accesoACampana(c, SIN_VINCULOS)
  const r = agruparBloqueadas([c], SIN_VINCULOS)
  caso('el gate deniega', delGate.ok, false)
  caso('y el grupo repite su texto tal cual',
    r.grupos[0].mensaje, delGate.ok ? null : delGate.mensaje)
  caso('CONTROL — el texto no está vacío', r.grupos[0].mensaje.length > 20, true)
}

console.log('\n▸ 3. Lo que tiene acceso NO entra')
{
  const conBiomega: ContextoAcceso = { ...SIN_VINCULOS, misDistriIds: ['d1'] }
  const r = agruparBloqueadas([
    deDistri('d1', 'Biomega S.A.'),
    deDistri('d2', 'Distri Norte S.R.L.'),
  ], conBiomega)
  caso('solo queda la que no puede tomar', r.grupos.map(g => g.nombre), ['Distri Norte S.R.L.'])
  caso('y el total es 1', r.total, 1)
}

console.log('\n▸ 4. Un motivo que NO es del gondolero no ocupa una fila')
{
  // `financiada_por='distri'` SIN distri_id: la campaña está mal configurada.
  // El mensaje es neutro a propósito y no hay nada que él pueda hacer.
  //
  // OJO con la fixture, que este control ya mordió una vez: hace falta
  // `marca_id`. Sin él la campaña no tiene NI ejecutora NI marca, y el paso 2
  // de `accesoACampana` la deja pasar como si fuera de GondolApp —"no hay a
  // quién pertenecer"— así que nunca llega al motivo que se quiere probar.
  const rota: CampanaBloqueable = {
    id: 'rota', nombre: 'Campaña rota',
    financiada_por: 'distri', distri_id: null, marca_id: 'm9', repositora_id: null,
    actor_campana: 'gondolero', marca: { razon_social: 'ACME S.A.' }, distri: null, repositora: null,
  }
  caso('CONTROL — el gate igual la deniega', accesoACampana(rota, SIN_VINCULOS).ok, false)
  const r = agruparBloqueadas([rota], SIN_VINCULOS)
  caso('pero no genera grupo', r.grupos.length, 0)
  caso('ni entra en el total', r.total, 0)

  // Y mezclada con una mostrable, no contamina el conteo.
  const mixto = agruparBloqueadas([rota, deDistri('d1', 'Biomega S.A.')], SIN_VINCULOS)
  caso('mezclada, el total cuenta solo la mostrable', [mixto.grupos.length, mixto.total], [1, 1])
}

console.log('\n▸ 5. El tope recorta grupos y NO pierde campañas')
{
  const muchas: CampanaBloqueable[] = []
  // 6 distris con 6, 5, 4, 3, 2 y 1 campañas = 21 en total.
  for (let d = 6; d >= 1; d--) {
    // El nombre crece CON el tamaño, así que el alfabético es el orden inverso
    // del que se quiere probar. Ver la nota del caso 1.
    for (let k = 0; k < d; k++) muchas.push(deDistri(`d${d}`, `Distri ${d}`))
  }
  const r = agruparBloqueadas(muchas, SIN_VINCULOS, 4)
  caso('muestra 4 grupos', r.grupos.length, 4)
  caso('y dice que quedaron 2 afuera', r.gruposOcultos, 2)
  caso('con 3 campañas adentro (2 + 1)', r.campanasOcultas, 3)
  caso('el total sigue siendo el de verdad', r.total, 21)
  caso('LA CUENTA CIERRA: mostradas + ocultas = total',
    r.grupos.reduce((s, g) => s + g.campanas, 0) + r.campanasOcultas, r.total)
  caso('y recorta por los MÁS grandes, no por nombre ni por orden de llegada',
    r.grupos.map(g => [g.nombre, g.campanas]),
    [['Distri 6', 6], ['Distri 5', 5], ['Distri 4', 4], ['Distri 3', 3]])
}

console.log('\n▸ 6. El tope por defecto es el de la lib, y 0 se trata como sin tope')
{
  const muchas: CampanaBloqueable[] = []
  for (let d = 1; d <= 7; d++) muchas.push(deDistri(`d${d}`, `Distri ${d}`))
  caso(`por defecto corta en ${TOPE_GRUPOS}`,
    agruparBloqueadas(muchas, SIN_VINCULOS).grupos.length, TOPE_GRUPOS)
  // Sin esto, un tope mal pasado dejaría la tarjeta vacía con un "7 más" al pie.
  const sinTope = agruparBloqueadas(muchas, SIN_VINCULOS, 0)
  caso('tope 0 muestra todos', [sinTope.grupos.length, sinTope.gruposOcultos], [7, 0])
}

console.log('\n▸ 7. Marca sin ejecutora: el grupo es la MARCA')
{
  const r = agruparBloqueadas([deMarca('m1', 'ACME S.A.')], SIN_VINCULOS)
  caso('un grupo, de tipo marca', r.grupos.map(g => [g.tipo, g.nombre]), [['marca', 'ACME S.A.']])
  // Con una distri que trabaja con esa marca, deja de estar bloqueada.
  const conRelacion: ContextoAcceso = {
    ...SIN_VINCULOS, misDistriIds: ['d9'], relacionesMarcaDistri: [{ marca_id: 'm1', distri_id: 'd9' }],
  }
  caso('CONTROL — con la relación puesta, desaparece',
    agruparBloqueadas([deMarca('m1', 'ACME S.A.')], conRelacion).total, 0)
}

console.log('\n▸ 8. Sin nombre no se rompe: cae a un genérico')
{
  const anonima = { ...deDistri('d1', 'x'), distri: null }
  const r = agruparBloqueadas([anonima], SIN_VINCULOS)
  caso('el grupo existe y tiene un nombre usable',
    [r.grupos.length, r.grupos[0]?.nombre], [1, 'Una distribuidora'])
}

console.log('\n▸ 9. Lista vacía')
caso('no inventa grupos', agruparBloqueadas([], SIN_VINCULOS),
  { grupos: [], gruposOcultos: 0, campanasOcultas: 0, total: 0 })

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exit(fallos ? 1 : 0)
