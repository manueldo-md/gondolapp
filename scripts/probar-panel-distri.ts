/**
 * probar-panel-distri.ts — SOLO LÓGICA, sin base.
 *
 *   npx tsx scripts/probar-panel-distri.ts
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 *
 *   1. QUE EL CONTROL DE ALCANCE NO SE DÉ UN DEFAULT. El daño no sería una
 *      pantalla vacía: sería que la distribuidora lea el 80% de Georgalos
 *      creyendo que es de Suprante. Un default escondido en un control
 *      obligatorio es indistinguible de una elección propia.
 *
 *   2. QUE LA CLAVE DE LA URL NO SEA UN PERMISO. `alcanceDesde` la valida
 *      contra las opciones de ESA distri: un `marca_id` puesto a mano no puede
 *      convertirse en un alcance.
 *
 *   3. QUE EL AVISO SE APAGUE SOLO. Cuando los dos criterios de conteo
 *      coinciden no hay nada que explicar, y un aviso permanente enseña a
 *      ignorarlo — el defecto que ya sacamos del "se reintentará
 *      automáticamente" de la cola y del tilde verde de las alertas.
 */
import {
  alcanceDesde, textoDesvio, CLAVE_PROPIAS,
  type OpcionAlcance,
} from '../lib/panel-distri'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}
function contiene(nombre: string, texto: string | null, aguja: string) {
  caso(nombre, (texto ?? '').includes(aguja), true)
}

const DISTRI = 'd1'
const OPCIONES: OpcionAlcance[] = [
  { clave: 'm-georgalos', etiqueta: 'Georgalos S.A.', campanas: 2 },
  { clave: 'm-suprante',  etiqueta: 'Suprante SRL',   campanas: 1 },
  { clave: CLAVE_PROPIAS, etiqueta: 'Mis campañas propias', campanas: 1 },
]

console.log('\n▸ Sin elección NO se elige por ella')
caso('undefined → null', alcanceDesde(undefined, DISTRI, OPCIONES), null)
caso('null → null',      alcanceDesde(null, DISTRI, OPCIONES), null)
caso('vacío → null',     alcanceDesde('', DISTRI, OPCIONES), null)
// Este es el control que importa: si alguna vez alguien "mejora" la UX
// devolviendo la primera opción, esto se pone rojo.
caso('NO cae en la primera opción',
  alcanceDesde(undefined, DISTRI, OPCIONES)?.tipo ?? null, null)

console.log('\n▸ Una clave válida da su alcance')
caso('una marca',  alcanceDesde('m-georgalos', DISTRI, OPCIONES),
  { tipo: 'distri-marca', distriId: DISTRI, marcaId: 'm-georgalos' })
caso('la otra',    alcanceDesde('m-suprante', DISTRI, OPCIONES),
  { tipo: 'distri-marca', distriId: DISTRI, marcaId: 'm-suprante' })
caso('las propias', alcanceDesde(CLAVE_PROPIAS, DISTRI, OPCIONES),
  { tipo: 'distri-propias', distriId: DISTRI })

console.log('\n▸ LA CLAVE DE LA URL NO ES UN PERMISO')
caso('una marca que no ejecuta → null', alcanceDesde('m-ajena', DISTRI, OPCIONES), null)
caso('un uuid inventado → null',
  alcanceDesde('00000000-0000-0000-0000-000000000000', DISTRI, OPCIONES), null)
caso('sin opciones, ninguna clave sirve', alcanceDesde('m-georgalos', DISTRI, []), null)
caso('ni siquiera "propias" si no tiene propias',
  alcanceDesde(CLAVE_PROPIAS, DISTRI, [OPCIONES[0]]), null)
caso('distingue mayúsculas', alcanceDesde('M-GEORGALOS', DISTRI, OPCIONES), null)

console.log('\n▸ El aviso SE APAGA SOLO')
caso('los dos en cero → sin aviso',
  textoDesvio({ fueraDeSusCampanas: 0, deOtrosGondoleros: 0 }), null)

console.log('\n▸ …y mientras haya diferencia, la dice')
{
  // El caso real de producción: Biomega ve 100 por gondolero y 92 por campaña.
  const t = textoDesvio({ fueraDeSusCampanas: 8, deOtrosGondoleros: 0 })
  contiene('nombra el número', t, '8 misiones')
  contiene('dice de quién son', t, 'tus gondoleros')
  contiene('y por qué no entran', t, 'no son tuyas')
  contiene('explica los dos criterios', t, 'CAMPAÑA')
  contiene('los dos, no uno', t, 'GONDOLERO')
  caso('no menciona la otra dirección si es cero',
    (t ?? '').includes('otra distribuidora'), false)
}

console.log('\n▸ La otra dirección, y las dos juntas')
{
  const t = textoDesvio({ fueraDeSusCampanas: 0, deOtrosGondoleros: 15 })
  contiene('las que entran', t, '15 misiones')
  contiene('de quién', t, 'otra distribuidora')
  caso('y no habla de las que salen', (t ?? '').includes('quedaron afuera'), false)

  const dos = textoDesvio({ fueraDeSusCampanas: 20, deOtrosGondoleros: 15 })
  contiene('las dos: salen', dos, '20 misiones')
  contiene('las dos: entran', dos, '15 misiones')
}

console.log('\n▸ Singular y plural, que es donde estas frases se ven mal')
{
  const uno = textoDesvio({ fueraDeSusCampanas: 1, deOtrosGondoleros: 0 })
  contiene('una misión', uno, '1 misión de tus gondoleros quedó afuera')
  caso('y no dice "1 misiones"', (uno ?? '').includes('1 misiones'), false)

  const otra = textoDesvio({ fueraDeSusCampanas: 0, deOtrosGondoleros: 1 })
  contiene('una del otro lado', otra, '1 misión de tus campañas la hizo un gondolero')
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
