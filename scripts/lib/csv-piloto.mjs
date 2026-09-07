// =============================================================================
// csv-piloto.mjs — el CSV del relevamiento Georgalos, desde el repo
// =============================================================================
// Los cuatro scripts de fix leían el CSV de una ruta absoluta en OneDrive:
//
//   C:/Users/manue/OneDrive/LABORAL.OL/Biomega/Georgalos/Reporte Georgalos...csv
//
// Eso hacía que el procedimiento de poblar un ambiente no fuera reproducible
// fuera de esa máquina: clonar el repo no alcanzaba. Ahora el archivo vive en
// data/georgalos-piloto.csv, convertido a UTF-8, y esta función es la única
// que sabe dónde está.
//
// Formato: separador ';', 11 columnas. Los índices que usan los scripts:
//   0 marca temporal   1 vendedor        2 tipo de comercio   3 dirección
//   4 ciudad           5 hay Georgalos   6 foto 1             7 foto 2
//   8 más fotos        9 comentarios    10 email
//
// El original está en latin1; la copia del repo está en UTF-8, así que se lee
// como utf8 y no hace falta convertir nada.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const RUTA_CSV_PILOTO = join(RAIZ, 'data', 'georgalos-piloto.csv')

/** true si el CSV está disponible. Sirve para chequear antes de escribir nada. */
export function hayCsvPiloto() {
  return existsSync(RUTA_CSV_PILOTO)
}

/**
 * Texto completo del CSV, ya decodificado.
 * Corta con mensaje claro si falta, en vez de dejar que reviente el readFileSync.
 */
export function textoCsvPiloto() {
  if (!hayCsvPiloto()) {
    console.error(`\n✗ No se encontró el CSV del piloto en:\n    ${RUTA_CSV_PILOTO}\n`)
    console.error('  Debería estar versionado en el repo. Si falta, algo se borró:')
    console.error('  recuperalo con `git checkout data/georgalos-piloto.csv`.\n')
    process.exit(1)
  }
  return readFileSync(RUTA_CSV_PILOTO, 'utf8')
}

/**
 * Filas de datos ya separadas en columnas, sin el encabezado y sin vacías.
 * Cada script sigue eligiendo qué columnas mirar.
 */
export function filasCsvPiloto() {
  return textoCsvPiloto()
    .split('\n')
    .filter((l) => l.trim())
    .slice(1)
    .map((l) => l.split(';'))
}
