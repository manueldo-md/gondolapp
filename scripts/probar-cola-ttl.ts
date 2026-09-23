/**
 * probar-cola-ttl.ts — SOLO LÓGICA, sin base y sin IndexedDB.
 *
 * ESTE ARCHIVO EXISTE PARA QUE FALLE SI LA COLA VUELVE A DEPENDER DE UN EVENTO.
 *
 * El bug del 24/9/2026: el único disparador automático del drenaje era el
 * evento `'online'`. Un evento SE PIERDE — si la señal vuelve mientras el
 * navegador tiene la pestaña congelada en segundo plano, ese evento no llega a
 * nadie y no se vuelve a emitir al despertar. El gondolero podía pasar el día
 * entero con misiones sin subir, leyendo "se enviará automáticamente".
 *
 * Lo que este archivo protege:
 *
 *   1. LA CONDICIÓN ES DE ESTADO. `debeDrenar` no sabe qué evento la llamó, y
 *      no tiene que saberlo: se le pregunta si hay cola y si hay red. Si algún
 *      día alguien le agrega un parámetro `evento`, este test estorba, que es
 *      exactamente para lo que está.
 *
 *   2. LOS TRES NÚMEROS SON UNO. El TTL del cliente y el tope anti-falseo del
 *      servidor son la misma regla desde los dos lados. Si se separan, la cola
 *      guarda misiones que el servidor rechaza por viejas: trabajo hecho,
 *      conservado, y muerto al llegar.
 *
 *   3. UN RECHAZO DEFINITIVO NO VENCE. Es el único registro de que el gondolero
 *      trabajó y de por qué no le sirvió; borrárselo nosotros le saca la
 *      posibilidad de reclamar.
 *
 *   npx tsx scripts/probar-cola-ttl.ts
 */
import {
  venceEnCola, debeDrenar, DIAS_TTL_COLA, MS_TTL_COLA,
  type EntradaConTTL,
} from '../lib/cola-ttl'
import { DIAS_GRACIA_COLA, puedeRegistrarMision } from '../lib/campana-vigencia'
import { readFileSync } from 'fs'

let fallos = 0
function caso(nombre: string, real: unknown, esperado: unknown) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) fallos++
  console.log(`   ${ok ? '✓' : '✗'}  ${nombre}`)
  if (!ok) console.log(`       esperaba ${JSON.stringify(esperado)} y dio ${JSON.stringify(real)}`)
}

const AHORA = Date.parse('2026-09-24T15:00:00.000Z')
const haceDias = (d: number) => AHORA - d * 86_400_000
const entrada = (p: Partial<EntradaConTTL>): EntradaConTTL =>
  ({ guardadaAt: AHORA, estado: 'pendiente', ...p })

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ LA CONDICIÓN ES DE ESTADO, NO DE EVENTO')
// `debeDrenar` no recibe ningún evento y no tiene que recibirlo. La misma
// pregunta, hecha en cualquier momento, da la misma respuesta — que es lo que
// hace que no importe cuántos 'online' se hayan perdido mientras tanto.
caso('hay cola y hay red: se drena',
  debeDrenar({ hayCola: true, online: true }), true)
caso('hay cola y NO hay red: no se intenta',
  debeDrenar({ hayCola: true, online: false }), false)
caso('no hay cola: no se hace nada aunque haya red',
  debeDrenar({ hayCola: false, online: true }), false)
caso('ni cola ni red', debeDrenar({ hayCola: false, online: false }), false)

console.log('\n▸ CONTROL — la respuesta no depende de cuántas veces se pregunte')
// El caso que describe el bug: el evento se perdió, la app vuelve al frente y
// se pregunta de nuevo. El estado es el mismo, así que la respuesta también.
{
  const estado = { hayCola: true, online: true }
  caso('tres preguntas seguidas dan lo mismo',
    [debeDrenar(estado), debeDrenar(estado), debeDrenar(estado)], [true, true, true])
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ LOS TRES NÚMEROS SON UNO SOLO')
caso('el TTL son 7 días', DIAS_TTL_COLA, 7)
caso('y en milisegundos', MS_TTL_COLA, 7 * 86_400_000)
caso('el tope anti-falseo del SERVIDOR vale lo mismo',
  DIAS_GRACIA_COLA, DIAS_TTL_COLA)

// ── OJO: EL CONTROL DE ARRIBA NO ALCANZA, Y ESTE ES EL QUE IMPORTA ──────────
// Comparar los dos valores da verde también si alguien vuelve a escribir
// `DIAS_GRACIA_COLA = 7` a mano: hoy son iguales, y el test no distingue
// "sale del mismo lugar" de "da lo mismo por ahora". El daño aparece recién el
// día que uno de los dos cambie, que es justo cuando ya nadie está mirando.
//
// Así que se lee la FUENTE. Es la misma técnica que scripts/probar-sw-rutas.mjs
// y por el mismo motivo: hay propiedades del código que un valor no expresa.
{
  const fuente = readFileSync('lib/campana-vigencia.ts', 'utf8')
  const linea = fuente.match(/export const DIAS_GRACIA_COLA\s*=\s*([^\n]+)/)
  caso('CONTROL — y no es un número escrito a mano',
    linea?.[1].trim(), 'DIAS_TTL_COLA')
}

console.log('\n▸ Y el gate del servidor acompaña al TTL en el borde')
// El discriminador: una captura de exactamente el último día del TTL tiene que
// seguir entrando, y una de un día más tiene que rebotar. Si los dos números se
// separan, una de estas dos se cae.
{
  const campanaAbierta = { fechaFin: '2026-12-31', ahora: new Date(AHORA) }
  caso(`captura de hace ${DIAS_TTL_COLA} días: entra`,
    puedeRegistrarMision({ ...campanaAbierta, capturadoAt: haceDias(DIAS_TTL_COLA) }),
    { ok: true })
  caso(`captura de hace ${DIAS_TTL_COLA + 1} días: rebota por vieja`,
    puedeRegistrarMision({ ...campanaAbierta, capturadoAt: haceDias(DIAS_TTL_COLA + 1) }),
    { ok: false, motivo: 'captura_muy_vieja' })
  // La otra mitad: lo que el TTL todavía guarda, el servidor todavía lo acepta.
  caso('CONTROL — lo que NO venció en la cola, el servidor lo acepta',
    puedeRegistrarMision({
      ...campanaAbierta,
      capturadoAt: haceDias(DIAS_TTL_COLA) + 1,   // un ms antes de vencer
    }).ok,
    !venceEnCola(entrada({ guardadaAt: haceDias(DIAS_TTL_COLA) + 1 }), AHORA) ? true : false)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▸ EL BORDE DEL TTL')
caso('recién guardada: no vence', venceEnCola(entrada({}), AHORA), false)
caso('a los 6 días: no vence',
  venceEnCola(entrada({ guardadaAt: haceDias(6) }), AHORA), false)
caso('a los 7 justos: TODAVÍA no vence',
  venceEnCola(entrada({ guardadaAt: haceDias(7) }), AHORA), false)
caso('un milisegundo después de los 7: vence',
  venceEnCola(entrada({ guardadaAt: haceDias(7) - 1 }), AHORA), true)
caso('a los 8: vence', venceEnCola(entrada({ guardadaAt: haceDias(8) }), AHORA), true)

console.log('\n▸ UN RECHAZO DEFINITIVO NO VENCE NUNCA')
// Es lo único que le queda al gondolero como constancia de ese trabajo. El TTL
// existe para que la cola no crezca sola, y una misión que nadie va a reintentar
// no la hace crecer.
caso('rechazo definitivo de hace 8 días: se queda',
  venceEnCola(entrada({ guardadaAt: haceDias(8), estado: 'rechazada', codigoRechazo: 'campana_vencida' }), AHORA),
  false)
caso('de hace 100 días: se queda igual',
  venceEnCola(entrada({ guardadaAt: haceDias(100), estado: 'rechazada', codigoRechazo: 'comercio_duplicado' }), AHORA),
  false)
caso('CONTROL — pero un rechazo REINTENTABLE sí vence',
  venceEnCola(entrada({ guardadaAt: haceDias(8), estado: 'rechazada', codigoRechazo: 'cupo_propio_lleno' }), AHORA),
  true)
caso('y una rechazada SIN código vence, porque falla abierto',
  venceEnCola(entrada({ guardadaAt: haceDias(8), estado: 'rechazada' }), AHORA),
  true)

console.log('\n▸ CONTROL — el TTL no se adelanta por estar rechazada')
caso('una rechazada definitiva de hoy tampoco vence',
  venceEnCola(entrada({ estado: 'rechazada', codigoRechazo: 'campana_vencida' }), AHORA), false)
caso('y una pendiente vieja vence aunque nunca se haya intentado',
  venceEnCola(entrada({ guardadaAt: haceDias(30) }), AHORA), true)

console.log(fallos ? `\n✗ ${fallos} mal\n` : '\n✓ Todo como se esperaba.\n')
process.exitCode = fallos ? 1 : 0
