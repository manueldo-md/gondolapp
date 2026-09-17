'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { calcularDistanciaMetros } from '@/lib/utils'
import { crearNotificacionDistri, crearNotificacionAdmin } from '@/lib/notificaciones'
import {
  sincronizarComerciosCompletados,
  comerciosTomadosPorGondolero,
} from '@/lib/comercios-relevados'
import { requiereFotoFachada } from '@/lib/campana-altas'
import { puedeRegistrarMision } from '@/lib/campana-vigencia'

/**
 * Comercios que ya tienen una misión viva en esta campaña.
 *
 * Sirve para marcarlos como "Ya relevado" en la lista y que el gondolero no los
 * pueda elegir. Es el control PRINCIPAL: el índice único es la red para el caso
 * raro de dos gondoleros offline, no el lugar donde se enteran. Bloquear recién
 * al enviar significa hacerle sacar la foto y llenar el formulario para después
 * decirle que no.
 *
 * POR QUÉ SERVER ACTION Y NO UNA QUERY DESDE EL BROWSER:
 * la RLS de `misiones` hoy tiene una sola policy, `FOR ALL USING (true)` sin
 * cláusula TO — o sea PUBLIC — así que una query client-side funcionaría. Pero
 * eso es un agujero que está para cerrarse (ver "RLS por fases" en CLAUDE.md), y
 * el día que se cierre la query devolvería solo las misiones propias: los
 * comercios tomados por OTROS gondoleros aparecerían libres. Sin error y sin
 * log, o sea FALLA ABIERTA EN SILENCIO, que es el modo que ya nos mordió con
 * comercios_relevados. Con service role no depende de la RLS.
 *
 * `relevadosPorOtros` va vacío en campañas de seguimiento: ahí un comercio se
 * visita muchas veces a propósito y no hay nada que marcar.
 *
 * ── POR QUÉ UN SOLO PAYLOAD Y NO DOS ACTIONS ────────────────────────────────
 * El cupo propio del gondolero se marca en la MISMA lista y con el mismo
 * mecanismo: un viaje, un cache en IDB, un flag de frescura, un aviso de "lista
 * desactualizada". Toda esa maquinaria ya existe alrededor de esta action y es
 * la parte cara. Una segunda action habría duplicado las cuatro cosas.
 */
export interface EstadoComerciosCampana {
  /** Comercios con una misión viva de CUALQUIER gondolero. Solo campañas puntuales. */
  relevadosPorOtros: string[]
  /** Comercios que ESTE gondolero ya tomó. Siempre puede volver a ellos. */
  misComercios: string[]
  /** `max_comercios_por_gondolero` de la campaña. null = sin tope propio. */
  maxComercios: number | null
}

export async function obtenerEstadoComercios(campanaId: string): Promise<EstadoComerciosCampana> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const vacio: EstadoComerciosCampana = { relevadosPorOtros: [], misComercios: [], maxComercios: null }

  const { data: campana } = await db
    .from('campanas')
    .select('modalidad, max_comercios_por_gondolero')
    .eq('id', campanaId)
    .maybeSingle()

  if (!campana) return vacio

  const { data, error } = await db
    .from('misiones')
    .select('comercio_id, estado, gondolero_id')
    .eq('campana_id', campanaId)

  if (error) {
    console.error('[obtenerEstadoComercios] error:', error.message)
    return vacio
  }

  // El filtro de estado va acá y no en la query a propósito: el índice usa
  // `estado IS DISTINCT FROM 'descartada'`, que INCLUYE las filas con estado
  // NULL (la columna es nullable). Un `.neq('estado','descartada')` en PostgREST
  // las excluiría —lógica de tres valores— y entonces la UI no marcaría un
  // comercio que el índice sí bloquea. El `!==` de JS sobre null da true y
  // reproduce el predicado exacto.
  const vivas = ((data ?? []) as { comercio_id: string | null; estado: string | null; gondolero_id: string }[])
    .filter(m => m.estado !== 'descartada' && m.comercio_id)

  // `misComercios` es lo que consume el cupo, y la regla de qué ocupa cupo vive
  // en UN solo lugar: `comerciosTomadosPorGondolero`. Estaba escrita acá, en el
  // chequeo de servidor del alta y en el flip de la participación, y la tercera
  // copia usaba otro criterio — contaba aprobados en vez de vivos.
  const tomados = await comerciosTomadosPorGondolero(campanaId, user.id, db)

  return {
    // En seguimiento nadie bloquea a nadie: el comercio se visita muchas veces.
    relevadosPorOtros: campana.modalidad === 'puntual'
      ? [...new Set(vivas.map(m => m.comercio_id as string))]
      : [],
    misComercios: [...tomados],
    maxComercios: campana.max_comercios_por_gondolero ?? null,
  }
}

/**
 * Reporte de que un comercio está mal ubicado.
 *
 * Lo manda el gondolero desde el aviso de bloqueo por distancia. Es la única
 * forma que existe de corregir un pin: hasta el 15/9/2026 la app no tenía
 * ninguna, así que un comercio mal ubicado era un problema permanente y el
 * único camino que le quedaba al gondolero era crear uno nuevo — justo lo que
 * ensucia la tabla de comercios.
 *
 * La distancia se recalcula ACÁ contra el pin vigente y no se confía en la que
 * manda el cliente: es el número que va a justificar una corrección más adelante.
 */
export async function reportarUbicacionComercio(params: {
  comercioId: string
  lat: number
  lng: number
}): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any

  const { data: comercio } = await db
    .from('comercios')
    .select('id, nombre, lat, lng')
    .eq('id', params.comercioId)
    .maybeSingle()

  if (!comercio) return { ok: false }

  const distancia = comercio.lat != null && comercio.lng != null
    ? Math.round(calcularDistanciaMetros(params.lat, params.lng, comercio.lat, comercio.lng))
    : null

  const { data: reporte, error } = await db
    .from('comercios_reportes_ubicacion')
    .insert({
      comercio_id:      params.comercioId,
      gondolero_id:     user.id,
      lat:              params.lat,
      lng:              params.lng,
      distancia_metros: distancia,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[reportarUbicacionComercio] error:', error.message)
    return { ok: false }
  }

  console.log('[reportarUbicacionComercio] OK', {
    reporteId: reporte?.id, comercioId: params.comercioId, distancia,
  })

  // ── Aviso ───────────────────────────────────────────────────────────────────
  // A la distribuidora del gondolero que reportó, y SIEMPRE también al admin.
  //
  // Por qué no a todas las distris con misiones en ese comercio: avisarle a
  // todas suena más justo y produce el peor resultado — N destinatarios, cero
  // responsables. Un solo dueño del aviso es lo que hace que alguien actúe.
  //
  // El admin va siempre por dos razones: cubre al gondolero sin distri_id (que
  // CLAUDE.md documenta como frecuente, y que si no dejaría el reporte
  // huérfano), y la calidad del mapa de comercios es el activo de GondolApp.
  //
  // Esto es sobre ATENCIÓN, no sobre permiso: cualquier distribuidora puede
  // corregir cualquier comercio desde el panel, la reciba o no.
  const { data: perfil } = await db
    .from('profiles')
    .select('distri_id, alias, nombre')
    .eq('id', user.id)
    .maybeSingle()

  const quien = perfil?.alias ?? perfil?.nombre ?? 'Un gondolero'
  const cuanto = distancia == null
    ? 'sin coordenadas de referencia'
    : distancia >= 1000 ? `a ${(distancia / 1000).toFixed(1)} km` : `a ${distancia} m`
  const mensaje = `${quien} reportó que "${comercio.nombre}" está mal ubicado: lo encontró ${cuanto} del punto registrado.`
  const link = `/distribuidora/comercios/${params.comercioId}`

  if (perfil?.distri_id) {
    await crearNotificacionDistri(perfil.distri_id, {
      tipo:        'comercio_ubicacion_reportada',
      titulo:      'Comercio mal ubicado',
      mensaje,
      linkDestino: link,
    }).catch(() => { /* el reporte ya está guardado: el aviso no lo bloquea */ })
  }

  await crearNotificacionAdmin({
    tipo:        'comercio_ubicacion_reportada',
    titulo:      'Comercio mal ubicado',
    mensaje,
    linkDestino: link,
  }).catch(() => { /* idem */ })

  return { ok: true }
}

export interface CrearComercioParams {
  campanaId: string
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  telefono?: string | null
  encargado?: string | null
  fachadaStoragePath?: string | null
  fachadaUrl?: string | null
}

// Deduplicación básica: retorna comercios activos en radio 50m
function nombreSimilar(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  // Contiene substring significativo
  if (na.length > 4 && nb.includes(na.slice(0, Math.min(na.length, 6)))) return true
  if (nb.length > 4 && na.includes(nb.slice(0, Math.min(nb.length, 6)))) return true
  return false
}

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) * Math.sin(dLambda / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function crearComercioNuevo(params: CrearComercioParams) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // ── La campaña tiene que estar abierta. La participación NO se mira ──────
  //
  // Hasta el 17/9/2026 acá se exigía `participaciones.estado = 'activa'`, y ese
  // era el gate que rompía: la participación pasaba a 'completada' al cruzar el
  // MÍNIMO, y el gondolero recibía "No tenés una participación activa en esta
  // campaña" con 18 comercios de cupo libre. El estado de la participación no es
  // un permiso — describe cómo le fue, no si puede trabajar.
  //
  // La regla es la que corresponde: **si puede ver la campaña y tiene cupo,
  // puede cargar**. Lo que sí se chequea es lo mismo que chequea
  // `registrarMision`: que la campaña exista, esté activa y no esté vencida.
  // Sin esto el alta quedaba sin ningún control de campaña, porque la
  // participación era el único que había.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campanaAlta } = await (admin as any)
    .from('campanas')
    .select('tipo, estado, fecha_fin')
    .eq('id', params.campanaId)
    .maybeSingle() as { data: { tipo: string | null; estado: string | null; fecha_fin: string | null } | null }

  if (!campanaAlta) {
    return { error: 'Esta campaña ya no existe. Elegí otra de la lista.' }
  }
  if (campanaAlta.estado !== 'activa') {
    return { error: 'Esta campaña ya no está activa y no acepta comercios nuevos.' }
  }

  // El alta exige estar online (la pantalla lo pide antes de llegar acá), así
  // que el momento de captura es ahora: no hay cola offline para este flujo.
  const vigencia = puedeRegistrarMision({ fechaFin: campanaAlta.fecha_fin, capturadoAt: Date.now() })
  if (!vigencia.ok) {
    return { error: `Esta campaña terminó el ${campanaAlta.fecha_fin} y ya no acepta comercios nuevos.` }
  }

  // ── La foto de fachada es obligatoria en una campaña de altas ─────────────
  //
  // Es la única evidencia de que el comercio existe. Sin foto, el alta es una
  // fila en una tabla que nadie puede verificar, y hay puntos de por medio:
  // quien valida decidiría "este comercio existe" mirando un nombre, una
  // dirección y un punto de GPS que eligió el mismo que cobra.
  //
  // En el alta OPORTUNISTA sigue siendo opcional —ver `crearComercioParaCaptura`
  // más abajo—: ahí el gondolero no cobra por el alta y exigírsela es fricción
  // sobre una misión que ya está en curso.
  //
  // El chequeo va en el servidor aunque la pantalla ya lo pida: es la puerta que
  // decide si se paga.
  if (requiereFotoFachada(campanaAlta.tipo) && !params.fachadaUrl) {
    return { error: 'La foto de la fachada es obligatoria: es la evidencia de que el comercio existe.' }
  }

  // ── Cupo propio, chequeado en el servidor ─────────────────────────────────
  //
  // La pantalla ya esconde el botón cuando el cupo está lleno, pero eso es el
  // cliente: la misma guarda tiene que estar acá, como en `registrarMision`. Un
  // cache viejo o una pestaña abierta desde ayer alcanzan para pasarla.
  //
  // Se cuenta con `comerciosTomadosPorGondolero`, la MISMA función que usa la
  // pantalla y que decide el flip de la participación. Si los tres calcularan
  // por su cuenta, la pantalla diría una cosa y el servidor otra — que es la
  // forma de rechazo tardío más difícil de explicar.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campanaCupo } = await (admin as any)
    .from('campanas')
    .select('max_comercios_por_gondolero')
    .eq('id', params.campanaId)
    .maybeSingle() as { data: { max_comercios_por_gondolero: number | null } | null }

  const maxComercios = campanaCupo?.max_comercios_por_gondolero ?? null
  if (maxComercios != null) {
    const ocupados = await comerciosTomadosPorGondolero(params.campanaId, user.id, admin)

    if (ocupados.size >= maxComercios) {
      return {
        error: `Alcanzaste tu máximo de ${maxComercios} comercios en esta campaña. ` +
               'Podés seguir trabajando en los que ya tomaste.',
      }
    }
  }

  // Obtener zona_id
  const { data: zona } = await admin
    .from('zonas')
    .select('id')
    .eq('nombre', 'Entre Ríos')
    .limit(1)
    .maybeSingle()

  let zonaId: string | null = zona?.id ?? null
  if (!zonaId) {
    const { data: primeraZona } = await admin
      .from('zonas')
      .select('id')
      .limit(1)
      .maybeSingle()
    zonaId = primeraZona?.id ?? null
  }

  // Deduplicación por nombre contra los comercios que siguen en juego.
  //
  // Los rechazados quedan afuera: un comercio rechazado por duplicado o por no
  // existir no puede ser el "posible duplicado" de un alta nueva. Si se lo
  // contara, el alta legítima que reemplaza a una rechazada saldría marcada como
  // sospechosa contra la fila que justamente se descartó.
  //
  // El filtro va en JS y no en la query: `comercios.estado` es nullable (DEFAULT
  // 'activo' sin NOT NULL, y el CHECK deja pasar NULL), así que un
  // `.neq('estado','rechazado')` de PostgREST descartaría también las filas con
  // NULL por lógica de tres valores. Hoy no hay ninguna en dev ni en prod, pero
  // el día que aparezca una el comercio se volvería invisible sin que nadie se
  // entere — que es el modo de falla que ya nos mordió dos veces.
  const { data: todosLosComercios } = await admin
    .from('comercios')
    .select('id, nombre, lat, lng, estado')

  const cercanos = ((todosLosComercios ?? []) as { id: string; nombre: string; lat: number | null; lng: number | null; estado: string | null }[])
    .filter(c => c.estado !== 'rechazado')

  // Deduplicación por NOMBRE, sin condicionar a la distancia.
  //
  // Hasta el 15/9/2026 exigía `dist <= 50 && nombreSimilar(...)` y excluía de la
  // query a los que tenían lat/lng nulos. O sea que el control tenía el mismo
  // punto ciego que la lista de cercanos: un comercio cargado con coordenadas
  // imprecisas no aparecía para elegirlo Y tampoco se detectaba como duplicado
  // al crear el nuevo. El gondolero no tenía alternativa, el sistema no tenía
  // forma de notarlo, y el comercio viejo quedaba huérfano para siempre.
  //
  // La distancia ahora desempata, no filtra: entre varios nombres parecidos se
  // prefiere el más cercano, y uno sin coordenadas sigue siendo candidato.
  let posibleDuplicadoId: string | null = null
  let mejorDistancia = Number.POSITIVE_INFINITY
  for (const c of (cercanos ?? []) as { id: string; nombre: string; lat: number | null; lng: number | null }[]) {
    if (!nombreSimilar(params.nombre, c.nombre)) continue
    const dist = c.lat != null && c.lng != null
      ? distanciaMetros(params.lat, params.lng, c.lat, c.lng)
      : Number.POSITIVE_INFINITY
    if (posibleDuplicadoId === null || dist < mejorDistancia) {
      posibleDuplicadoId = c.id
      mejorDistancia = dist
    }
  }

  // Insertar comercio con estado pendiente_validacion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, unknown> = {
    nombre:           params.nombre,
    tipo:             params.tipo,
    direccion:        params.direccion,
    lat:              params.lat,
    lng:              params.lng,
    zona_id:          zonaId,
    registrado_por:   user.id,
    validado:         false,
    estado:           'pendiente_validacion',
    campana_id:       params.campanaId,
  }
  if (params.telefono) insertData.telefono = params.telefono
  if (params.encargado) insertData.encargado = params.encargado
  if (params.fachadaStoragePath) insertData.foto_fachada_url = params.fachadaStoragePath

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comercio, error: errInsert } = await (admin as any)
    .from('comercios')
    .insert(insertData)
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (errInsert || !comercio) {
    return { error: 'No se pudo guardar el comercio: ' + (errInsert?.message ?? 'error desconocido') }
  }

  // Insertar registro en fotos con bounty_estado = 'retenido'
  // Usamos un bloque genérico — primero buscamos, si no hay creamos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bloques } = await (admin as any)
    .from('bloques_foto')
    .select('id')
    .eq('campana_id', params.campanaId)
    .limit(1)

  let bloqueId: string | null = bloques?.[0]?.id ?? null

  if (!bloqueId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nuevoBloque } = await (admin as any)
      .from('bloques_foto')
      .insert({
        campana_id:     params.campanaId,
        orden:          1,
        instruccion:    'Foto de fachada del comercio',
        tipo_contenido: 'ninguno',
      })
      .select('id')
      .single()
    bloqueId = nuevoBloque?.id ?? null
  }

  if (bloqueId && params.fachadaUrl) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('fotos').insert({
      campana_id:            params.campanaId,
      bloque_id:             bloqueId,
      gondolero_id:          user.id,
      comercio_id:           comercio.id,
      url:                   params.fachadaUrl,
      storage_path:          params.fachadaStoragePath ?? '',
      lat:                   params.lat,
      lng:                   params.lng,
      timestamp_dispositivo: new Date().toISOString(),
      device_id:             null,
      declaracion:           'producto_presente',
      estado:                'pendiente',
      puntos_otorgados:      0,
      bounty_estado:         'retenido',
    })
  }

  // El alta NO crea la misión, y eso ahora es a propósito.
  //
  // Hasta el 17/9/2026 este comentario decía "acá arriba se acaba de crear una
  // misión en 'pendiente'". Era falso: no se creaba ninguna, en ningún lado. Por
  // eso `min_comercios_para_cobrar` —que cuenta comercios distintos con misión
  // APROBADA— no podía subir nunca y el gondolero no cobraba el alta jamás.
  //
  // La misión se crea al VALIDAR el comercio, en lib/validacion-comercio.ts. Un
  // comercio sin validar puede ser un duplicado o no existir: crear la misión
  // acá sería prometer un pago sobre trabajo que nadie miró.
  //
  // El recálculo se deja igual: es barato y deja el contador honesto si esta
  // campaña ya tenía comercios validados del gondolero.
  // La participación tiene que EXISTIR para que el alta quede contabilizada —
  // `sincronizarComerciosCompletados` hace un UPDATE, y sobre cero filas no
  // escribe nada ni se queja. Antes la garantizaba el gate que acabamos de
  // sacar. Ahora, si no está, se crea: **no bloquear no puede significar dejar
  // el trabajo sin registrar en el panel de la distribuidora.**
  //
  // Si ya existe no se le toca el estado: que pase a 'completada' es decisión
  // del helper, al alcanzar el máximo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: partExistente } = await (admin as any)
    .from('participaciones')
    .select('id')
    .eq('campana_id', params.campanaId)
    .eq('gondolero_id', user.id)
    .maybeSingle() as { data: { id: string } | null }

  if (!partExistente) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: errPart } = await (admin as any).from('participaciones').insert({
      campana_id: params.campanaId, gondolero_id: user.id, estado: 'activa',
      comercios_completados: 0, puntos_acumulados: 0,
    })
    if (errPart) console.error('[crearComercioNuevo] no se pudo crear la participación:', errPart.message)
  }

  await sincronizarComerciosCompletados(params.campanaId, user.id, admin)

  return {
    comercioId: comercio.id,
    posibleDuplicado: !!posibleDuplicadoId,
    mensaje: posibleDuplicadoId
      ? 'Comercio registrado pero puede ser un duplicado. Será revisado antes de acreditar puntos.'
      : 'Comercio registrado. Tus puntos se acreditarán cuando sea validado.',
  }
}

// Registra un comercio nuevo en el contexto de una captura regular (no campaña COMERCIOS).
// No requiere participación activa en la campaña, no crea foto de fachada en el contexto de la campaña.
export async function crearComercioParaCaptura(params: {
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  fachadaStoragePath?: string | null
  fachadaUrl?: string | null
}): Promise<{ comercioId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener zona_id (primera disponible)
  const { data: zona } = await admin.from('zonas').select('id').limit(1).maybeSingle()
  const zonaId: string | null = zona?.id ?? null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, unknown> = {
    nombre:         params.nombre,
    tipo:           params.tipo,
    direccion:      params.direccion,
    lat:            params.lat,
    lng:            params.lng,
    zona_id:        zonaId,
    registrado_por: user.id,
    validado:       false,
    estado:         'pendiente_validacion',
  }
  // Se guarda el STORAGE PATH, no la URL. Hasta el 17/9/2026 acá iba
  // `params.fachadaUrl` —la URL pública completa— mientras que
  // `crearComercioNuevo` guardaba el path: la misma columna con dos formatos,
  // y las cinco pantallas que la muestran firman asumiendo un path, así que las
  // filas con URL tenían el thumb roto.
  //
  // El path gana porque la URL lleva el dominio del proyecto adentro —un dump de
  // dev restaurado en prod apuntaría al storage del otro ambiente— y porque los
  // buckets son PRIVADOS: la URL `/object/public/…` que se guardaba no servía
  // ni siquiera en su propio ambiente. Ver lib/storage-fotos.ts.
  if (params.fachadaStoragePath) insertData.foto_fachada_url = params.fachadaStoragePath

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: comercio, error } = await (admin as any)
    .from('comercios')
    .insert(insertData)
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !comercio) {
    return { error: 'No se pudo guardar el comercio: ' + (error?.message ?? 'error desconocido') }
  }

  return { comercioId: comercio.id }
}

// Sube una foto de fachada al bucket 'fotos-gondola' bajo la ruta fachadas/{campanaId}/{timestamp}.jpg
export async function subirFotoFachada(formData: FormData): Promise<{ url: string; path: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const file       = formData.get('foto') as File
  const campanaId  = formData.get('campanaId') as string
  if (!file || !campanaId) throw new Error('Faltan datos para subir la foto de fachada.')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const storagePath = `fachadas/${campanaId}/${Date.now()}_${user.id}.jpg`

  const { error } = await admin.storage
    .from('fotos-gondola')
    .upload(storagePath, file, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error('Error al subir la foto de fachada: ' + error.message)

  const { data: urlData } = admin.storage
    .from('fotos-gondola')
    .getPublicUrl(storagePath)

  return { url: urlData.publicUrl, path: storagePath }
}
