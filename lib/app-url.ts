/**
 * URL pública de la app, para armar links que se mandan por fuera (invitaciones,
 * recuperación de contraseña).
 *
 * POR QUÉ TIRA ERROR EN VEZ DE TENER UN DEFAULT
 *
 * Antes esto estaba repetido en 11 lugares con un fallback a un dominio de
 * producción hardcodeado:
 *
 *   const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gondolapp-delta.vercel.app'
 *
 * Con dos ambientes eso es peligroso: si falta la variable en el deploy de dev,
 * los links de invitación generados desde dev apuntan en silencio a producción,
 * y quien los abra termina vinculándose contra datos reales creyendo que está
 * en dev. No falla, cruza de ambiente sin avisar — que es el peor modo de falla.
 *
 * Un error explícito en el deploy de dev se ve y se arregla en minutos. Un link
 * que manda a producción puede pasar semanas sin que nadie lo note.
 *
 * EN COMPONENTES CLIENTE NO USES ESTO: usá `window.location.origin`, que se
 * adapta solo al ambiente sin depender de ninguna variable. Ver
 * app/auth/recuperar/page.tsx.
 */
export function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL no está definida. Es obligatoria para armar links de ' +
      'invitación: sin ella no hay forma de saber a qué ambiente apuntar. ' +
      'Definila en el proyecto de Vercel correspondiente y en el .env local.'
    )
  }
  return url.replace(/\/+$/, '')
}
