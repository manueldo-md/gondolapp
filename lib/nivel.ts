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
