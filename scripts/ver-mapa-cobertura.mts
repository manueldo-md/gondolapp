/**
 * ver-mapa-cobertura.mts — qué pintaría el mapa en modo cobertura, con datos reales.
 *
 * SOLO LECTURA. No rinde el componente —el mapa es cliente y necesita tiles—
 * sino que corre la misma cadena que la página: `campanasDe` → `panel_pdv` →
 * `coberturaDeCampana` → `agruparEnMapa` → `repartoDe`, y muestra el reparto de
 * cada grupo a varios zooms.
 *
 *   npx tsx --tsconfig scripts/tsconfig.render.json scripts/ver-mapa-cobertura.mts
 *   … --prod
 *
 * Es lo que contesta la pregunta que el typecheck no puede: **¿el anillo
 * tricolor se dibuja de verdad con estos datos, y a qué zoom?**
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { credencialesDeRef, nombreDeRef } from './lib/entorno.mjs'
import { campanasDe } from '../lib/campanas-de'
import { coberturaDeCampana, mideCobertura } from '../lib/cobertura-mapa'
import { agruparEnMapa, repartoDe, anilloGrupo, textoGrupo, type PuntoMapa } from '../lib/mapa-pdv'

const ref = process.argv.includes('--prod') ? 'xzznzustgsacmfwsupux' : 'mqeymmprvpclpyjpujvf'
const cred = credencialesDeRef(ref) as { vars: Record<string, string> }
const admin = createClient(cred.vars.NEXT_PUBLIC_SUPABASE_URL, cred.vars.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const c = new pg.Client({ connectionString: cred.vars.PGURL, ssl: { rejectUnauthorized: false } })
await c.connect()

console.log(`\n▸ Base: ${nombreDeRef(ref)}`)

const { rows: distris } = await c.query(
  `SELECT id, razon_social FROM distribuidoras ORDER BY razon_social`)

for (const d of distris) {
  const { rows: marcas } = await c.query(
    `SELECT DISTINCT marca_id FROM campanas WHERE distri_id = $1 AND marca_id IS NOT NULL`, [d.id])

  for (const { marca_id } of marcas) {
    const campanas = await campanasDe({ tipo: 'distri-marca', distriId: d.id, marcaId: marca_id }, admin)
    const deSeguimiento = campanas.filter(mideCobertura)
    if (deSeguimiento.length === 0) continue

    for (const ca of deSeguimiento) {
      const { data } = await admin.rpc('panel_pdv', { _campanas: [ca.id] })
      const cobertura = await coberturaDeCampana(ca, admin)

      type Fila = { comercio_id: string; comercio_nombre: string | null; comercio_tipo: string | null
                    lat: number | null; lng: number | null; con_valor: number; verdaderos: number }
      const puntos: PuntoMapa[] = []
      for (const f of (data ?? []) as Fila[]) {
        if (f.lat == null || f.lng == null) continue
        puntos.push({
          id: f.comercio_id,
          nombre: f.comercio_nombre ?? 'Sin nombre',
          lat: f.lat, lng: f.lng,
          presente: Number(f.con_valor) === 0 ? null : Number(f.verdaderos) > 0,
          tipo: f.comercio_tipo,
          cobertura: cobertura.get(f.comercio_id)?.estado ?? null,
          visitasSemana: cobertura.get(f.comercio_id)?.visitas ?? null,
        })
      }
      if (puntos.length === 0) continue

      console.log(`\n── ${String(ca.nombre).slice(0, 52)}   (${ca.visitas_por_semana}/sem · ${puntos.length} PDV)`)
      console.log('   la referencia: ' +
        repartoDe(puntos, 'cobertura').map(x => `${x.cat.etiqueta} ${x.n}`).join(' · '))

      for (const z of [8, 11, 14, 17]) {
        const grupos = agruparEnMapa(puntos, z)
        const conAnillo = grupos.filter(g => anilloGrupo(g, 'cobertura').includes('conic-gradient'))
        const tricolor = grupos.filter(g => repartoDe(g.puntos, 'cobertura').length >= 3)
        console.log(`   z${String(z).padStart(2)}  ${String(grupos.length).padStart(2)} grupos · ` +
          `${conAnillo.length} con anillo · ${tricolor.length} TRICOLOR`)
        for (const g of grupos.filter(g => g.puntos.length > 1).slice(0, 2)) {
          console.log(`         ${textoGrupo(g, 'cobertura')}`)
        }
      }

      // Lo que va a decir la lista del grupo, que es el otro cambio del modo.
      console.log('   la lista del grupo:')
      for (const p of puntos.slice(0, 4)) {
        console.log(`         ${String(p.nombre).slice(0, 30).padEnd(32)} ` +
          `${p.visitasSemana ?? '—'} de ${ca.visitas_por_semana}   (${p.cobertura ?? 'sin dato'})`)
      }
    }
  }
}

await c.end()
console.log()
