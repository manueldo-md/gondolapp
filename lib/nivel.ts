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

/**
 * Calcula el nivel de un gondolero dinámicamente a partir de sus fotos aprobadas
 * en el mes en curso. Fuente de verdad única para todas las vistas.
 *
 * Regla: Casual = 0–(fotosCasualAActivo-1), Activo = fotosCasualAActivo–(fotosActivoAPro-1), Pro = fotosActivoAPro+
 */
export function calcularNivelMensual(
  fotosAprobadaMes: number,
  fotosCasualAActivo: number,
  fotosActivoAPro: number,
): 'casual' | 'activo' | 'pro' {
  if (fotosAprobadaMes >= fotosActivoAPro) return 'pro'
  if (fotosAprobadaMes >= fotosCasualAActivo) return 'activo'
  return 'casual'
}
