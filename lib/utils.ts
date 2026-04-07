import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TipoActor, NivelGondolero, TipoCampana, EstadoCampana, EstadoFoto, TipoPremio } from '@/types'

// ── TAILWIND ──────────────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── GPS / GEOLOCALIZACIÓN ─────────────────────────────────────────────────────

/**
 * Calcula la distancia en metros entre dos coordenadas GPS
 * usando la fórmula de Haversine.
 */
export function calcularDistanciaMetros(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000 // Radio de la Tierra en metros
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const dPhi = ((lat2 - lat1) * Math.PI) / 180
  const dLambda = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(dLambda / 2) * Math.sin(dLambda / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Verifica si las coordenadas actuales están dentro del radio permitido
 */
export function estaEnRadio(
  latActual: number,
  lngActual: number,
  latObjetivo: number,
  lngObjetivo: number,
  radioMetros: number = 50
): boolean {
  const distancia = calcularDistanciaMetros(latActual, lngActual, latObjetivo, lngObjetivo)
  return distancia <= radioMetros
}

/**
 * Formatea la distancia para mostrar al usuario
 */
export function formatearDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)}m`
  }
  return `${(metros / 1000).toFixed(1)}km`
}

// ── FORMATEO ──────────────────────────────────────────────────────────────────

/**
 * Formatea puntos con separador de miles
 */
export function formatearPuntos(puntos: number): string {
  return new Intl.NumberFormat('es-AR').format(puntos)
}

/**
 * Formatea tokens en USD
 */
export function formatearTokens(tokens: number): string {
  return `U$S ${new Intl.NumberFormat('es-AR').format(tokens)}`
}

/**
 * Formatea una fecha en español argentino
 */
export function formatearFecha(fecha: string | Date, opciones?: Intl.DateTimeFormatOptions): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...opciones,
  }).format(date)
}

/**
 * Formatea fecha y hora
 */
export function formatearFechaHora(fecha: string | Date): string {
  return formatearFecha(fecha, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Tiempo relativo (hace 5 minutos, hace 2 horas, etc.)
 */
export function tiempoRelativo(fecha: string | Date): string {
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha
  const ahora = new Date()
  const diffMs = ahora.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDias = Math.floor(diffHrs / 24)

  if (diffMin < 1) return 'ahora mismo'
  if (diffMin < 60) return `hace ${diffMin} min`
  if (diffHrs < 24) return `hace ${diffHrs} h`
  if (diffDias < 7) return `hace ${diffDias} días`
  return formatearFecha(fecha)
}

/**
 * Días restantes hasta una fecha
 */
export function diasRestantes(fechaFin: string): number {
  const fin = new Date(fechaFin)
  const ahora = new Date()
  const diffMs = fin.getTime() - ahora.getTime()
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

/**
 * Porcentaje de avance redondeado
 */
export function calcularPorcentaje(actual: number, total: number): number {
  if (total === 0) return 0
  return Math.min(100, Math.round((actual / total) * 100))
}

// ── LABELS Y COLORES POR TIPO ─────────────────────────────────────────────────

export function labelTipoActor(tipo: TipoActor): string {
  const labels: Record<TipoActor, string> = {
    gondolero: 'Gondolero',
    fixer: 'Fixer',
    distribuidora: 'Distribuidora',
    marca: 'Marca',
    admin: 'Administrador',
  }
  return labels[tipo]
}

export function labelNivelGondolero(nivel: NivelGondolero): string {
  const labels: Record<NivelGondolero, string> = {
    casual: 'Casual',
    activo: 'Activo',
    pro: 'Pro',
  }
  return labels[nivel]
}

export function labelTipoCampana(tipo: TipoCampana): string {
  const labels: Record<TipoCampana, string> = {
    relevamiento: 'Relevamiento',
    precio: 'Precios',
    cobertura: 'Cobertura',
    pop: 'POP / Exhibición',
    mapa: 'Mapa base',
    comercios: 'Comercios',
    interna: 'Campaña interna',
  }
  return labels[tipo]
}

export function labelEstadoCampana(estado: EstadoCampana): string {
  const labels: Record<EstadoCampana, string> = {
    borrador: 'Borrador',
    pendiente_aprobacion: 'Pendiente aprobación',
    activa: 'Activa',
    pausada: 'Pausada',
    cerrada: 'Cerrada',
    cancelada: 'Cancelada',
    pendiente_cambios: 'Cambios solicitados',
  }
  return labels[estado]
}

export function labelEstadoFoto(estado: EstadoFoto): string {
  const labels: Record<EstadoFoto, string> = {
    pendiente: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    en_revision: 'En revisión',
  }
  return labels[estado]
}

export function labelPremio(premio: TipoPremio): string {
  const labels: Record<TipoPremio, string> = {
    nafta_ypf: 'Nafta YPF',
    giftcard_ml: 'Gift Card Mercado Libre',
    credito_celular: 'Crédito de celular',
    transferencia: 'Transferencia bancaria',
  }
  return labels[premio]
}

// Colores para badges de estado de foto
export function colorEstadoFoto(estado: EstadoFoto): string {
  const colores: Record<EstadoFoto, string> = {
    pendiente: 'bg-amber-100 text-amber-800 border-amber-200',
    aprobada: 'bg-green-100 text-green-800 border-green-200',
    rechazada: 'bg-red-100 text-red-800 border-red-200',
    en_revision: 'bg-blue-100 text-blue-800 border-blue-200',
  }
  return colores[estado]
}

export function colorEstadoCampana(estado: EstadoCampana): string {
  const colores: Record<EstadoCampana, string> = {
    borrador: 'bg-gray-100 text-gray-600 border-gray-200',
    pendiente_aprobacion: 'bg-amber-100 text-amber-800 border-amber-200',
    activa: 'bg-green-100 text-green-800 border-green-200',
    pausada: 'bg-amber-100 text-amber-800 border-amber-200',
    cerrada: 'bg-gray-100 text-gray-600 border-gray-200',
    cancelada: 'bg-red-100 text-red-800 border-red-200',
    pendiente_cambios: 'bg-orange-100 text-orange-800 border-orange-200',
  }
  return colores[estado]
}

// ── FOTOS / IMÁGENES ──────────────────────────────────────────────────────────

/**
 * Genera el path de Storage para una foto
 */
export function generarPathFoto(campanaId: string, gondoleroId: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `campanas/${campanaId}/gondoleros/${gondoleroId}/${timestamp}_${random}.jpg`
}

/**
 * Genera el path de Storage para una foto de fachada
 */
export function generarPathFachada(comercioId: string): string {
  return `fachadas/${comercioId}.jpg`
}

/**
 * Comprime una imagen antes de subirla
 * Target: ~0.25 MB para fotos de góndola (óptimo para IA Vertex Vision)
 */
export async function comprimirImagen(
  blob: Blob,
  maxSizeMB: number = 0.25,
  maxWidth: number = 1024,
  calidadInicial: number = 0.70
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img

      // Redimensionar si es más ancha que maxWidth
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo crear el contexto de canvas'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      // Comprimir iterativamente hasta el tamaño objetivo
      const comprimir = (calidad: number): void => {
        canvas.toBlob(
          (comprimido) => {
            if (!comprimido) {
              reject(new Error('Error al comprimir la imagen'))
              return
            }
            if (comprimido.size / 1024 / 1024 <= maxSizeMB || calidad <= 0.3) {
              resolve(comprimido)
            } else {
              comprimir(calidad - 0.1)
            }
          },
          'image/jpeg',
          calidad
        )
      }

      comprimir(calidadInicial)
    }

    img.onerror = () => reject(new Error('Error al cargar la imagen'))
    img.src = URL.createObjectURL(blob)
  })
}

// ── VALIDACIONES ───────────────────────────────────────────────────────────────

/**
 * Valida un CUIT argentino
 */
export function validarCuit(cuit: string): boolean {
  const cuitLimpio = cuit.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(cuitLimpio)) return false

  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const suma = cuitLimpio
    .slice(0, 10)
    .split('')
    .reduce((acc, digit, i) => acc + parseInt(digit) * multiplicadores[i], 0)

  const resto = suma % 11
  const digitoVerificador = resto < 2 ? resto : 11 - resto

  return parseInt(cuitLimpio[10]) === digitoVerificador
}

/**
 * Formatea un CUIT con guiones
 */
export function formatearCuit(cuit: string): string {
  const limpio = cuit.replace(/\D/g, '')
  if (limpio.length !== 11) return cuit
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`
}

/**
 * Valida un número de celular argentino
 */
export function validarCelular(celular: string): boolean {
  const limpio = celular.replace(/[\s\-\(\)]/g, '')
  // Acepta formatos: +549..., 549..., 9..., 11..., etc.
  return /^(\+54|54)?9?\d{10}$/.test(limpio)
}

// ── DEVICE ID ─────────────────────────────────────────────────────────────────

/**
 * Genera o recupera un device ID único para el dispositivo del gondolero
 * Se persiste en localStorage
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'

  const stored = localStorage.getItem('gondolapp_device_id')
  if (stored) return stored

  const newId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  localStorage.setItem('gondolapp_device_id', newId)
  return newId
}

// ── ERRORES ───────────────────────────────────────────────────────────────────

/**
 * Extrae el mensaje de error de cualquier tipo de error
 */
export function mensajeError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Ocurrió un error inesperado'
}

// ── SUPABASE STORAGE ──────────────────────────────────────────────────────────

/**
 * Obtiene la URL pública de un archivo en Supabase Storage
 */
export function getUrlPublica(
  supabaseUrl: string,
  bucket: string,
  path: string
): string {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}
