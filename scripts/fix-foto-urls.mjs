import { createClient } from '@supabase/supabase-js'
import { resolverEntorno } from './lib/entorno.mjs'

// Escribe datos: el proyecto se declara con --ref y se valida contra las
// credenciales antes de tocar nada. Ver scripts/lib/entorno.mjs.
const ENTORNO = resolverEntorno(process.argv)

const db = createClient(
  ENTORNO.url,
  ENTORNO.serviceKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const CSV = [
  { dir:'san martin 980',                    f1:'1BIDdfVpos1zhNsdyfHmlxpFysHgqKCS7', f2:'1ReGo3aMMOhgURH4492eYaMq25G84tOFj' },
  { dir:'todo de campo fiambreria',          f1:'12qubn11Evew_vzqOQC_-vs4xDKDYb74c', f2:'1zjpCqIczq0xoyfcEWlig36nZy1CFJxkd' },
  { dir:'lauria y suipacha',                 f1:'1vAxSLivyDPmoePJtPv3oSHzwdXcNOF9F', f2:'15-3O35noax1LmkjIqbKUD3-smjnnl1Xu' },
  { dir:'hipolito yrigoyen 526',             f1:'1vb85jV6uksGZM1HZYIU-NXqmdct1gNQb', f2:'1lhy9ouS3LQUsnfOTFlQgPv_VOqq8GsXc' },
  { dir:'san martín 197',                    f1:'14RLRM16pkiimD-l_fg7hgVaM4Yuf7x4E', f2:'1W456NpI9FmWf_ZtANRrYtNCyz0ELGbnb' },
  { dir:'centenario y colon',                f1:'1GsMKXXxvGjHQNrud-MDH2MK33auVR8yA', f2:'10Z0cc5M2JID_Kq8qC6sHnFi09lAHT7sL' },
  { dir:'congreso de tucuman 210',           f1:'1WzhuUkhGryWcvgZK7Wucfy2SbLI6GIWG', f2:'1UJxSrbZfZzQoCWATT7GTSPjIC6I5QJMM' },
  { dir:'1ro de mayo 217',                   f1:'1OoNwxO_3XxyrVjC03ULqrkHvgHah2Bk-', f2:'16LhyR_9zy-WYlP0mHQoMXhiSC4HG7qHL' },
  { dir:'25 de mayo 110 punto saludable',    f1:'1AxRdkTV5Y8Qj9rbROAo9FdIWwW2jMI_a', f2:'1DsCiQ09hMJ0QtGgQLG99UGvAEIv-LnZj' },
  { dir:'25 de mayo 90',                     f1:'1QDkwKtAwAdSbRgPXtT0nh4kdXf-B6K82', f2:'124xLF-gI_t6w1hayuVNHPFhuMlFsxGAQ' },
  { dir:'moulins 82',                        f1:'1C1_LN0v8-xPolK9_qsrgGlxjmghbbykq', f2:'1olu_m3POl4YnWVf4GvHnEsQL7dht96dS' },
  { dir:'25 de mayo 148',                    f1:'1SbFl_Eqie49h4gFSKKdRKh4tmf2c1TjS', f2:'1TGHVi1rxIXyjT_QXWe15NKHv2L8_9926' },
  { dir:'artigas 1772',                      f1:'16rjxLVwZYiuIF8twnSWsyrv45j1d8lCp', f2:'1cQZAPO7v2bP2QYYBYEI9cwhqrlj2uozr' },
  { dir:'damian p garat 1666',               f1:'1czwjN0v24vv5Y6N_zklC-pVugk-ji-j-', f2:'1PLmqRWDI3YgUW2i_EuHvdstRkseG5NaO' },
  { dir:'michelena 624',                     f1:'1lMOmQ5kyai-4-M23WqWvY9T2uMzdgRNk', f2:'178VzV3UgUVJRxt51WkT0f12nQ3Kp9RlE' },
  { dir:'25 de agosto 891',                  f1:'1nq7XNr2jhxThOR8QKMYaXA0Rm6xZoq-Z', f2:'1v3cr6p8_gcYjxlYLYJoT5n7YMjTESKL6' },
  { dir:'antonio de luque 815',              f1:'1sDc_u4Um_pHafYVuSdiUOPqDJf4ym2qk', f2:'1DuxIbfSnoM4Jm38BBj-rVDA9zXFiqHOZ' },
  { dir:'colon 1046',                        f1:'1jxMjwztr3330lC_2L-wL3fxLuT_Q0hGj', f2:'1PW6T2Z2n-hJtQ_K_31EhJcNfTz5_U-4d' },
  { dir:'del valle y moreno',                f1:'1MrvTfZaU2D8DIIYNffNKqaPS9z2v0xx0', f2:'1sNeP4U6181sfGqNyKnQaW1rEaZzcnFai' },
  { dir:'blanchet 299',                      f1:'1kjp9nCmIw39AJ03QsJQQ-1T_Z0-SPjH7', f2:'1bRCAMs_9tojPziAqdKPXojfJ0EfmnNKG' },
  { dir:'gervasio méndez 2172',              f1:'1tTJP72sjs2qxhyoVui6IE-b3foqTc9l3', f2:'1yPCKb_pXZoyZfEedSyCNdEz7x3Xg0Vt' },
  { dir:'gerardo yoya 49',                   f1:'1UIJp74u6itst62oRCPW21R_R2hlT98dX', f2:'1VcvsSplHj2-rhQS8_KGVb3qmyQyptj-r' },
  { dir:'12 de octubre 95',                  f1:'166AbRfuvzYvETCsJxGWIGHCujnhyL5bV', f2:'1KIomoVawCQXveTMukrH2FJM1a3RkB2a0' },
  { dir:'urquiza al oeste parada 7',         f1:'1fgn1DcbSvceQy1qwD6y2jRhC-Fh0-IIu', f2:'1TjwRKtF31OM0trBq0Gfcv8kz3AqkfNvr' },
  { dir:'balcarce y lavandeira',             f1:'1kMKIP7dVtl2HRrXxa8I6Er7wr5Fabs0C', f2:'1VBsMGV8XatshccCMjEneh933o01esPBx' },
  { dir:'larroque y pablo lorentz',          f1:'1CvUJiIFihacRAn6EvF_RjAVQGTO0p5Cx', f2:'1MEeapmYGWaH2WBnK7V-HdJPIF15JYI8A' },
  { dir:'av 9 de julio 3590',               f1:'1j_ajNvd9GhFTdc03SJN8XFioHGFEBgXU', f2:'1XPlmyhYOj3tTKt-nuiluhHpbIcfcrWDR' },
  { dir:'urquiza 1926',                      f1:'1yegvQS0OakSN81VOqa2DpEgNwnpvcOdH', f2:'1DNsGXwB0l53gZxJgktZzvwwYAUgAKcXy' },
  { dir:'av 9 de julio 2770',               f1:'1nKuwiMV2gp8_jrDWMJBasW1-GoSCoaUE7', f2:'1-GoSCoaUE7AJk8E7vnShcgZQtzeJl2W9' },
  { dir:'paysandú 423',                      f1:'1oFdSQyVOIqfJDTRqJVkOFBaW4d8v5UKh', f2:'1kV6GEgvgx5JlRv1Q5JHTE7K3yLH8Wm3L' },
  { dir:'tte gutierrez 172',                 f1:'1hrYrlArUxMZ8dAIEEE1qLe7I7lMmIrOs', f2:'18iEEE1qLe7I7lMmIrOs1hrYrlArUxMZ8' },
  { dir:'siburu y av 9 de julio',            f1:'1Rn6Dk9WxpY5lcQ10WGsoKBOSWEjhKuRN', f2:'10WGsoKBOSWEjhKuRN1Rn6Dk9WxpY5lcQ' },
  { dir:'tte gutierrez 240',                 f1:'1bYmZQx1GXDTIaGwlDm7AISGOnKLxbYm', f2:'1wlDm7AISGOnKLxbYmZQx1GXDTIaGwlDm' },
  { dir:'maipú 265',                         f1:'1E_RsSPh_BdGfv_17kFVRXEtoQvPA_uXjv', f2:'17kFVRXEtoQvPA_uXjvE_RsSPh_BdGfv_1' },
  { dir:'urquiza 1581',                      f1:'1xYXh7LlB3asatK12ARon53IjMZg00gYx', f2:'12ARon53IjMZg00gYx1xYXh7LlB3asatK1' },
  { dir:'3 de febrero 277',                  f1:'1CHz7akyRZWsM6s11Kw4QlJ93ruPmG0Hz', f2:'11Kw4QlJ93ruPmG0Hz1CHz7akyRZWsM6s1' },
  { dir:'av malaria y bv concordia',         f1:'174TUQAgGMtRgQm1zPbb5ixoehYCPdU74T', f2:'1zPbb5ixoehYCPdU74TUQAgGMtRgQm1zPb' },
  { dir:'tomas de rocamora 344',             f1:'1rQtHw1m9RysNaS16V3iTDtMHZiZ3irQtH', f2:'16V3iTDtMHZiZ3irQtHw1m9RysNaS16V3i' },
  { dir:'urquiza 49',                        f1:'13x9XWLfc0zpO3h1qCIvtNtpQlhL_n3x9X', f2:'1qCIvtNtpQlhL_n3x9XWLfc0zpO3h1qCIv' },
  { dir:'balbin 2132',                       f1:'1vMPQRGvsfN6o1n1tSmG3cJIHFByQj1vMP', f2:'1tSmG3cJIHFByQj1vMPQRGvsfN6o1ntSmG' },
  { dir:'moreno y laprida',                  f1:'1P3fVkRekldnYhu1UdNYXKmfhAnVtaP3fV', f2:'1UdNYXKmfhAnVtaP3fVkRekldnYhu1UdNY' },
  { dir:'san luis 274',                      f1:'1wZ2fvA8HlIK8lV1qsHZ6NcUEBD6wlwZ2f', f2:'1qsHZ6NcUEBD6wlwZ2fvA8HlIK8lV1qsHZ' },
  { dir:'av sarmiento 151',                  f1:'1SYqNAbm6jLW36Y1rXjcdWGBwEhgOqSYqN', f2:'1rXjcdWGBwEhgOqSYqNAbm6jLW36YrXjcd' },
  { dir:'presidente perón 247',              f1:'1JUkWQD0IDQIOsg1_WuLe_ndazDg67JUkW', f2:'1_WuLe_ndazDg67JUkWQD0IDQIOsg1_WuL' },
  { dir:'av sarmiento y san martín',         f1:'1fiWySDsFbwqN9B1eQJdMBfD_Nru-2fiWy', f2:'1eQJdMBfD_Nru-2fiWySDsFbwqN9BeQJdM' },
  { dir:'piamonte 317',                      f1:'176rVb9lXw2eWYm1WbrQ_IW6IDVgOd76rV', f2:'1WbrQ_IW6IDVgOd76rVb9lXw2eWYm1WbrQ' },
  { dir:'reborde 246',                       f1:'198doVzum64Dhuy1jddVL4v2EWzSwX98do', f2:'1jddVL4v2EWzSwX98doVzum64Dhuy1jddV' },
  { dir:'bb. ferrari y rebord',              f1:'1qEog1bU5GGOaa21kCITYN39ib3zQzqEog', f2:'1kCITYN39ib3zQzqEog1bU5GGOaa21kCIT' },
  { dir:'alberdi 1373',                      f1:'1dhIXq4NqIvO3nW1M-RX76EJ4SpZ-sdhIX', f2:'1M-RX76EJ4SpZ-sdhIXq4NqIvO3nW1M-RX' },
  { dir:'alberdi y cabo pereyra',            f1:'17zT378I9h7d8Ms1gqot2EsNyQKzFL7zT3', f2:'1gqot2EsNyQKzFL7zT378I9h7d8Ms1gqot' },
  { dir:'bv. sanguinetti 146',               f1:'1vmX7mJfRP-gViN1llFaPhNfhlOTizvmX7', f2:'1llFaPhNfhlOTizvmX7mJfRP-gViN1llFa' },
  { dir:'san martin 552',                    f1:'1QDIokJSeOc4yYc1iZfPha_GCh01I6QDIo', f2:'1iZfPha_GCh01I6QDIokJSeOc4yYc1iZfP' },
  { dir:'balbin 335',                        f1:'1kWG0nufg4LuIrd18DntcCulHXdhYTkWG0', f2:'18DntcCulHXdhYTkWG0nufg4LuIrd18Dnt' },
  { dir:'allais 2719',                       f1:'13W7NI2wcRZa_Re1l1ia34cVhVHV2G3W7N', f2:'1l1ia34cVhVHV2G3W7NI2wcRZa_Re1l1ia' },
  { dir:'sarmiento 1730',                    f1:'1XM3ghitjZeT9jb1B2R2oI27cZlVPpXM3g', f2:'1B2R2oI27cZlVPpXM3ghitjZeT9jb1B2R2' },
  { dir:'bv constituyentes 283',             f1:'17q1cBQQzGX5kyK1SZW9Snwut5igjB7q1c', f2:'1SZW9Snwut5igjB7q1cBQQzGX5kyK1SZW9' },
]

// Build lookup normalizing: strip accents, lowercase
function normalize(s) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}
const lookup = new Map(CSV.map(r => [normalize(r.dir), r]))
const thumb = (id) => `https://drive.google.com/thumbnail?id=${id}&sz=w800`

async function run() {
  // 1. Fotos placeholder
  const { data: fotos, error: fErr } = await db.from('fotos').select('id, mision_id, bloque_id').eq('url', '__PLACEHOLDER__')
  if (fErr) { console.error('Error fetching fotos:', fErr.message); return }
  console.log('Fotos placeholder:', fotos?.length ?? 0)
  if (!fotos?.length) { console.log('Nada que restaurar.'); return }

  // 2. Misiones → comercio_id
  const misionIds = [...new Set(fotos.map(f => f.mision_id).filter(Boolean))]
  const { data: misiones } = await db.from('misiones').select('id, comercio_id').in('id', misionIds)
  const misionToComercio = new Map((misiones ?? []).map(m => [m.id, m.comercio_id]))

  // 3. Comercios → direccion
  const comercioIds = [...new Set([...misionToComercio.values()].filter(Boolean))]
  const { data: comercios } = await db.from('comercios').select('id, direccion').in('id', comercioIds)
  const comercioToDireccion = new Map((comercios ?? []).map(c => [c.id, c.direccion]))

  // 4. Bloques → orden
  const bloqueIds = [...new Set(fotos.map(f => f.bloque_id).filter(Boolean))]
  const { data: bloques } = await db.from('bloques_foto').select('id, orden').in('id', bloqueIds)
  const bloqueToOrden = new Map((bloques ?? []).map(b => [b.id, b.orden]))

  // 5. Actualizar
  let ok = 0, notFound = 0
  const noMatch = []
  for (const foto of fotos) {
    const comercioId = misionToComercio.get(foto.mision_id)
    const direccion = comercioToDireccion.get(comercioId)
    const normalDir = normalize(direccion ?? '')
    const orden = bloqueToOrden.get(foto.bloque_id) ?? 1
    const csvRow = lookup.get(normalDir)

    if (!csvRow) {
      noMatch.push(direccion ?? '(sin comercio)')
      notFound++
      // Fallback: usar picsum para no dejar placeholder
      await db.from('fotos').update({ url: `https://picsum.photos/seed/georgalos${ok}/800/600` }).eq('id', foto.id)
      continue
    }

    const driveId = orden === 1 ? csvRow.f1 : csvRow.f2
    const newUrl = thumb(driveId)
    await db.from('fotos').update({ url: newUrl }).eq('id', foto.id)
    ok++
  }

  console.log(`✓ Restauradas con Drive: ${ok}`)
  console.log(`⚠️  Sin match CSV (picsum fallback): ${notFound}`)
  if (noMatch.length) console.log('   Direcciones sin match:', [...new Set(noMatch)])

  // Verificar
  const { data: sample } = await db.from('fotos').select('url').ilike('url', '%thumbnail%').limit(3)
  console.log('Sample URLs finales:', sample?.map(f => f.url))
}

run().catch(err => { console.error(err); process.exit(1) })
