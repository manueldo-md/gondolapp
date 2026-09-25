/**
 * probar-geocoding.ts — SIN BASE Y SIN RED.
 *
 *   npx tsx scripts/probar-geocoding.ts
 *
 * Los casos no son inventados: son los que se MIDIERON el 25/9/2026 contra las
 * dos bases y contra un proveedor real. Cada bloque dice de dónde salió.
 */
import {
  resolverLocalidad, candidatosDe, normalizar, explicarResolucion,
  type FilaPadron, type DireccionProveedor,
} from '../lib/geocoding'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const f = (id: number, nombre: string, departamento: string, provincia: string): FilaPadron =>
  ({ id, nombre, departamento, provincia })

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL BUG DEL ilike: 99 nombres se repiten ENTRE provincias')
{
  // Real: "25 de Mayo" existe 4 veces en el padrón, en provincias distintas.
  const padron = [
    f(1, '25 de Mayo', 'Veinticinco de Mayo', 'Buenos Aires'),
    f(2, '25 de Mayo', '25 de Mayo', 'San Juan'),
    f(3, '25 de Mayo', 'La Paz', 'Mendoza'),
    f(4, '25 de Mayo', 'Veinticinco de Mayo', 'Misiones'),
  ]

  const r = resolverLocalidad({ town: '25 de Mayo', state: 'Buenos Aires' }, padron)
  caso('con provincia, resuelve a la de ESA provincia', r.estado === 'exacto' && r.localidadId, 1)

  // CONTROL: el bug era quedarse con el primero. Sin provincia no se elige.
  const sinProv = resolverLocalidad({ town: '25 de Mayo' }, padron)
  caso('CONTROL — sin provincia NO se queda con el primero', sinProv.estado, 'ambiguo')
  caso('y devuelve las cuatro opciones',
    sinProv.estado === 'ambiguo' && sinProv.opciones.length, 4)

  // Y una provincia que no tiene ese nombre no cae a "la primera que haya".
  const otra = resolverLocalidad({ town: '25 de Mayo', state: 'Santa Fe' }, padron)
  caso('una provincia sin ese nombre da FUERA, no una de otra provincia', otra.estado, 'fuera')
}

console.log('\n▸ 64 nombres se repiten DENTRO de la misma provincia')
{
  // Real, antes de la migración 20260930100000: Colón estaba dos veces en
  // Entre Ríos, y ahí caían los 18 comercios sin localidad.
  const antes = [
    f(1, 'Colón', 'Colón', 'Entre Ríos'),
    f(126, 'Colón', 'Uruguay', 'Entre Ríos'),
  ]
  const r = resolverLocalidad({ city: 'Colón', state: 'Entre Ríos', county: 'Distrito Primero' }, antes)
  caso('ANTES de la etapa 1, Colón era ambiguo aun con provincia', r.estado, 'ambiguo')

  // Después de la migración queda una sola. Este control prueba que la etapa 1
  // sirvió para algo medible, no solo para dejar el padrón prolijo.
  const despues = [f(1, 'Colón', 'Colón', 'Entre Ríos')]
  const r2 = resolverLocalidad({ city: 'Colón', state: 'Entre Ríos', county: 'Distrito Primero' }, despues)
  caso('DESPUÉS de la etapa 1, resuelve exacto', r2.estado === 'exacto' && r2.localidadId, 1)
}

console.log('\n▸ `county` NO es nuestro departamento')
{
  // Medido: para Colón, Nominatim devuelve county="Distrito Primero", que es
  // una división sub-departamental entrerriana y no existe en `departamentos`.
  const padron = [f(1, 'Colón', 'Colón', 'Entre Ríos')]
  const r = resolverLocalidad({ city: 'Colón', state: 'Entre Ríos', county: 'Distrito Primero' }, padron)
  caso('un county que no matchea NO rechaza el resultado', r.estado, 'exacto')

  // Y cuando sí coincide, desempata.
  const dos = [
    f(10, 'Caseros', 'Colón', 'Entre Ríos'),
    f(123, 'Caseros', 'Uruguay', 'Entre Ríos'),
  ]
  caso('un county que SÍ matchea desempata',
    (r => r.estado === 'exacto' && r.localidadId)(
      resolverLocalidad({ town: 'Caseros', state: 'Entre Ríos', county: 'Uruguay' }, dos)), 123)
  // CONTROL: sin county, ese mismo par no se resuelve.
  caso('CONTROL — sin county, el mismo par queda ambiguo',
    resolverLocalidad({ town: 'Caseros', state: 'Entre Ríos' }, dos).estado, 'ambiguo')
}

console.log('\n▸ El orden de los candidatos importa, y aplanarlos lo rompe')
{
  // Mi propia medición del 25/9 falló por aplanar la lista: probé todos los
  // candidatos juntos y un pueblo bien resuelto salía empatado con el nombre
  // del departamento. El primero que matchea gana.
  const padron = [
    f(1, 'Pueblo Chico', 'Algún Depto', 'Entre Ríos'),
    f(2, 'Ciudad Grande', 'Algún Depto', 'Entre Ríos'),
  ]
  const r = resolverLocalidad(
    { village: 'Pueblo Chico', city: 'Ciudad Grande', state: 'Entre Ríos' }, padron)
  caso('gana el más específico (village sobre city)', r.estado === 'exacto' && r.localidadId, 1)

  // Si el más específico no está en el padrón, se sigue con el siguiente.
  const r2 = resolverLocalidad(
    { village: 'Paraje Que No Existe', city: 'Ciudad Grande', state: 'Entre Ríos' }, padron)
  caso('si el primero no está, se prueba el siguiente', r2.estado === 'exacto' && r2.localidadId, 2)

  caso('el orden de candidatosDe es el declarado',
    candidatosDe({ suburb: 'S', city: 'C', village: 'V', town: 'T', municipality: 'M' }),
    ['V', 'T', 'C', 'M', 'S'])
  caso('y no repite cuando el proveedor manda lo mismo dos veces',
    candidatosDe({ town: 'Concordia', city: 'concordia' }), ['Concordia'])
  caso('`county` NO entra como candidato de localidad',
    candidatosDe({ county: 'Colón' }), [])
}

console.log('\n▸ Acentos y mayúsculas')
{
  const padron = [f(31, 'Chajarí', 'Federación', 'Entre Ríos')]
  caso('"Chajari" sin tilde matchea "Chajarí"',
    resolverLocalidad({ town: 'CHAJARI', state: 'entre rios' }, padron).estado, 'exacto')
  caso('"Provincia de Entre Ríos" es la misma provincia',
    resolverLocalidad({ town: 'Chajarí', state: 'Provincia de Entre Ríos' }, padron).estado, 'exacto')
  caso('normalizar saca acentos y colapsa espacios',
    normalizar('  Concepción   del  Uruguay '), 'concepcion del uruguay')
}

console.log('\n▸ Lo que NO resuelve, y lo dice')
{
  caso('sin ningún nombre de lugar → sin_dato',
    resolverLocalidad({ county: 'Federación', state: 'Entre Ríos' }, []).estado, 'sin_dato')
  caso('campos vacíos o en blanco cuentan como sin_dato',
    resolverLocalidad({ town: '   ', city: '' }, []).estado, 'sin_dato')

  // Real: General Campos y Villaguay no devolvieron nombre; otros devuelven
  // nombres que el padrón no tiene, porque está incompleto fuera de Entre Ríos.
  const fuera = resolverLocalidad({ town: 'Pueblito Sin Padrón', state: 'Formosa' }, [])
  caso('un nombre que no está en el padrón → fuera', fuera.estado, 'fuera')
  caso('y dice cuál era, para poder cargarlo después',
    fuera.estado === 'fuera' && fuera.candidatos[0], 'Pueblito Sin Padrón')
}

console.log('\n▸ LO QUE ESTA LIB NO PUEDE ARREGLAR — por eso es una SUGERENCIA')
{
  // El caso medido que decidió todo el diseño: un comercio cuyo CSV dice
  // Gualeguaychú resolvió a "Larroque". Larroque EXISTE y está en Entre Ríos,
  // así que acá sale `exacto` — con razón, porque la respuesta es consistente.
  // El error está río arriba y ninguna lógica lo detecta.
  const padron = [f(70, 'Larroque', 'Gualeguaychú', 'Entre Ríos')]
  const r = resolverLocalidad({ town: 'Larroque', state: 'Entre Ríos' }, padron)
  caso('"Larroque" resuelve exacto aunque el comercio fuera de Gualeguaychú',
    r.estado, 'exacto')
  caso('o sea: `exacto` NO significa correcto, significa sin ambigüedad',
    r.estado === 'exacto' && r.fila.nombre, 'Larroque')
}

console.log('\n▸ El texto que va al log y a la bandeja')
{
  caso('exacto dice la cadena entera',
    explicarResolucion(resolverLocalidad(
      { town: 'Chajarí', state: 'Entre Ríos' }, [f(31, 'Chajarí', 'Federación', 'Entre Ríos')])),
    'Chajarí — Federación, Entre Ríos')
  const amb = explicarResolucion(resolverLocalidad({ town: 'Caseros', state: 'Entre Ríos' },
    [f(10, 'Caseros', 'Colón', 'Entre Ríos'), f(123, 'Caseros', 'Uruguay', 'Entre Ríos')]))
  caso('ambiguo dice cuántas y dónde, y que lo elige una persona',
    amb.includes('2 veces') && amb.includes('Colón, Uruguay') && amb.includes('una persona'), true)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
