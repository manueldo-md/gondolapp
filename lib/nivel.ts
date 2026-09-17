/**
 * Calcula el nuevo nivel de un gondolero según sus fotos aprobadas y los thresholds configurables.
 * Si el nivel no debe cambiar, devuelve el mismo nivel.
 */
export function calcularNuevoNivel(
  fotosAprobadas: number,
  nivelActual: string,
  fotosCasualAActivo: number,
  fotosActivoAPro: number,
): string {
  // Retroactivo incluido: si tiene suficientes fotos para pro y no es pro, sube directamente
  if (fotosAprobadas >= fotosActivoAPro && nivelActual !== 'pro') {
    return 'pro'
  }
  // Casual → Activo (también cubre el caso retroactivo donde ya tenía el threshold cubierto)
  if (fotosAprobadas >= fotosCasualAActivo && nivelActual === 'casual') {
    return 'activo'
  }
  return nivelActual
}

/*
 * `calcularNivelMensual` vivía acá y se borró el 17/9/2026: contaba FOTOS del
 * mes, y eso dejaba a las campañas de solo preguntas fuera de la progresión.
 * Su reemplazo es `nivelPorMisiones` en lib/nivel-mensual.ts, que cuenta
 * misiones aprobadas.
 *
 * Su docstring decía "Fuente de verdad única para todas las vistas" y era falso:
 * la lista de campañas y los gates nunca la usaron — leen `profiles.nivel`. Esa
 * divergencia sigue abierta, ver CLAUDE.md.
 */
