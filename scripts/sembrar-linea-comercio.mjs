#!/usr/bin/env node
/**
 * scripts/sembrar-linea-comercio.mjs
 * Siembra el caso que la LÍNEA DE TIEMPO DE FOTOS POR COMERCIO necesita para
 * poder mirarse: un comercio visitado durante seis semanas, con la góndola
 * degradándose visita a visita.
 *
 *   node scripts/sembrar-linea-comercio.mjs --ref <project-ref>
 *   node scripts/sembrar-linea-comercio.mjs --ref <project-ref> --limpiar
 *
 * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────────
 * Medido el 24/9/2026: **producción no tiene una sola campaña de seguimiento**,
 * y las cuatro de dev son de prueba. La más grande —`[TEST] Reposición semanal
 * — cobertura`, 5 comercios y 10 misiones— tiene CERO fotos. El único comercio
 * con una línea de verdad es `Dietetica LB`, con 4 visitas… todas entre el 16 y
 * el 17 de septiembre.
 *
 * O sea que no hay un solo dato con el que se pueda ver una degradación en el
 * tiempo, que es lo único que esa pantalla existe para mostrar.
 *
 * ── POR QUÉ UN HERMANO Y NO EXTENDER `sembrar-seguimiento.mjs` ──────────────
 * Ese está afinado para el DASHBOARD DE COBERTURA: las visitas están repartidas
 * para dar los tres estados y hay una puesta el domingo a las 22:00 AR, que es
 * la que falla si alguien se olvida de la zona horaria. Agregarle semanas a un
 * comercio le movería los estados al dashboard que vino a probar. Y no siembra
 * ni una foto, ni una respuesta, ni un bloque: no hay nada que reusar.
 *
 * ── LAS FOTOS VAN A STORAGE, NO COMO URL ────────────────────────────────────
 * Es la decisión que más importa de este script. Hoy, de los 58 PDV de
 * Georgalos en producción, **solo 2 resuelven la foto por Storage**: los otros
 * 56 caen al fallback `fotos.url` (Drive y picsum del seed). O sea que
 * `createSignedUrls` se ejercita sobre dos filas y **el camino firmado se viene
 * quedando sin probar por segunda vez** — ya pasó en la etapa 5 del tramo del
 * mapa.
 *
 * Sembrar con una URL de picsum sería cómodo y dejaría el mismo hueco. Acá se
 * generan PNG de verdad y se suben al bucket, así que la pantalla nueva firma
 * como va a firmar en producción.
 *
 * Por eso `fotos.url` queda en cadena vacía y no con una copia del path: estas
 * filas SÍ tienen objeto en Storage, y un fallback que las tape convertiría un
 * fallo de firma en algo invisible. Si la firma falla, tiene que verse.
 *
 * ── LOS CASOS QUE DEJA SEMBRADOS ────────────────────────────────────────────
 * No son decorativos: cada uno es una rama que las etapas siguientes tienen que
 * poder ejercitar, y ninguno existe hoy en dev ni en prod.
 *
 *   1. SEIS SEMANAS de visitas al mismo comercio, con la góndola cayendo de 22
 *      frentes a 2. Es lo que hace que la línea se pueda MIRAR.
 *   2. Una visita con DOS FOTOS. El 42% de las misiones con foto de producción
 *      dejan dos, así que la unidad de la línea es la visita y no la foto.
 *   3. Una visita con SOLO FOTO PENDIENTE. La foto no es evidencia todavía,
 *      pero la visita se hizo: tiene que aparecer igual, diciendo que está en
 *      revisión. Si desapareciera, la línea tendría un hueco donde hubo trabajo.
 *   4. Una misión DESCARTADA, que no tiene que aparecer en ningún lado.
 *   5. UNA SEGUNDA CAMPAÑA en el medio —una auditoría de precios puntual, sobre
 *      el mismo comercio y el mismo alcance—. La línea mezcla campañas a
 *      propósito, y por eso cada visita lleva el nombre de la suya: si en el
 *      medio de la reposición hubo una auditoría, eso explica por qué esa
 *      semana la foto se ve distinta.
 *   6. Una foto cuyo `created_at` es DIEZ DÍAS POSTERIOR a su `capturada_at`,
 *      que es lo que pasa con una misión que se encoló sin señal. Ordenar por
 *      `created_at` la manda al lugar equivocado de la línea.
 *   7. Un SEGUNDO COMERCIO sin dirección ni localidad, para la cabecera: cuando
 *      falta la dirección no se escribe nada, ni un guión ni un "sin dirección".
 *
 * ── LA GUARDA ───────────────────────────────────────────────────────────────
 * No corre contra producción, y "producción" es todo lo que no sea dev: un ref
 * desconocido se trata como prod, igual que en `scripts/lib/entorno.mjs`. Son
 * datos de prueba con nombre `[TEST]` y no tienen por qué existir allá.
 */
import { createRequire } from 'node:module'
import zlib from 'node:zlib'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const BUCKET = 'fotos-gondola'
const CAMPANA_SEG = '[TEST] Reposición góndola — línea de visitas'
const CAMPANA_AUD = '[TEST] Auditoría de precios — en el medio'
const NOMBRES = [CAMPANA_SEG, CAMPANA_AUD]

const limpiar = process.argv.includes('--limpiar')
const ref = (() => { const i = process.argv.indexOf('--ref'); return i >= 0 ? process.argv[i + 1] : null })()

if (!ref) {
  console.error('\n✗ Falta --ref <project-ref>. Es obligatorio y no tiene default.\n')
  process.exit(2)
}
if (nombreDeRef(ref) !== 'dev') {
  console.error(
    `\n✗ "${ref}" es ${nombreDeRef(ref) === 'DESCONOCIDO' ? 'un proyecto no reconocido (se trata como PRODUCCIÓN)' : 'PRODUCCIÓN'}.` +
    '\n  Este script siembra datos de prueba y no corre ahí. No hay flag que lo habilite.\n')
  process.exit(2)
}

const cred = credencialesDeRef(ref)
if (!cred?.vars.PGURL) { console.error(`\n✗ Sin PGURL para ${ref}\n`); process.exit(2) }

// ─────────────────────────────────────────────────────────────────────────────
// LAS IMÁGENES — PNG a mano, sin dependencias
//
// No alcanza con subir cualquier archivo: la pantalla es una LÍNEA DE TIEMPO, y
// lo que hay que poder ver es que la góndola se vacía. Seis imágenes iguales
// probarían que el firmado anda y no probarían nada de lo que la pantalla dice.
//
// Se dibujan tres estantes con ocho lugares cada uno y se llenan los primeros N,
// con una barra de estado arriba que va de verde a rojo. Cualquiera mira las
// seis en fila y ve la caída sin leer un número.
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo, data) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(data.length)
  const t = Buffer.from(tipo, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([largo, t, data, crc])
}

/** Un lienzo RGB con lo mínimo para dibujar rectángulos. */
function lienzo(ancho, alto, fondo) {
  const px = Buffer.alloc(ancho * alto * 3)
  const rect = (x0, y0, w, h, [r, g, b]) => {
    for (let y = Math.max(0, y0); y < Math.min(alto, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(ancho, x0 + w); x++) {
        const i = (y * ancho + x) * 3
        px[i] = r; px[i + 1] = g; px[i + 2] = b
      }
    }
  }
  rect(0, 0, ancho, alto, fondo)
  return { rect, png: () => aPng(ancho, alto, px) }
}

function aPng(ancho, alto, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ancho, 0)
  ihdr.writeUInt32BE(alto, 4)
  ihdr[8] = 8    // profundidad
  ihdr[9] = 2    // color type 2 = RGB
  // 10, 11, 12 = compresión / filtro / entrelazado, los tres en 0

  // Scanlines con byte de filtro 0 adelante: es el formato crudo que espera
  // zlib dentro del IDAT.
  const fila = 1 + ancho * 3
  const crudo = Buffer.alloc(alto * fila)
  for (let y = 0; y < alto; y++) {
    crudo[y * fila] = 0
    px.copy(crudo, y * fila + 1, y * ancho * 3, (y + 1) * ancho * 3)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── VERTICALES, COMO SALEN DE UN CELULAR ─────────────────────────────────────
// La primera versión las generaba en 480×320, o sea apaisadas, y al rendir la
// pantalla con `ver-linea-comercio.mts` se vio el problema: el recuadro de la
// tarjeta es 3:4 —vertical, porque una foto de góndola se saca con el teléfono
// parado— y `object-cover` recortaba media góndola. El componente estaba bien;
// el fixture no representaba lo que va a haber. Un caso sembrado que no se
// parece al real hace mirar la pantalla equivocada.
const ANCHO = 360, ALTO = 480, CAPACIDAD = 24

/** La góndola con `frentes` productos de los 24 lugares que tiene. */
function fotoGondola(frentes, variante = 0) {
  const l = lienzo(ANCHO, ALTO, [239, 236, 230])

  // La barra de estado: verde llena, roja vacía. Se lee de lejos.
  const proporcion = frentes / CAPACIDAD
  const color = proporcion > 0.6 ? [29, 158, 117] : proporcion > 0.3 ? [217, 145, 32] : [190, 40, 50]
  l.rect(0, 0, Math.round(ANCHO * proporcion), 16, color)

  // La variante es la SEGUNDA foto de la misma visita: otro ángulo del mismo
  // estado. Tiene que verse distinta o no se distinguiría de un duplicado.
  const dx = variante ? 10 : 0

  let puestos = 0
  for (let estante = 0; estante < 4; estante++) {
    const y = 60 + estante * 102
    l.rect(16, y + 78, ANCHO - 32, 10, [139, 111, 71])       // la tabla
    for (let hueco = 0; hueco < 6; hueco++) {
      const x = 20 + dx + hueco * 56
      if (puestos < frentes) {
        l.rect(x, y, 48, 78, [29, 158, 117])                  // producto
        l.rect(x + 9, y + 16, 30, 14, [245, 245, 245])        // la etiqueta
      } else {
        l.rect(x, y + 56, 48, 22, [225, 221, 214])            // hueco vacío
      }
      puestos++
    }
  }
  return l.png()
}

/** La foto de la auditoría: un cartel de precio, que no es una góndola. */
function fotoPrecio() {
  const l = lienzo(ANCHO, ALTO, [239, 236, 230])
  l.rect(0, 0, ANCHO, 16, [79, 70, 229])
  l.rect(50, 120, 260, 240, [252, 252, 252])
  l.rect(50, 120, 260, 56, [217, 145, 32])
  for (let i = 0; i < 5; i++) l.rect(78, 208 + i * 28, 200 - i * 26, 14, [60, 60, 60])
  return l.png()
}

// ─────────────────────────────────────────────────────────────────────────────
// FECHAS — la semana argentina, igual que en sembrar-seguimiento.mjs
// ─────────────────────────────────────────────────────────────────────────────

const FMT_AR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit',
})

/** El lunes de la semana argentina de hoy, como 'YYYY-MM-DD'. */
function lunesDeEstaSemana() {
  const d = new Date(`${FMT_AR.format(new Date())}T12:00:00Z`)
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (dow - 1))
  return FMT_AR.format(d)
}

function sumarDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return FMT_AR.format(d)
}

/** Un instante UTC a partir de un día AR y una hora AR. */
function instante(dia, horaAR) {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + (horaAR + 3) * 3600_000).toISOString()
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const c = new Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
  await c.connect()

  const storage = createClient(
    cred.vars.NEXT_PUBLIC_SUPABASE_URL,
    cred.vars.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ).storage.from(BUCKET)

  console.log(`\n▸ Base: ${nombreDeRef(ref)} (${cred.archivo})`)

  if (limpiar) { await limpiarTodo(c, storage); await c.end(); return }

  const { rows: ya } = await c.query(`SELECT nombre FROM campanas WHERE nombre = ANY($1)`, [NOMBRES])
  if (ya.length > 0) {
    console.log(`\n⊘ Ya existe (${ya.length} de 2 campañas). Corré con --limpiar primero si querés rehacerla.\n`)
    await c.end()
    return
  }

  // ── Insumos: todo tiene que existir ya. Este script no inventa actores ─────
  const { rows: [distri] } = await c.query(
    `SELECT id, razon_social FROM distribuidoras WHERE razon_social LIKE 'Biomega%' LIMIT 1`)
  if (!distri) throw new Error('No hay distribuidora Biomega en esta base.')

  const { rows: [marca] } = await c.query(
    `SELECT id, razon_social FROM marcas WHERE razon_social LIKE 'Georgalos%' LIMIT 1`)
  if (!marca) throw new Error('No hay marca Georgalos en esta base.')

  const { rows: gonds } = await c.query(`
    SELECT p.id, p.nombre, p.alias FROM profiles p
    JOIN gondolero_distri_solicitudes s ON s.gondolero_id = p.id AND s.estado = 'aprobada'
    WHERE p.tipo_actor = 'gondolero' AND s.distri_id = $1 ORDER BY p.alias LIMIT 2`, [distri.id])
  if (gonds.length < 2) throw new Error('Hacen falta al menos 2 gondoleros vinculados a Biomega.')

  // El comercio de la línea: CON dirección y localidad, para la cabecera
  // completa. Y a propósito uno que ya esté en campañas de otros alcances, así
  // la etapa 2 tiene servido el caso de que el filtro por alcance no se cuele.
  const { rows: [comercio] } = await c.query(`
    SELECT co.id, co.nombre, co.lat, co.lng FROM comercios co
     WHERE co.direccion IS NOT NULL AND co.localidad_id IS NOT NULL
       AND co.lat IS NOT NULL AND co.lng IS NOT NULL
       AND co.estado IS DISTINCT FROM 'rechazado'
       AND EXISTS (SELECT 1 FROM misiones mi WHERE mi.comercio_id = co.id)
     ORDER BY co.nombre LIMIT 1`)
  if (!comercio) throw new Error('No encontré un comercio con dirección, localidad y coordenadas.')

  // El segundo: SIN dirección ni localidad, para la cabecera incompleta.
  const { rows: [pelado] } = await c.query(`
    SELECT id, nombre, lat, lng FROM comercios
     WHERE direccion IS NULL AND localidad_id IS NULL
       AND lat IS NOT NULL AND lng IS NOT NULL AND estado IS DISTINCT FROM 'rechazado'
     ORDER BY nombre LIMIT 1`)
  if (!pelado) throw new Error('No encontré un comercio sin dirección ni localidad.')

  const lunes = lunesDeEstaSemana()
  const S = n => sumarDias(lunes, -7 * n)          // el lunes de hace n semanas

  // ── Las dos campañas ──────────────────────────────────────────────────────
  // La de seguimiento no lleva fecha_fin y la puntual sí: lo exige el CHECK
  // campanas_fecha_fin_por_modalidad. La auditoría ya terminó, y está bien que
  // quede vencida — es lo que pasa con una auditoría real.
  const { rows: [seg] } = await c.query(`
    INSERT INTO campanas (nombre, tipo, marca_id, distri_id, financiada_por, via_ejecucion,
                          estado, modalidad, visitas_por_semana, fecha_inicio,
                          puntos_por_mision, min_comercios_para_cobrar, max_comercios_por_gondolero,
                          instruccion, actor_campana)
    VALUES ($1,'relevamiento',$2,$3,'marca','distribuidora','activa','seguimiento',1,$4,
            50, 1, 20, 'Sacá la foto de la góndola y contestá las dos preguntas.', 'gondolero')
    RETURNING id`, [CAMPANA_SEG, marca.id, distri.id, S(5)])

  const { rows: [aud] } = await c.query(`
    INSERT INTO campanas (nombre, tipo, marca_id, distri_id, financiada_por, via_ejecucion,
                          estado, modalidad, fecha_inicio, fecha_fin,
                          puntos_por_mision, min_comercios_para_cobrar, max_comercios_por_gondolero,
                          instruccion, actor_campana)
    VALUES ($1,'precio',$2,$3,'marca','distribuidora','activa','puntual',$4,$5,
            50, 1, 20, 'Foto del cartel de precio.', 'gondolero')
    RETURNING id`, [CAMPANA_AUD, marca.id, distri.id, S(3), sumarDias(S(3), 6)])

  // ── Los bloques y sus campos ──────────────────────────────────────────────
  const campos = {}
  for (const [campanaId, clave, lista] of [
    [seg.id, 'seg', [
      ['foto',    'Foto de la góndola'],
      ['binaria', '¿Está el producto en góndola?'],
      ['numero',  'Frentes visibles'],
    ]],
    [aud.id, 'aud', [
      ['foto',   'Foto del cartel de precio'],
      ['numero', 'Precio exhibido'],
    ]],
  ]) {
    const { rows: [bloque] } = await c.query(
      `INSERT INTO bloques_foto (campana_id, orden, instruccion) VALUES ($1, 1, $2) RETURNING id`,
      [campanaId, lista[0][1]])
    campos[clave] = { bloqueId: bloque.id }
    for (let i = 0; i < lista.length; i++) {
      const { rows: [campo] } = await c.query(
        `INSERT INTO bloque_campos (bloque_id, tipo, pregunta, obligatorio, orden)
         VALUES ($1,$2,$3,true,$4) RETURNING id`,
        [bloque.id, lista[i][0], lista[i][1], i + 1])
      campos[clave][lista[i][0]] = campo.id
    }
  }

  for (const g of gonds) {
    for (const cid of [seg.id, aud.id]) {
      await c.query(
        `INSERT INTO participaciones (campana_id, gondolero_id, estado) VALUES ($1,$2,'activa')`,
        [cid, g.id])
    }
  }

  // ── EL GUION DE LA LÍNEA ──────────────────────────────────────────────────
  // De 22 frentes a 2 en seis semanas. Cada entrada es una visita.
  const guion = [
    // semana, campaña, gondolero, comercio, frentes, fotos, estadoFoto, demoraDias
    { sem: 5, cam: 'seg', g: 0, co: comercio, frentes: 22, fotos: 2, demora: 10 },
    { sem: 4, cam: 'seg', g: 0, co: comercio, frentes: 18, fotos: 1 },
    // La auditoría cae el mismo DÍA que la visita de reposición pero más tarde.
    // Dos campañas tocando el mismo comercio en la misma jornada es un caso
    // real; con la misma hora la línea quedaba con dos puntos empatados y sin
    // orden legible, que es otra cosa y confunde al mirarla.
    { sem: 3, cam: 'aud', g: 1, co: comercio, precio: 4850,  fotos: 1, hora: 15 },
    { sem: 3, cam: 'seg', g: 1, co: comercio, frentes: 14, fotos: 1 },
    { sem: 2, cam: 'seg', g: 0, co: comercio, frentes: 9,  fotos: 1 },
    { sem: 1, cam: 'seg', g: 1, co: comercio, frentes: 5,  fotos: 1 },
    { sem: 0, cam: 'seg', g: 0, co: comercio, frentes: 2,  fotos: 1, estadoFoto: 'pendiente' },
    // El segundo comercio, el de la cabecera sin dirección.
    { sem: 4, cam: 'seg', g: 1, co: pelado, frentes: 16, fotos: 1 },
    { sem: 1, cam: 'seg', g: 1, co: pelado, frentes: 6,  fotos: 1 },
  ]

  const subidas = []
  let nVisitas = 0, nFotos = 0

  for (const v of guion) {
    const campanaId = v.cam === 'seg' ? seg.id : aud.id
    const g = gonds[v.g]
    // Las visitas van el miércoles a las 10 de la mañana, hora argentina. La de
    // esta semana también: si cayera en el futuro, el dashboard de cobertura
    // contaría una visita que todavía no pasó.
    const at = instante(sumarDias(S(v.sem), 2), v.hora ?? 10)

    const { rows: [mision] } = await c.query(`
      INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                            bounty_estado, capturada_at, created_at)
      VALUES ($1,$2,$3,$4,50,$5,$6,$7) RETURNING id`, [
      campanaId, v.co.id, g.id,
      v.estadoFoto === 'pendiente' ? 'pendiente' : 'aprobada',
      v.estadoFoto === 'pendiente' ? 'retenido'  : 'acreditado',
      at,
      // La demora es el caso de la cola offline: la fila entra días después de
      // que se hizo el trabajo. Ordenar por created_at manda esta visita al
      // final de la línea, que es justo el bug que la línea no puede tener.
      v.demora ? instante(sumarDias(S(v.sem), 2 + v.demora), 21) : at,
    ])
    nVisitas++

    const k = campos[v.cam]
    for (let i = 0; i < v.fotos; i++) {
      const png = v.cam === 'aud' ? fotoPrecio() : fotoGondola(v.frentes, i)
      // La misión entra al path. Sin ella colisionan dos visitas de la misma
      // semana, la misma campaña y el mismo gondolero a comercios distintos —
      // que es exactamente lo que pasó la primera vez que corrió esto: 10 filas
      // en `fotos` y 9 objetos en Storage, con dos filas apuntando al mismo.
      const path = `campanas/${campanaId}/gondoleros/${g.id}/${Date.parse(at)}_${mision.id.slice(0, 8)}_${i}_seed.png`

      // `upsert: false` a propósito: si dos fotos vuelven a pisarse, que falle
      // acá y no que la segunda tape a la primera sin decir nada.
      const { error } = await storage.upload(path, png, { contentType: 'image/png', upsert: false })
      if (error) throw new Error(`No se pudo subir ${path}: ${error.message}`)
      subidas.push(path)

      await c.query(`
        INSERT INTO fotos (campana_id, bloque_id, campo_id, gondolero_id, comercio_id,
                           url, storage_path, lat, lng, estado, bounty_estado,
                           mision_id, timestamp_dispositivo, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'',$6,$7,$8,$9,$10,$11,$12,$13,$13)`, [
        campanaId, k.bloqueId, k.foto, g.id, v.co.id,
        path, v.co.lat, v.co.lng,
        v.estadoFoto ?? 'aprobada',
        v.estadoFoto === 'pendiente' ? 'retenido' : 'acreditado',
        mision.id, at,
        v.demora ? instante(sumarDias(S(v.sem), 2 + v.demora), 21) : at,
      ])
      nFotos++
    }

    // Las respuestas. Van con tipos NATIVOS de JS y no convertidas a mano:
    // boolean para binaria y number para numero. Ver la nota del formato de
    // `mision_respuestas.valor` en CLAUDE.md — el seed viejo escribía 'si' y
    // String(n), y eso rompió el panel durante meses.
    const respuestas = v.cam === 'aud'
      ? [[k.numero, v.precio]]
      : [[k.binaria, v.frentes > 0], [k.numero, v.frentes]]

    for (const [campoId, valor] of respuestas) {
      await c.query(
        `INSERT INTO mision_respuestas (mision_id, campo_id, valor, created_at)
         VALUES ($1,$2,$3,$4)`,
        [mision.id, campoId, JSON.stringify(valor), at])
    }
  }

  // ── La descartada, que no tiene que aparecer en ningún lado ───────────────
  await c.query(`
    INSERT INTO misiones (campana_id, comercio_id, gondolero_id, estado, puntos_total,
                          bounty_estado, capturada_at, created_at)
    VALUES ($1,$2,$3,'descartada',50,'anulado',$4,$4)`,
    [seg.id, comercio.id, gonds[0].id, instante(sumarDias(S(2), 5), 16)])

  console.log(`
▸ Sembrado

   campañas    ${CAMPANA_SEG}
               ${CAMPANA_AUD}
   alcance     ${distri.razon_social} ejecutando para ${marca.razon_social}
   comercio    ${comercio.nombre}   (con dirección y localidad)
   segundo     ${pelado.nombre}   (sin dirección ni localidad)
   visitas     ${nVisitas} + 1 descartada
   fotos       ${nFotos}, todas con objeto real en Storage
   ventana     ${sumarDias(S(5), 2)} → ${sumarDias(S(0), 2)}   (las visitas son los miércoles)

   La góndola cae de 22 frentes a 2. En el medio, la auditoría de precios.
   La última visita tiene la foto en 'pendiente': la visita existe, la foto
   todavía no es evidencia.
`)

  await c.end()
}

async function limpiarTodo(c, storage) {
  const { rows: campanas } = await c.query(`SELECT id, nombre FROM campanas WHERE nombre = ANY($1)`, [NOMBRES])
  if (campanas.length === 0) { console.log('\n▸ No hay nada que limpiar.\n'); return }

  const ids = campanas.map(r => r.id)

  // Los objetos de Storage se sacan de la base ANTES de borrar las filas: son
  // los mismos paths que se subieron, sin tener que adivinar el prefijo. Si se
  // borrara primero la base, quedarían huérfanos y --limpiar no dejaría el
  // ambiente como estaba, que es lo único que este flag promete.
  const { rows: fotos } = await c.query(
    `SELECT storage_path FROM fotos WHERE campana_id = ANY($1) AND storage_path <> ''`, [ids])
  const paths = fotos.map(f => f.storage_path)

  let borrados = 0
  if (paths.length > 0) {
    const { data, error } = await storage.remove(paths)
    if (error) throw new Error(`No se pudieron borrar los objetos: ${error.message}`)
    borrados = (data ?? []).length
  }

  const { rowCount: resp } = await c.query(
    `DELETE FROM mision_respuestas WHERE mision_id IN (SELECT id FROM misiones WHERE campana_id = ANY($1))`, [ids])
  const { rowCount: fot } = await c.query(`DELETE FROM fotos WHERE campana_id = ANY($1)`, [ids])
  const { rowCount: mis } = await c.query(`DELETE FROM misiones WHERE campana_id = ANY($1)`, [ids])
  await c.query(`DELETE FROM participaciones WHERE campana_id = ANY($1)`, [ids])
  await c.query(
    `DELETE FROM bloque_campos WHERE bloque_id IN (SELECT id FROM bloques_foto WHERE campana_id = ANY($1))`, [ids])
  await c.query(`DELETE FROM bloques_foto WHERE campana_id = ANY($1)`, [ids])
  await c.query(`DELETE FROM campanas WHERE id = ANY($1)`, [ids])

  console.log(`
▸ Limpiado
   campañas   ${campanas.length}
   misiones   ${mis}
   fotos      ${fot}   (${borrados} objetos borrados de Storage)
   respuestas ${resp}
`)
  if (borrados !== paths.length) {
    console.log(`   ⚠ Se pedían ${paths.length} objetos y Storage confirmó ${borrados}. Revisalo.`)
  }
}

main().catch(e => { console.error(`\n✗ ${e.message}\n`); process.exit(1) })
