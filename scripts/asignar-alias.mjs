/**
 * scripts/asignar-alias.mjs
 *
 * Asigna alias a los gondoleros y fixers que no tengan uno.
 *
 *   npx tsx scripts/asignar-alias.mjs --ref <project-ref>
 *
 * El --ref es obligatorio y no tiene default, igual que en los otros scripts que
 * escriben: el proyecto se declara en el comando, no en un archivo.
 *
 * ES EL EQUIVALENTE DEL BOTÓN "Asignar alias" de /admin/usuarios, para cuando no
 * hay acceso de admin en el ambiente — el caso de dev— o para un ambiente nuevo
 * recién levantado.
 *
 * POR QUÉ NO UN UPDATE A MANO EN SQL: el alias tiene que ser único entre
 * gondoleros, y `generarAlias` lo garantiza chequeando contra los que ya están
 * escritos antes de devolver. Un `UPDATE ... SET alias = <random>` en SQL
 * tendría que replicar esa verificación, y si la hace mal genera repetidos: dos
 * personas con el mismo nombre en el ranking es peor que el problema que
 * arregla. Reutilizar la función es la única forma de que la regla viva en un
 * solo lugar.
 *
 * POR QUÉ IMPORTA EL ALIAS: no es decorativo. El ranking de logros es la única
 * pantalla donde un gondolero ve a otro, y su query excluye `nombre` a
 * propósito. Sin alias, o se ven todos iguales o se filtraría el nombre real.
 * Ver lib/aliases.ts.
 *
 * Reporta asignados y fallidos POR SEPARADO, igual que el botón: una corrida que
 * arregla la mitad y reporta solo los éxitos deja creer que terminó.
 */
import { createClient } from '@supabase/supabase-js'
import { resolverEntorno } from './lib/entorno.mjs'
import { generarAlias } from '../lib/aliases.ts'

const ENTORNO = resolverEntorno(process.argv)

const db = createClient(ENTORNO.url, ENTORNO.serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\n── Asignar alias — ambiente: ${ENTORNO.nombre} ──\n`)

  const { data: sinAlias, error } = await db
    .from('profiles')
    .select('id, nombre, tipo_actor')
    .in('tipo_actor', ['gondolero', 'fixer'])
    .is('alias', null)

  if (error) {
    console.error('No se pudo leer profiles:', error.message)
    process.exit(1)
  }

  if (!sinAlias || sinAlias.length === 0) {
    console.log('  ✓ Todos los gondoleros y fixers ya tienen alias.\n')
    return
  }

  console.log(`  ${sinAlias.length} perfiles sin alias\n`)

  let asignados = 0
  const fallidos = []

  // Secuencial a propósito: generarAlias mira los alias ya escritos para evitar
  // repetidos, así que en paralelo dos perfiles podrían llevarse el mismo.
  for (const perfil of sinAlias) {
    const etiqueta = perfil.nombre || perfil.id
    try {
      const alias = await generarAlias(db)
      const { error: errUpd } = await db
        .from('profiles')
        .update({ alias })
        .eq('id', perfil.id)

      if (errUpd) {
        fallidos.push(`${etiqueta}: ${errUpd.message}`)
      } else {
        asignados++
        console.log(`  ✓ ${etiqueta} → ${alias}`)
      }
    } catch (e) {
      fallidos.push(`${etiqueta}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(`\n  ${asignados} asignados, ${fallidos.length} fallidos`)
  if (fallidos.length > 0) {
    console.log('\n  SIN RESOLVER:')
    for (const f of fallidos) console.log(`    · ${f}`)
    process.exit(1)
  }
  console.log('')
}

main().catch(err => {
  console.error('\nError inesperado:', err)
  process.exit(1)
})
