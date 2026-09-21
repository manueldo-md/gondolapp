'use server'

import { createClient } from '@/lib/supabase/server'
import { validarMinimoComercios } from '@/lib/campana-minimo'
import { validarFechasCampana } from '@/lib/campana-fechas'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoCampana, TipoContenidoBloque } from '@/types'
import { crearNotificacionAdmin } from '@/lib/notificaciones'
import { validarBloqueCampana, parsearCamposBloque, filaBloqueCampo, TIPOS_POR_PANEL } from '@/lib/campana-altas'

const COSTO_CREACION = 15

export async function crearCampana(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId = profile?.marca_id
  if (!marcaId) return { error: 'No tenés una marca asociada.' }

  // El mínimo es obligatorio y no puede superar el tope. Se valida también acá
  // y no solo en el editor: el formulario puede eludirse, y una campaña sin
  // mínimo no tiene con qué decidir si sus resultados son representativos.
  const chequeoMinimo = validarMinimoComercios(
    formData.get('minimo_comercios') as string,
    formData.get('tope_total_comercios') as string
  )
  if (!chequeoMinimo.ok) return { error: chequeoMinimo.error! }

  // Las fechas también en el servidor: el formulario se puede eludir con un POST
  // directo. La base lo respalda con el CHECK campanas_fecha_fin_por_modalidad,
  // pero sin esto el usuario vería un error de constraint de Postgres en vez de
  // una frase que se entienda.
  const chequeoFechas = validarFechasCampana(
    formData.get('fecha_inicio') as string,
    formData.get('fecha_fin') as string,
    // Este editor no ofrece modalidad, así que solo crea campañas puntuales. La
    // columna tiene DEFAULT 'puntual', y acá se dice explícito para que quede
    // claro que es una decisión y no un olvido.
    'puntual'
  )
  if (!chequeoFechas.ok) return { error: chequeoFechas.error! }

  // ── Tipo y bloque, ANTES de insertar la campaña ───────────────────────────
  //
  // El chequeo del bloque corría después del insert, así que un bloque mal
  // configurado dejaba una campaña huérfana —creada, sin bloque y sin forma de
  // completarla— y encima le devolvía un error al usuario, que creía que no se
  // había creado nada.
  //
  // El tipo se valida contra la lista del panel y no se confía en el POST: una
  // marca NO crea campañas de altas de comercios. El alta es infraestructura del
  // canal y la pagan GondolApp y las distribuidoras; el selector ya no la
  // ofrece, y acá se cierra la puerta de atrás.
  const tipo = formData.get('tipo') as TipoCampana
  if (!TIPOS_POR_PANEL.marca.includes(tipo)) {
    return { error: 'Ese tipo de campaña no está disponible para marcas.' }
  }

  const parseo = parsearCamposBloque(formData.get('campos_json') as string | null)
  if (!parseo.ok) return { error: parseo.error }
  const camposValidos = parseo.campos

  const chequeoBloque = validarBloqueCampana({ tipo, campos: camposValidos.length })
  if (!chequeoBloque.ok) return { error: chequeoBloque.error }

  // Verificar tokens
  const { data: marca } = await admin
    .from('marcas')
    .select('tokens_disponibles')
    .eq('id', marcaId)
    .single()

  if ((marca?.tokens_disponibles ?? 0) < COSTO_CREACION) {
    return { error: 'Tokens insuficientes para crear la campaña. Necesitás al menos 15 tokens.' }
  }

  // Actor y vía de ejecución
  const actorCampana = (formData.get('actor_campana') as string) || 'gondolero'
  const viaEjecucion = (formData.get('via_ejecucion') as string) || 'distribuidora'
  const distriId = viaEjecucion === 'distribuidora'
    ? (formData.get('distri_id') as string) || null
    : null
  const repositoraId = viaEjecucion === 'repositora'
    ? (formData.get('repositora_id') as string) || null
    : null

  // Crear campaña
  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                    formData.get('nombre') as string,
      tipo,
      instruccion:               formData.get('instruccion') as string || null,
      puntos_por_mision:         parseInt(formData.get('puntos_por_mision') as string) || 0,
      fecha_inicio:              formData.get('fecha_inicio') as string || null,
      fecha_fin:                 formData.get('fecha_fin') as string || null,
      minimo_comercios:          parseInt(formData.get('minimo_comercios') as string) || null,
      tope_total_comercios:      parseInt(formData.get('tope_total_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar: parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      marca_id:                  marcaId,
      distri_id:                 distriId,
      repositora_id:             repositoraId,
      financiada_por:            'marca',
      estado:                    'pendiente_aprobacion',
      via_ejecucion:             viaEjecucion,
      actor_campana:             actorCampana,
      tokens_creacion:           COSTO_CREACION,
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  const campanaId = campana.id

  const tipoContenido = (formData.get('tipo_contenido') as TipoContenidoBloque) || 'propios'
  const solicitarPrecio = formData.get('solicitar_precio') === 'true'
  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:       campanaId,
    orden:            1,
    instruccion:      (formData.get('instruccion') as string) || '',
    tipo_contenido:   tipoContenido,
    solicitar_precio: solicitarPrecio,
  }).select('id').single()

  if (bloque?.id && camposValidos.length > 0) {
    const { error: errCampos } = await admin.from('bloque_campos').insert(
      camposValidos.map(c => filaBloqueCampo(c, bloque.id, c.orden))
    )
    if (errCampos) console.error('[crearCampana] Error insertando bloque_campos:', errCampos.message)
  }

  // Descontar tokens
  await admin
    .from('marcas')
    .update({ tokens_disponibles: (marca?.tokens_disponibles ?? 0) - COSTO_CREACION })
    .eq('id', marcaId)

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    const { error: errZonas } = await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campanaId, localidad_id }))
    )
    if (errZonas) console.error('[crearCampana] Error insertando campana_localidades:', errZonas.message)
  }

  // Registrar movimiento
  await admin.from('movimientos_tokens').insert({
    actor_id:   marcaId,
    actor_tipo: 'marca',
    tipo:       'consumo',
    monto:      COSTO_CREACION,
    concepto:   `Creación de campaña: ${formData.get('nombre')}`,
    campana_id: campanaId,
  })

  // Crear token de invitación según la vía de ejecución
  if (viaEjecucion === 'distribuidora' && distriId) {
    await admin.from('campana_tokens').insert({
      campana_id: campanaId,
      distri_id:  distriId,
    })
  } else if (viaEjecucion === 'repositora' && repositoraId) {
    await admin.from('campana_tokens').insert({
      campana_id:   campanaId,
      repositora_id: repositoraId,
    })
  }

  // Notificar al admin que hay una campaña nueva pendiente de aprobación
  await crearNotificacionAdmin({
    tipo:        'admin_campana_pendiente',
    titulo:      'Nueva campaña pendiente de aprobación',
    mensaje:     `"${formData.get('nombre')}" fue enviada por una marca.`,
    campanaId:   campanaId,
    linkDestino: `/admin/campanas`,
  })

  revalidatePath('/marca/campanas')
  redirect(`/marca/campanas/${campanaId}`)
}
