/**
 * probar-codigo-actor.ts — SOLO LÓGICA, sin base.
 *
 * Cubre lo que `lib/codigo-gondolero.ts` decide: el formato por tipo, la
 * normalización de lo que alguien tipea, y el rechazo por prefijo ANTES de ir a
 * la base.
 *
 * El caso que manda es el de la normalización, y no es cosmético: un código
 * dictado por teléfono se tipea como viene —sin guiones, con espacios, en
 * minúscula— y cada una de esas formas devolvía "Código no encontrado.
 * Verificá que sea correcto." sobre un código que ERA correcto. Eso manda a la
 * distribuidora a buscar un error que no existe.
 *
 *   npx tsx scripts/probar-codigo-actor.ts
 */
import {
  normalizarCodigo,
  revisarCodigo,
  tieneCodigoVigente,
  tipoDeCodigo,
  EJEMPLO_CODIGO,
} from '../lib/codigo-gondolero'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const GND = 'GND-4728-5936'
const FXR = 'FXR-3852-6479'

console.log('\n▸ El código se tipea como viene')
caso('tal cual',            normalizarCodigo(FXR), FXR)
caso('en minúscula',        normalizarCodigo('fxr-3852-6479'), FXR)
caso('sin guiones',         normalizarCodigo('FXR38526479'), FXR)
caso('con espacios',        normalizarCodigo('fxr 3852 6479'), FXR)
caso('con espacio pegado del copiar-pegar', normalizarCodigo('  FXR-3852-6479 '), FXR)
caso('con guiones de más',  normalizarCodigo('FXR--3852--6479'), FXR)

console.log('\n▸ Lo que NO hace: adivinar')
// Normalizar no es corregir. Un texto que no tiene tres letras y ocho dígitos
// sale como se pueda y lo rechaza el validador.
caso('un código corto no se completa', normalizarCodigo('FXR-385'), 'FXR385')
caso('texto cualquiera', normalizarCodigo('no me acuerdo'), 'NOMEACUERDO')
caso('vacío', normalizarCodigo(''), '')

console.log('\n▸ De quién es un código')
caso('GND es de un gondolero', tipoDeCodigo(GND), 'gondolero')
caso('FXR es de un fixer',     tipoDeCodigo(FXR), 'fixer')
caso('lo reconoce sin guiones', tipoDeCodigo('fxr38526479'), 'fixer')
caso('el formato viejo no es de nadie', tipoDeCodigo('GOND-4054'), null)
caso('con un 0 adentro tampoco', tipoDeCodigo('GND-4028-5936'), null)
caso('con un 1 adentro tampoco', tipoDeCodigo('GND-4128-5936'), null)

console.log('\n▸ El rechazo por prefijo, SIN consultar la base')
// Lo que el prefijo agrega no es el mensaje cruzado —las tres búsquedas ya lo
// daban— sino poder darlo cuando el código NO ESTÁ en la base. Antes eso caía
// en "no encontrado", indistinguible de un typo.
caso('un FXR entra al buscador de fixers', revisarCodigo(FXR, 'fixer'), { codigo: FXR })
caso('tipeado mal, entra igual', revisarCodigo('fxr 3852 6479', 'fixer'), { codigo: FXR })
caso('un GND en el buscador de fixers se rechaza acá',
  revisarCodigo(GND, 'fixer')?.error, 'Ese código es de un Gondolero, no de un Fixer.')
caso('con la sugerencia de la pantalla',
  revisarCodigo(GND, 'fixer', 'Para vincularlo andá a la sección Gondoleros de tu panel.')?.error,
  'Ese código es de un Gondolero, no de un Fixer. Para vincularlo andá a la sección Gondoleros de tu panel.')
caso('y un FXR en el de gondoleros, al revés',
  revisarCodigo(FXR, 'gondolero')?.error, 'Ese código es de un Fixer, no de un Gondolero.')
caso('un código que no existe PERO tiene prefijo de gondolero no dice "no encontrado"',
  revisarCodigo('GND-2222-3333', 'fixer')?.error, 'Ese código es de un Gondolero, no de un Fixer.')
caso('un formato inválido dice cuál es el formato',
  revisarCodigo('no me acuerdo', 'fixer')?.error,
  `Ese código no tiene el formato correcto. Tiene que ser como ${EJEMPLO_CODIGO.fixer}.`)

console.log('\n▸ El contador de códigos pendientes del panel admin')
// Este es el que se rompía en silencio si el regex no miraba el tipo: los 14
// fixers quedarían contados como pendientes para siempre y el botón "Asignar
// códigos" no los arreglaría nunca, porque el backfill SQL sí mira el tipo.
caso('un fixer con FXR está al día',     tieneCodigoVigente(FXR, 'fixer'), true)
caso('un fixer con GND NO está al día',  tieneCodigoVigente(GND, 'fixer'), false)
caso('un gondolero con GND está al día', tieneCodigoVigente(GND, 'gondolero'), true)
caso('un gondolero con FXR NO',          tieneCodigoVigente(FXR, 'gondolero'), false)
caso('sin código, no',                   tieneCodigoVigente(null, 'fixer'), false)
caso('el formato viejo, no',             tieneCodigoVigente('FIXE-8990', 'fixer'), false)

console.log('\n▸ CONTROL — los ejemplos de los placeholders son válidos')
caso('el de gondolero', tieneCodigoVigente(EJEMPLO_CODIGO.gondolero, 'gondolero'), true)
caso('el de fixer',     tieneCodigoVigente(EJEMPLO_CODIGO.fixer, 'fixer'), true)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
