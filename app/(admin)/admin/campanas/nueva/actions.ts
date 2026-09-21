'use server'

import { createClient } from '@/lib/supabase/server'
import { validarMinimoComercios } from '@/lib/campana-minimo'
import { validarFechasCampana } from '@/lib/campana-fechas'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { TipoCampana, TipoContenidoBloque } from '@/types'
import {
  esCampanaDeAltas, validarBloqueCampana, parsearCamposBloque, filaBloqueCampo, BLOQUE_ALTAS,
} from '@/lib/campana-altas'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function crearCampanaAdmin(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = adminClient()

  // Verificar que el usuario sea admin
  const { data: profile } = await admin
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .single()

  if (profile?.tipo_actor !== 'admin') {
    return { error: 'No tenés permiso para realizar esta acción.' }
  }

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

  // ── El bloque se valida ANTES de insertar la campaña ──────────────────────
  //
  // Hasta el 17/9/2026 este chequeo corría DESPUÉS del insert, así que un bloque
  // mal configurado dejaba una campaña huérfana —creada, sin bloque y sin forma
  // de completarla desde el editor— y encima le devolvía un error al usuario,
  // que creía que no se había creado nada.
  //
  // Una campaña de ALTAS no lleva campos: el trabajo es el alta y el flujo de
  // captura ni siquiera renderiza el bloque. La regla está en lib/campana-altas.ts.
  const tipo = formData.get('tipo') as TipoCampana
  const esAltas = esCampanaDeAltas(tipo)

  const parseo = parsearCamposBloque(formData.get('campos_json') as string | null)
  if (!parseo.ok) return { error: parseo.error }
  const camposValidos = esAltas ? [] : parseo.campos

  const chequeoBloque = validarBloqueCampana({ tipo, campos: camposValidos.length })
  if (!chequeoBloque.ok) return { error: chequeoBloque.error }

  // Crear campaña
  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                      formData.get('nombre') as string,
      tipo,
      instruccion:                 (formData.get('instruccion') as string) || null,
      puntos_por_mision:           parseInt(formData.get('puntos_por_mision') as string) || 0,
      fecha_inicio:                (formData.get('fecha_inicio') as string) || null,
      fecha_fin:                   (formData.get('fecha_fin') as string) || null,
      minimo_comercios:            parseInt(formData.get('minimo_comercios') as string) || null,
      tope_total_comercios:        parseInt(formData.get('tope_total_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar:   parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      marca_id:                    null,
      distri_id:                   null,
      financiada_por:              'gondolapp',
      estado:                      'activa',
      tokens_creacion:             0,
      actor_campana:               (formData.get('actor_campana') as string) || 'gondolero',
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  const campanaId = campana.id

  // El bloque SÍ va siempre, también en una campaña de altas: `crearComercioNuevo`
  // lo busca por `campana_id` para colgarle la foto de fachada. Lo que no van
  // son los campos.
  const tipoContenido: TipoContenidoBloque = esAltas
    ? BLOQUE_ALTAS.tipoContenido
    : ((formData.get('tipo_contenido') as TipoContenidoBloque) || 'propios')
  const instruccionBloque = esAltas
    ? BLOQUE_ALTAS.instruccion
    : ((formData.get('instruccion') as string) || '')

  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:       campanaId,
    orden:            1,
    instruccion:      instruccionBloque,
    tipo_contenido:   tipoContenido,
  }).select('id').single()

  if (bloque?.id && camposValidos.length > 0) {
    const { error: errCampos } = await admin.from('bloque_campos').insert(
      camposValidos.map(c => filaBloqueCampo(c, bloque.id, c.orden))
    )
    if (errCampos) console.error('[crearCampanaAdmin] Error insertando bloque_campos:', errCampos.message)
  }

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    const { error: errZonas } = await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campanaId, localidad_id }))
    )
    if (errZonas) console.error('[crearCampanaAdmin] Error insertando campana_localidades:', errZonas.message)
  }

  revalidatePath('/admin/campanas')
  redirect('/admin/campanas')
}
