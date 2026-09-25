/**
 * probar-zonas-gondolero.mts — la expansión, sin base.
 *
 *   npx tsx scripts/probar-zonas-gondolero.mts
 *
 * ── LO QUE IMPORTA ──────────────────────────────────────────────────────────
 * Que expandir se haga contra el padrón de AHORA. Toda la etapa 8 existe por
 * eso: guardar la expansión dejaba a un gondolero sin cubrir un pueblo nuevo de
 * su propio departamento, **y sin enterarse**.
 *
 * El control que lo prueba es el que agrega una localidad al padrón entre dos
 * expansiones y verifica que la segunda la traiga. Con el modelo viejo eso era
 * imposible por construcción.
 */
import { expandirZonas, type ZonaGondolero } from '../lib/zonas-gondolero'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

/** Un padrón de mentira con la forma que devuelve PostgREST. */
function fakeAdmin(padron: {
  departamentos: { id: number; provincia_id: number }[]
  localidades: { id: number; departamento_id: number }[]
}) {
  const consultas: string[] = []
  return {
    consultas,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from(tabla: string): any {
      consultas.push(tabla)
      return {
        select: () => ({
          in: (col: string, vals: number[]) => {
            if (tabla === 'departamentos')
              return Promise.resolve({ data: padron.departamentos.filter(d => vals.includes(d.provincia_id)).map(d => ({ id: d.id })), error: null })
            return Promise.resolve({ data: padron.localidades.filter(l => vals.includes(l.departamento_id)).map(l => ({ id: l.id })), error: null })
          },
        }),
      }
    },
  }
}

const PADRON = {
  departamentos: [{ id: 10, provincia_id: 1 }, { id: 11, provincia_id: 1 }, { id: 20, provincia_id: 2 }],
  localidades: [
    { id: 100, departamento_id: 10 }, { id: 101, departamento_id: 10 },
    { id: 110, departamento_id: 11 },
    { id: 200, departamento_id: 20 },
  ],
}
const orden = (a: number[]) => [...a].sort((x, y) => x - y)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ Cada nivel expande lo suyo')
{
  const a = fakeAdmin(PADRON)
  caso('una provincia trae todas sus localidades',
    orden(await expandirZonas([{ nivel: 'provincia', refId: 1 }], a as never)), [100, 101, 110])
  caso('un departamento trae las suyas',
    orden(await expandirZonas([{ nivel: 'departamento', refId: 10 }], fakeAdmin(PADRON) as never)), [100, 101])
  caso('una localidad suelta es ella misma',
    await expandirZonas([{ nivel: 'localidad', refId: 200 }], fakeAdmin(PADRON) as never), [200])
}

console.log('\n▸ Sin niveles agregados, NO consulta la base')
{
  const a = fakeAdmin(PADRON)
  caso('tres localidades sueltas',
    orden(await expandirZonas([
      { nivel: 'localidad', refId: 100 }, { nivel: 'localidad', refId: 110 }, { nivel: 'localidad', refId: 200 },
    ], a as never)), [100, 110, 200])
  // Si consultara igual, serían dos viajes por cada lectura de campañas.
  caso('cero consultas', a.consultas, [])
}

console.log('\n▸ Se mezclan sin repetir')
{
  const r = await expandirZonas([
    { nivel: 'provincia', refId: 1 },
    { nivel: 'departamento', refId: 10 },   // ya está dentro de la provincia 1
    { nivel: 'localidad', refId: 100 },     // ya está dentro del departamento 10
    { nivel: 'localidad', refId: 200 },
  ], fakeAdmin(PADRON) as never)
  caso('la unión, sin duplicados', orden(r), [100, 101, 110, 200])
  caso('y sin repetidos de verdad', r.length, new Set(r).size)
}

console.log('\n▸ LO QUE JUSTIFICA LA ETAPA — el padrón crece y la zona lo sigue')
{
  const antes = orden(await expandirZonas([{ nivel: 'provincia', refId: 1 }], fakeAdmin(PADRON) as never))
  caso('hoy la provincia 1 tiene 3 localidades', antes, [100, 101, 110])

  // Entra un pueblo nuevo al departamento 11, que es de la provincia 1.
  const crecido = {
    departamentos: PADRON.departamentos,
    localidades: [...PADRON.localidades, { id: 111, departamento_id: 11 }],
  }
  const despues = orden(await expandirZonas([{ nivel: 'provincia', refId: 1 }], fakeAdmin(crecido) as never))
  caso('mañana lo cubre sin que nadie toque nada', despues, [100, 101, 110, 111])

  // CONTROL: así se comportaba el modelo viejo — la lista guardada no cambia.
  const guardadaAyer = [100, 101, 110]
  caso('CONTROL — la lista EXPANDIDA que se guardaba antes no lo cubriría',
    guardadaAyer.includes(111), false)
}

console.log('\n▸ Casos borde')
{
  caso('sin zonas, lista vacía', await expandirZonas([], fakeAdmin(PADRON) as never), [])
  caso('una provincia sin departamentos no rompe',
    await expandirZonas([{ nivel: 'provincia', refId: 99 }], fakeAdmin(PADRON) as never), [])
  caso('un departamento sin localidades tampoco',
    await expandirZonas([{ nivel: 'departamento', refId: 99 }], fakeAdmin(PADRON) as never), [])
  // El que tiene una provincia vacía Y localidades sueltas no pierde las sueltas.
  caso('una provincia vacía no se lleva puestas las sueltas',
    await expandirZonas([
      { nivel: 'provincia', refId: 99 }, { nivel: 'localidad', refId: 200 },
    ], fakeAdmin(PADRON) as never), [200])
}

console.log('\n▸ Un error de la base NO se devuelve como lista vacía')
{
  // Vacío y roto se ven igual río abajo —"no declaró zonas"— y eso es
  // fail-open silencioso: el gondolero vería todas las campañas y nadie se
  // entera. La lib lanza y quien llama decide, enterado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roto: any = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }
  let tiro = false
  try { await expandirZonas([{ nivel: 'provincia', refId: 1 }], roto) } catch { tiro = true }
  caso('lanza en vez de devolver []', tiro, true)
}

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
