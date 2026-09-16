/**
 * scripts/escrituras-sin-chequear.js
 *
 * Inventaria las escrituras a Supabase que NO chequean el error devuelto.
 *
 *   node scripts/escrituras-sin-chequear.js
 *
 * POR QUÉ EXISTE: supabase-js no lanza excepción ante un error de Postgres, lo
 * devuelve en `.error` del resultado. Entonces `await admin.from(t).insert(x)`
 * falla en silencio: sin excepción, sin log, sin rastro, y el código sigue como
 * si hubiera funcionado. El 16/9/2026 eso dejó 3 misiones survey-only trabadas
 * en dev, y tenía al débito del canje sin chequear —premio gratis si fallaba—.
 *
 * LA HEURÍSTICA: un statement que arranca con `await` pelado (sin `const {...} =`
 * adelante) y contiene .insert( / .update( / .upsert(. Si el resultado se
 * captura, se asume que alguien mira el error; no verifica que efectivamente lo
 * mire, así que el número es un PISO. `retirarFoto`, por ejemplo, captura
 * `movError` y solo lo pasa por console.log.
 *
 * Correrlo después de cada tramo para medir el avance. Ver CLAUDE.md,
 * "138 escrituras que no chequean el error".
 */
const fs = require('fs'), path = require('path')
const ROOT = path.resolve(__dirname, '..')
const DIRS = ['app', 'lib']
const files = []
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p) }
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
  }
}
for (const d of DIRS) walk(path.join(ROOT, d))

const CRITICO = /puntos|bounty|movimientos_puntos|canje|misiones|participacion|premio|saldo|fotos|comercios_relevados/i
const MUTACION = /\.(update|insert|upsert)\(/

const hallazgos = []
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const lines = src.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!MUTACION.test(lines[i])) continue

    // Subir hasta el comienzo del statement: la primera linea hacia atras que
    // arranque con const/let/var/return/await.
    let start = i
    while (start > 0 && !/^\s*(const|let|var|return|await)\s/.test(lines[start])) start--
    const head = lines[start]
    const bloque = lines.slice(start, i + 1).join(' ')

    // Captura el resultado si arranca con const/let/var/return.
    const captura = /^\s*(const|let|var|return)\s/.test(head)
    if (captura) continue

    // await pelado: nadie mira el .error
    if (!/^\s*await\s/.test(head)) continue

    const rel = path.relative(ROOT, f).split(path.sep).join('/')
    const op = (lines[i].match(MUTACION) || [''])[0].replace(/[.(]/g, '')
    const tabla = (bloque.match(/from\(['"]([a-z_]+)['"]\)/) || [])[1] || '?'
    hallazgos.push({
      rel, linea: start + 1, op, tabla,
      critico: CRITICO.test(bloque) || CRITICO.test(tabla),
      contexto: bloque.replace(/\s+/g, ' ').trim().slice(0, 100),
    })
  }
}

hallazgos.sort((a, b) => (b.critico - a.critico) || a.rel.localeCompare(b.rel) || a.linea - b.linea)
const crit = hallazgos.filter(h => h.critico)
const resto = hallazgos.filter(h => !h.critico)
console.log('TOTAL sin chequear:', hallazgos.length, '| criticos:', crit.length, '| resto:', resto.length)
console.log('')
console.log('=== POR TABLA (criticos) ===')
const porTabla = {}
for (const h of crit) porTabla[h.tabla] = (porTabla[h.tabla] || 0) + 1
for (const [k, v] of Object.entries(porTabla).sort((a, b) => b[1] - a[1])) console.log(v + '\t' + k)
console.log('')
console.log('=== CRITICOS, uno por linea ===')
for (const h of crit) console.log(h.rel + ':' + h.linea + '  [' + h.op + ' ' + h.tabla + ']')
console.log('')
console.log('=== RESTO, por archivo ===')
const porArchivo = {}
for (const h of resto) porArchivo[h.rel] = (porArchivo[h.rel] || 0) + 1
for (const [k, v] of Object.entries(porArchivo).sort((a, b) => b[1] - a[1])) console.log(v + '\t' + k)
