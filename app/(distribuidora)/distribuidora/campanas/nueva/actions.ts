'use server'

import { createClient } from '@/lib/supabase/server'
import { validarMinimoComercios } from '@/lib/campana-minimo'
import { validarFechasCampana, type Modalidad } from '@/lib/campana-fechas'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function crearCampanaInterna(formData: FormData) {
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
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id
  if (!distriId) return { error: 'No tenés una distribuidora asociada.' }

  // El mínimo es obligatorio y no puede superar el tope. Se valida también acá
  // y no solo en el editor: el formulario puede eludirse, y una campaña sin
  // mínimo no tiene con qué decidir si sus resultados son representativos.
  const chequeoMinimo = validarMinimoComercios(
    formData.get('minimo_comercios') as string,
    formData.get('tope_total_comercios') as string
  )
  if (!chequeoMinimo.ok) return { error: chequeoMinimo.error! }

  // La modalidad manda: define qué otros campos aplican. Cualquier valor que no
  // sea 'seguimiento' cae a 'puntual', que es el default de la columna — el caso
  // seguro, porque es el que más restricciones tiene.
  const modalidad: Modalidad =
    (formData.get('modalidad') as string) === 'seguimiento' ? 'seguimiento' : 'puntual'
  const esSeguimiento = modalidad === 'seguimiento'

  // Las fechas también en el servidor: el formulario se puede eludir con un POST
  // directo. La base lo respalda con el CHECK campanas_fecha_fin_por_modalidad,
  // pero sin esto el usuario vería un error de constraint de Postgres en vez de
  // una frase que se entienda.
  const chequeoFechas = validarFechasCampana(
    formData.get('fecha_inicio') as string,
    formData.get('fecha_fin') as string,
    modalidad
  )
  if (!chequeoFechas.ok) return { error: chequeoFechas.error! }

  // Las visitas por semana son obligatorias en seguimiento y están prohibidas en
  // puntual. Las dos mitades las respalda la base —
  // campanas_frecuencia_solo_seguimiento y
  // campanas_visitas_obligatorias_seguimiento— y acá se traducen a una frase.
  //
  // No es un campo más: en una campaña de seguimiento la frecuencia ES la
  // definición. Sin ella el gondolero no sabe cada cuánto volver.
  let visitasPorSemana: number | null = null
  if (esSeguimiento) {
    visitasPorSemana = parseInt(formData.get('visitas_por_semana') as string, 10)
    if (!Number.isFinite(visitasPorSemana)) {
      return { error: 'Indicá cuántas visitas por semana espera la campaña.' }
    }
    if (visitasPorSemana < 1 || visitasPorSemana > 14) {
      return { error: 'Las visitas por semana tienen que estar entre 1 y 14.' }
    }
  }

  const { data: campana, error: errCampana } = await admin
    .from('campanas')
    .insert({
      nombre:                      formData.get('nombre') as string,
      tipo:                        'interna',
      instruccion:                 (formData.get('instruccion') as string) || null,
      puntos_por_mision:           parseInt(formData.get('puntos_por_mision') as string) || 0,
      modalidad,
      fecha_inicio:                (formData.get('fecha_inicio') as string) || null,
      // En seguimiento se fuerzan a null en vez de confiar en que el formulario
      // los haya limpiado: el POST se puede armar a mano, y acá un valor de más
      // sería un error de constraint crudo en la cara del usuario.
      fecha_fin:                   esSeguimiento ? null : ((formData.get('fecha_fin') as string) || null),
      tope_total_comercios:        esSeguimiento ? null : (parseInt(formData.get('tope_total_comercios') as string) || null),
      visitas_por_semana:          visitasPorSemana,
      minimo_comercios:            parseInt(formData.get('minimo_comercios') as string) || null,
      max_comercios_por_gondolero: parseInt(formData.get('max_comercios_por_gondolero') as string) || 20,
      min_comercios_para_cobrar:   parseInt(formData.get('min_comercios_para_cobrar') as string) || 3,
      distri_id:                   distriId,
      financiada_por:              'distri',
      estado:                      'activa',
      tokens_creacion:             0,
      actor_campana:               (formData.get('actor_campana') as string) || 'gondolero',
    })
    .select('id')
    .single()

  if (errCampana) return { error: errCampana.message }

  // Guardar zonas de la campaña (nuevo sistema de localidades)
  const localidadIds = formData.getAll('localidad_ids').map(Number).filter(Boolean)
  if (localidadIds.length > 0) {
    const { error: errZonas } = await admin.from('campana_localidades').insert(
      localidadIds.map(localidad_id => ({ campana_id: campana.id, localidad_id }))
    )
    if (errZonas) console.error('[crearCampanaInterna] Error insertando campana_localidades:', errZonas.message)
  }

  // Crear bloque con sus campos (se requiere al menos un campo)
  const camposJson = formData.get('campos_json') as string | null
  let camposValidos: { tipo: string; pregunta: string; opciones: string[]; obligatorio: boolean; orden: number }[] = []
  if (camposJson) {
    try {
      const parsed = JSON.parse(camposJson) as typeof camposValidos
      camposValidos = parsed.filter(c => c.tipo === 'foto' || c.pregunta.trim())
    } catch { /* inválido */ }
  }
  if (camposValidos.length === 0) return { error: 'El bloque debe tener al menos un campo configurado.' }

  const tipoContenido = (formData.get('tipo_contenido') as string) || 'propios'
  const solicitarPrecio = formData.get('solicitar_precio') === 'true'
  const { data: bloque } = await admin.from('bloques_foto').insert({
    campana_id:       campana.id,
    orden:            1,
    instruccion:      (formData.get('instruccion') as string) || '',
    tipo_contenido:   tipoContenido,
    solicitar_precio: solicitarPrecio,
  }).select('id').single()

  if (bloque?.id) {
    const { error: errCampos } = await admin.from('bloque_campos').insert(
      camposValidos.map(c => ({
        bloque_id:   bloque.id,
        tipo:        c.tipo,
        pregunta:    c.pregunta.trim() || (c.tipo === 'foto' ? 'Fotografiá el producto' : ''),
        opciones:    c.opciones.filter(Boolean).length > 0 ? c.opciones.filter(Boolean) : null,
        obligatorio: c.obligatorio,
        orden:       c.orden,
      }))
    )
    if (errCampos) console.error('[crearCampanaInterna] Error insertando bloque_campos:', errCampos.message)
  }

  revalidatePath('/distribuidora/campanas')
  redirect('/distribuidora/campanas')
}
