'use server'
import { getAdmin } from '@/lib/admin-sesion'

import { revalidatePath } from 'next/cache'
import { cambioDeMetricaPermitido } from '@/lib/metricas'


/**
 * Tipifica una pregunta que ya existe, o le saca la métrica.
 *
 * Las reglas viven en `cambioDeMetricaPermitido` y no acá, porque la pantalla
 * tiene que poder deshabilitar el selector con el mismo criterio con el que esta
 * action lo rechaza. Si estuvieran escritas dos veces, la de la pantalla se iba
 * a quedar vieja.
 *
 * Devuelve `{ error }` en vez de lanzar: un rechazo de regla es algo que el
 * admin tiene que LEER —dice cuántas respuestas hay y por qué no se puede— y
 * Next redacta el mensaje de las excepciones en producción.
 */
export async function tipificarPregunta(
  campoId: string,
  metricaId: string | null,
): Promise<{ error?: string }> {
  const admin = await getAdmin()

  const { data: campo, error: errCampo } = await admin
    .from('bloque_campos')
    .select('id, tipo, pregunta, metrica_id')
    .eq('id', campoId)
    .single()

  if (errCampo || !campo) return { error: 'No se encontró la pregunta.' }

  // Se cuenta sobre `mision_respuestas` y no sobre `foto_respuestas`: la segunda
  // es legacy, nadie la escribe ni la lee, y se verificó que sus 47 filas tienen
  // equivalente en la primera con el mismo valor.
  const { count, error: errCount } = await admin
    .from('mision_respuestas')
    .select('id', { count: 'exact', head: true })
    .eq('campo_id', campoId)

  if (errCount) return { error: 'No se pudieron contar las respuestas: ' + errCount.message }

  const permiso = cambioDeMetricaPermitido({
    actual: campo.metrica_id ?? null,
    nueva: metricaId,
    respuestas: count ?? 0,
  })
  if (!permiso.ok) return { error: permiso.motivo }

  // El tipo lo fija la métrica, y el de una pregunta que ya existe no se toca:
  // cambiarlo reinterpretaría las respuestas cargadas. Así que acá la métrica se
  // valida contra el tipo, no al revés. El trigger de la base es la red abajo.
  if (metricaId) {
    const { data: metrica } = await admin
      .from('metricas')
      .select('nombre, tipo_respuesta')
      .eq('id', metricaId)
      .single()

    if (!metrica) return { error: 'Esa métrica no existe.' }
    if (metrica.tipo_respuesta !== campo.tipo) {
      return {
        error: `"${metrica.nombre}" se mide con respuestas de tipo ${metrica.tipo_respuesta} y esta pregunta es ${campo.tipo}.`,
      }
    }
  }

  const { error } = await admin
    .from('bloque_campos')
    .update({ metrica_id: metricaId })
    .eq('id', campoId)

  if (error) return { error: error.message }

  revalidatePath('/admin/metricas')
  return {}
}
