// =============================================================================
// campana.mjs — resolución de la campaña del piloto por nombre
// =============================================================================
// Los scripts de fix del piloto tenían el ID de la campaña hardcodeado. Cuando
// se reconstruyó producción el 7/9/2026 el seed la recreó con un ID nuevo, y
// los scripts pasaron a reportar "Misiones en DB: 0" sin fallar — parecían
// correr bien y no hacían nada.
//
// Resolver por nombre evita que se rompa cada vez que se regenere el seed, y
// cortar con exit(1) evita el peor modo de falla: el silencio.
// =============================================================================

/** Nombre de la campaña del piloto Georgalos, tal como lo crea seed-demo-completo.ts */
export const CAMPANA_PILOTO = 'Relevamiento snacks · Entre Ríos Q1 2026'

/**
 * Devuelve el id de la campaña, o corta el proceso con un mensaje claro.
 * Nunca devuelve null: si no puede resolverla, el script no debe seguir.
 */
export async function resolverCampanaId(db, nombre = CAMPANA_PILOTO) {
  const { data, error } = await db.from('campanas').select('id, nombre').eq('nombre', nombre)

  if (error) {
    console.error(`\n✗ Error consultando campanas: ${error.message}\n`)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.error(`\n✗ No existe ninguna campaña con nombre exacto:\n    "${nombre}"\n`)
    const { data: parecidas } = await db
      .from('campanas')
      .select('id, nombre')
      .ilike('nombre', '%snacks%')
    if (parecidas?.length) {
      console.error('  Campañas parecidas que sí existen:')
      for (const c of parecidas) console.error(`    ${c.id}  ${c.nombre}`)
      console.error('\n  Si el nombre cambió, actualizá CAMPANA_PILOTO en scripts/lib/campana.mjs.')
    } else {
      console.error('  Tampoco hay ninguna campaña que contenga "snacks".')
      console.error('  ¿Corriste seed-demo-completo.ts? ¿Apuntás al proyecto correcto?')
    }
    console.error('')
    process.exit(1)
  }

  if (data.length > 1) {
    console.error(`\n✗ Hay ${data.length} campañas con el mismo nombre "${nombre}":`)
    for (const c of data) console.error(`    ${c.id}`)
    console.error('  Ambiguo — resolvé el duplicado antes de correr esto.\n')
    process.exit(1)
  }

  console.log(`Campaña: "${data[0].nombre}"\n  id: ${data[0].id}`)
  return data[0].id
}
