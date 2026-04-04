'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, MapPin, Camera, CheckCircle2, XCircle,
  RefreshCw, Navigation, Loader2, Star, AlertTriangle, WifiOff,
} from 'lucide-react'
import { get, set } from 'idb-keyval'
import { createClient } from '@/lib/supabase/client'
import {
  calcularDistanciaMetros,
  formatearDistancia,
  comprimirImagen,
  generarPathFoto,
  getDeviceId,
  formatearPuntos,
} from '@/lib/utils'
import { useGPS, useOfflineQueue } from '@/lib/hooks'
import { registrarFoto, subirFoto, asegurarBloqueGenerico, obtenerConfigCompresion } from './actions'
import { crearComercioNuevo, subirFotoFachada } from './actions-comercios'
import type { ConfigCompresion } from '@/lib/config'
import { BotonReportarError } from '@/components/shared/boton-reportar-error'
import type { TipoComercio } from '@/types'

interface ComercioTempItem {
  tempId: string
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  timestamp: number
}

const COMERCIOS_CACHE_KEY = 'comercios_cache'
const COMERCIOS_PENDIENTES_KEY = 'comercios_pendientes'
const CAMPANA_CACHE_PREFIX = 'campana_cache_'

// ── Blur detection ────────────────────────────────────────────────────────────
const BLUR_THRESHOLD = typeof window !== 'undefined' &&
  /Android|iPhone|iPad/i.test(navigator.userAgent)
  ? 800  // móvil — calibrado con datos reales
  : 50   // desktop

function calcularBlurScore(imageData: ImageData): number {
  const { data, width, height } = imageData
  let sum = 0, count = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx   = (y * width + x) * 4
      const tIdx  = ((y - 1) * width + x) * 4
      const bIdx  = ((y + 1) * width + x) * 4
      const lIdx  = (y * width + (x - 1)) * 4
      const rIdx  = (y * width + (x + 1)) * 4
      const gray   = 0.299 * data[idx]  + 0.587 * data[idx  + 1] + 0.114 * data[idx  + 2]
      const top    = 0.299 * data[tIdx] + 0.587 * data[tIdx + 1] + 0.114 * data[tIdx + 2]
      const bottom = 0.299 * data[bIdx] + 0.587 * data[bIdx + 1] + 0.114 * data[bIdx + 2]
      const left   = 0.299 * data[lIdx] + 0.587 * data[lIdx + 1] + 0.114 * data[lIdx + 2]
      const right  = 0.299 * data[rIdx] + 0.587 * data[rIdx + 1] + 0.114 * data[rIdx + 2]
      const laplacian = 4 * gray - top - bottom - left - right
      sum += laplacian * laplacian
      count++
    }
  }
  return sum / count
}

function calcularBlur(blob: Blob): Promise<number> {
  return new Promise(resolve => {
    const img = new window.Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(200 / img.width, 200 / img.height)
      canvas.width  = Math.max(3, Math.floor(img.width  * scale))
      canvas.height = Math.max(3, Math.floor(img.height * scale))
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      console.log('Imagen cargada en canvas:', canvas.width, 'x', canvas.height)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const score = calcularBlurScore(imageData)
      console.log('Blur score calculado:', score, '| Threshold:', BLUR_THRESHOLD)
      resolve(score)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(999) }
    img.src = url
  })
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Paso = 'comercio' | 'gps' | 'camara' | 'blur-advertencia' | 'declaracion' | 'formulario' | 'confirmacion' | 'exito' | 'exito-offline'
  | 'comercios-gps' | 'comercios-existente' | 'comercios-formulario' | 'comercios-fachada' | 'comercios-exito'
type Declaracion = 'producto_presente' | 'producto_no_encontrado' | 'solo_competencia'

interface ComercioRow {
  id: string
  nombre: string
  direccion: string | null
  lat: number
  lng: number
  tipo: string
  validado: boolean
}

interface CampoBloque {
  id: string
  tipo: 'seleccion_multiple' | 'seleccion_unica' | 'binaria' | 'numero' | 'texto'
  pregunta: string
  opciones: string[] | null
  obligatorio: boolean
  orden: number
}

interface CampanaData {
  id: string
  nombre: string
  tipo: string
  puntos_por_foto: number
  primerBloqueId: string | null
  tipoContenido: string
  bloqueInstruccion: string
  bloqueSolicitarPrecio: boolean
  campos: CampoBloque[]
}

const TIPOS_COMERCIO: { value: TipoComercio; label: string; emoji: string }[] = [
  { value: 'almacen',      label: 'Almacén',      emoji: '🧺' },
  { value: 'kiosco',       label: 'Kiosco',        emoji: '🗞️' },
  { value: 'autoservicio', label: 'Autoservicio', emoji: '🏪' },
  { value: 'otro',         label: 'Otro',          emoji: '🏬' },
]

// ── Componente cámara (ciclo de vida propio) ──────────────────────────────────

function PasoCamara({
  onCaptura,
  onVolver,
}: {
  onCaptura: (blob: Blob, previewUrl: string) => void
  onVolver: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [camEstado, setCamEstado] = useState<'iniciando' | 'activo' | 'error'>('iniciando')
  const [camError, setCamError] = useState<string | null>(null)
  const [capturando, setCapturando] = useState(false)
  const [modoDesktop, setModoDesktop] = useState(false)
  const [streamKey, setStreamKey] = useState(0) // incrementar para reiniciar la cámara

  // ── Giroscopio ──────────────────────────────────────────────────────────────
  const [gyroDisponible, setGyroDisponible] = useState(false)
  const [inclinacion, setInclinacion] = useState<{
    gamma: number; beta: number
    gammaOk: boolean; betaOk: boolean
  } | null>(null)
  const [capturaInclinada, setCapturaInclinada] = useState(false)
  const [pendingCaptura, setPendingCaptura] = useState<{
    blob: Blob; previewUrl: string; mensaje: string
  } | null>(null)

  // Cuando el estado pasa a 'activo', el <video> ya está en el DOM — conectar el stream
  useEffect(() => {
    if (camEstado === 'activo' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camEstado])

  // Iniciar/reiniciar stream de cámara (streamKey como trigger de reinicio)
  useEffect(() => {
    let cancelado = false

    const conectarStream = (stream: MediaStream) => {
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      setCamEstado('activo')
    }

    const manejarError = (err: unknown) => {
      if (cancelado) return
      const e = err as { name?: string }
      setCamError(
        e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError'
          ? 'Permiso de cámara denegado. Habilitalo en la configuración del navegador.'
          : 'No pudimos acceder a la cámara.'
      )
      setCamEstado('error')
    }

    // Intentar cámara trasera; si falla (desktop/sin cámara trasera) usar cualquier cámara
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false })
      .then(conectarStream)
      .catch(() => {
        if (cancelado) return
        setModoDesktop(true)
        navigator.mediaDevices
          .getUserMedia({ video: true, audio: false })
          .then(conectarStream)
          .catch(manejarError)
      })

    return () => {
      cancelado = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [streamKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escuchar orientación del dispositivo (giroscopio)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) return

    let limpieza: (() => void) | null = null

    const iniciarGiroscopio = async () => {
      try {
        // iOS 13+ requiere permiso explícito — solo funciona desde gesto de usuario
        type DevOrientConPermiso = typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<PermissionState>
        }
        const DevOrient = DeviceOrientationEvent as DevOrientConPermiso
        if (typeof DevOrient.requestPermission === 'function') {
          const perm = await DevOrient.requestPermission()
          if (perm !== 'granted') return
        }
      } catch {
        return // iOS sin gesto de usuario: saltar silenciosamente, sin bloquear
      }

      const handler = (e: DeviceOrientationEvent) => {
        const gamma = e.gamma ?? 0
        const beta  = e.beta  ?? 80  // default: celular vertical apuntando a góndola
        setGyroDisponible(true)
        setInclinacion({
          gamma,
          beta,
          gammaOk: Math.abs(gamma) <= 20,          // ±20° tolerancia horizontal
          betaOk:  beta >= 60 && beta <= 100,       // rango vertical aceptable (±20° desde 80°)
        })
      }
      window.addEventListener('deviceorientation', handler)
      limpieza = () => window.removeEventListener('deviceorientation', handler)
    }

    iniciarGiroscopio()
    return () => { limpieza?.() }
  }, [])

  const capturar = useCallback(() => {
    if (!videoRef.current || capturando) return
    setCapturando(true)

    const canvas = document.createElement('canvas')
    const video = videoRef.current
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    canvas.getContext('2d')!.drawImage(video, 0, 0)

    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null

    // Capturar posición exacta en el momento del disparo
    const gammaAlCapturar = inclinacion?.gamma ?? 0
    const betaAlCapturar  = inclinacion?.beta  ?? 80

    canvas.toBlob((blob) => {
      if (!blob) { setCapturando(false); return }
      const previewUrl = URL.createObjectURL(blob)

      const gammaFueraRango = Math.abs(gammaAlCapturar) > 25
      const betaFueraRango  = betaAlCapturar < 60 || betaAlCapturar > 100

      if (gyroDisponible && (gammaFueraRango || betaFueraRango)) {
        const mensaje =
          gammaFueraRango && betaFueraRango
            ? 'Corregí la inclinación antes de sacar la foto'
            : gammaFueraRango
              ? 'La foto está muy inclinada'
              : 'Apuntá más derecho a la góndola'
        setPendingCaptura({ blob, previewUrl, mensaje })
        setCapturaInclinada(true)
        setCapturando(false)
      } else {
        onCaptura(blob, previewUrl)
      }
    }, 'image/jpeg', 0.92)
  }, [capturando, onCaptura, inclinacion, gyroDisponible])

  const handleArchivo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCaptura(file, URL.createObjectURL(file))
  }, [onCaptura])

  // Reiniciar cámara para repetir foto inclinada
  const repetirFoto = useCallback(() => {
    if (pendingCaptura) URL.revokeObjectURL(pendingCaptura.previewUrl)
    setPendingCaptura(null)
    setCapturaInclinada(false)
    setCamEstado('iniciando')
    setStreamKey(k => k + 1)
  }, [pendingCaptura])

  // ── Vista: advertencia de inclinación ─────────────────────────────────────
  if (capturaInclinada && pendingCaptura) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <div className="relative flex-1">
          <Image src={pendingCaptura.previewUrl} alt="Preview" fill className="object-contain" />
        </div>
        <div className="bg-amber-50 border-t border-amber-200 px-5 py-5 shrink-0">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl shrink-0">📐</span>
            <div>
              <p className="font-semibold text-amber-900 text-base">{pendingCaptura.mensaje}</p>
              <p className="text-sm text-amber-700 mt-0.5">¿Querés tomarla de nuevo?</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={repetirFoto}
              className="w-full py-3.5 bg-amber-500 text-white font-semibold rounded-xl min-h-touch"
            >
              Repetir foto
            </button>
            <button
              onClick={() => {
                onCaptura(pendingCaptura.blob, pendingCaptura.previewUrl)
                setPendingCaptura(null)
                setCapturaInclinada(false)
              }}
              className="w-full py-3.5 border border-amber-300 text-amber-700 font-semibold rounded-xl min-h-touch"
            >
              Usar igual
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (camEstado === 'iniciando') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-black">
        <Loader2 size={32} className="text-white animate-spin" />
        <p className="text-white text-sm">Abriendo cámara...</p>
      </div>
    )
  }

  if (camEstado === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-5 px-6 bg-gray-50">
        <Camera size={40} className="text-gray-300" />
        <p className="text-center text-gray-700 font-medium">{camError}</p>
        <div className="w-full max-w-xs space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleArchivo}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-gondo-verde-400 text-white rounded-xl font-semibold"
          >
            Seleccionar foto del archivo
          </button>
          <button
            onClick={onVolver}
            className="w-full py-3 border border-gray-200 text-gray-600 rounded-xl font-semibold"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-black flex flex-col">
      {/* Banner desktop */}
      {modoDesktop && (
        <div className="relative z-20 bg-blue-600 text-white text-xs text-center py-2 px-4">
          Modo desktop — en el celular se usará la cámara trasera
        </div>
      )}

      {/* Video en full screen */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay top */}
      <div className="relative z-10 flex items-center gap-3 p-4 pt-12 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={onVolver} className="text-white p-1">
          <ArrowLeft size={20} />
        </button>
        <p className="text-white text-sm font-medium">Fotografiá la góndola</p>
      </div>

      {/* Guía de encuadre */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="w-72 h-52 border-2 border-white/60 rounded-2xl" />
      </div>

      {/* Botón captura + nivel de burbuja + alternativa archivo en desktop */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-12 pt-6 bg-gradient-to-t from-black/60 to-transparent">

        {/* ── Indicador de nivel 2D (solo mobile con giroscopio) ──── */}
        {gyroDisponible && inclinacion && (() => {
          const estaOk = inclinacion.gammaOk && inclinacion.betaOk
          // X: gamma — desplazamiento horizontal (±20° → zona segura, clamp ±40px)
          const dx = Math.max(-40, Math.min(40, (inclinacion.gamma / 30) * 40))
          // Y: beta  — desplazamiento vertical (center=80°, rango 60-100, clamp ±40px)
          const dy = Math.max(-40, Math.min(40, ((inclinacion.beta - 80) / 20) * 40))

          const msgNivel = !inclinacion.gammaOk && !inclinacion.betaOk
            ? 'Corregí la posición'
            : !inclinacion.gammaOk
              ? 'Enderezá el celular'
              : !inclinacion.betaOk
                ? 'Apuntá más derecho'
                : 'Posición correcta ✓'

          return (
            <div className="flex flex-col items-center gap-1.5">
              {/* Cuadrado 2D de referencia */}
              <div className="relative w-24 h-24 rounded-xl border border-white/30 bg-white/10 backdrop-blur-sm">
                {/* Cruz de referencia */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-px bg-white/25" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-full w-px bg-white/25" />
                </div>
                {/* Zona aceptable (círculo guía) */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full border border-white/20" />
                </div>
                {/* Burbuja 2D */}
                <div
                  className={`absolute w-5 h-5 rounded-full border-2 shadow-lg transition-all duration-100 ${
                    estaOk
                      ? 'bg-green-400 border-green-200'
                      : 'bg-red-400 border-red-200'
                  }`}
                  style={{
                    left:  '50%',
                    top:   '50%',
                    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
                  }}
                />
              </div>
              <p className={`text-xs font-medium px-2.5 py-0.5 rounded-full backdrop-blur-sm ${
                estaOk
                  ? 'text-white/70'
                  : 'text-white font-semibold bg-red-500/70'
              }`}>
                {msgNivel}
              </p>
            </div>
          )
        })()}

        <button
          onClick={capturar}
          disabled={capturando}
          className="w-20 h-20 rounded-full bg-white border-4 border-white/50 shadow-xl active:scale-95 transition-transform disabled:opacity-60"
          aria-label="Capturar foto"
        >
          <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
            {capturando
              ? <Loader2 size={24} className="text-gray-400 animate-spin" />
              : <Camera size={24} className="text-gray-700" />
            }
          </div>
        </button>

        {modoDesktop && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleArchivo}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-white/80 text-sm underline"
            >
              O subí una foto desde el archivo
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Flujo principal ───────────────────────────────────────────────────────────

function CapturaContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const { encolar } = useOfflineQueue()
  const gps = useGPS()

  const campanaId = searchParams.get('campana') ?? ''

  const [paso, setPaso] = useState<Paso>('comercio')
  const [campana, setCampana] = useState<CampanaData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null)

  // Offline
  const [modoOffline, setModoOffline] = useState(false)
  const comerciosCacheRef = useRef<ComercioRow[]>([])
  const [comerciosPendientes, setComerciosPendientes] = useState<ComercioTempItem[]>([])

  // Datos del flujo
  const [busqueda, setBusqueda] = useState('')
  const [comercios, setComercios] = useState<ComercioRow[]>([])
  const [buscando, setBuscando] = useState(false)
  const [comercio, setComercio] = useState<ComercioRow | null>(null)
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [declaracion, setDeclaracion] = useState<Declaracion | null>(null)
  const [precio, setPrecio] = useState('')
  const [respuestas, setRespuestas] = useState<Record<string, unknown>>({})
  const [enviando, setEnviando] = useState(false)
  const [puntosGanados, setPuntosGanados] = useState(0)
  const [blurScore, setBlurScore] = useState<number | null>(null)
  const [comprConfig, setComprConfig] = useState<ConfigCompresion>({ maxSizeMB: 0.25, maxWidth: 1024, calidad: 0.70 })

  // ── Estado extra para flujo COMERCIOS ─────────────────────────────────────
  const [cmNombre,    setCmNombre]    = useState('')
  const [cmTipo,      setCmTipo]      = useState<TipoComercio>('almacen')
  const [cmDireccion, setCmDireccion] = useState('')
  const [cmTelefono,  setCmTelefono]  = useState('')
  const [cmEncargado, setCmEncargado] = useState('')
  const [cmFachadaBlob,    setCmFachadaBlob]    = useState<Blob | null>(null)
  const [cmFachadaPreview, setCmFachadaPreview] = useState<string | null>(null)
  const [cmSubiendo,       setCmSubiendo]       = useState(false)
  const [cmErrorMsg,       setCmErrorMsg]       = useState<string | null>(null)
  const [cmComerciosCercanos, setCmComerciosCercanos] = useState<ComercioRow[]>([])
  const [cmBuscandoCercanos,  setCmBuscandoCercanos]  = useState(false)
  const [cmComercioYaExiste,  setCmComercioYaExiste]  = useState<ComercioRow | null>(null)
  const cmFachadaInputRef    = useRef<HTMLInputElement>(null)
  const cmBusquedaHechaRef   = useRef(false)

  // Cargar config de compresión al montar
  useEffect(() => {
    obtenerConfigCompresion().then(cfg => setComprConfig(cfg))
  }, [])

  // Cargar datos de la campaña al montar
  useEffect(() => {
    if (!campanaId) { setCargando(false); return }

    const cargarCampana = async () => {
      // Sin conexión: cargar desde IndexedDB
      if (!navigator.onLine) {
        const cached: CampanaData | undefined = await get(CAMPANA_CACHE_PREFIX + campanaId)
        if (cached) {
          setCampana(cached)
        } else {
          setErrorGlobal('Sin conexión y sin datos guardados para esta campaña.')
        }
        setCargando(false)
        return
      }

      supabase
        .from('campanas')
        .select('id, nombre, tipo, puntos_por_foto, bloques_foto ( id, tipo_contenido, instruccion, solicitar_precio, bloque_campos ( id, tipo, pregunta, opciones, obligatorio, orden ) )')
        .eq('id', campanaId)
        .eq('estado', 'activa')
        .single()
        .then(async ({ data, error }) => {
          if (error || !data) {
            // Intentar desde caché como fallback
            const cached: CampanaData | undefined = await get(CAMPANA_CACHE_PREFIX + campanaId)
            if (cached) {
              setCampana(cached)
            } else {
              setErrorGlobal('No encontramos la campaña o ya no está activa.')
            }
          } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const d = data as any
            const bloques = d.bloques_foto as {
              id: string; tipo_contenido: string; instruccion: string | null
              solicitar_precio: boolean | null
              bloque_campos: CampoBloque[] | null
            }[]
            const primerBloque = bloques?.[0]
            const camposRaw = primerBloque?.bloque_campos ?? []
            const campos: CampoBloque[] = [...camposRaw].sort((a, b) => a.orden - b.orden)
            const campanaData: CampanaData = {
              id: d.id,
              nombre: d.nombre,
              tipo: d.tipo ?? 'relevamiento',
              puntos_por_foto: d.puntos_por_foto,
              primerBloqueId: primerBloque?.id ?? null,
              tipoContenido: primerBloque?.tipo_contenido ?? 'propios',
              bloqueInstruccion: primerBloque?.instruccion ?? 'el producto',
              bloqueSolicitarPrecio: primerBloque?.solicitar_precio ?? false,
              campos,
            }
            setCampana(campanaData)
            // Guardar en caché para uso offline futuro
            await set(CAMPANA_CACHE_PREFIX + campanaId, campanaData)
          }
          setCargando(false)
        })
    }

    cargarCampana()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanaId])

  // Inicializar caché de comercios y manejar comercio_nuevo param
  useEffect(() => {
    const initOffline = async () => {
      const pendientes: ComercioTempItem[] = (await get(COMERCIOS_PENDIENTES_KEY)) ?? []
      setComerciosPendientes(pendientes)

      const isOffline = !navigator.onLine
      setModoOffline(isOffline)

      if (isOffline) {
        const cache = await get(COMERCIOS_CACHE_KEY)
        if (cache?.data) comerciosCacheRef.current = cache.data
      } else {
        // Cachear todos los comercios para uso offline futuro
        supabase
          .from('comercios')
          .select('id, nombre, direccion, lat, lng, tipo, validado')
          .order('nombre')
          .limit(500)
          .then(({ data }) => {
            if (data) {
              comerciosCacheRef.current = data as ComercioRow[]
              set(COMERCIOS_CACHE_KEY, { data, timestamp: Date.now() })
            }
          })
      }

      // Manejar param comercio_nuevo (redirigido desde /comercios/nuevo)
      const nuevoId = searchParams.get('comercio_nuevo')
      if (nuevoId) {
        if (nuevoId.startsWith('temp_')) {
          const found = pendientes.find(p => p.tempId === nuevoId)
          if (found) {
            setComercio({
              id: found.tempId,
              nombre: found.nombre,
              direccion: found.direccion,
              lat: found.lat,
              lng: found.lng,
              tipo: found.tipo,
              validado: false,
            })
            setPaso('gps')
          }
        } else {
          supabase
            .from('comercios')
            .select('id, nombre, direccion, lat, lng, tipo, validado')
            .eq('id', nuevoId)
            .single()
            .then(({ data }) => {
              if (data) {
                setComercio(data as ComercioRow)
                setPaso('gps')
              }
            })
        }
      }
    }

    initOffline()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Buscar comercios con debounce (online) o filtrar desde caché (offline)
  useEffect(() => {
    if (!busqueda.trim()) { setComercios([]); return }

    const query = busqueda.toLowerCase()

    const tempMatches: ComercioRow[] = comerciosPendientes
      .filter(p => p.nombre.toLowerCase().includes(query))
      .map(p => ({ id: p.tempId, nombre: p.nombre, direccion: p.direccion, lat: p.lat, lng: p.lng, tipo: p.tipo, validado: false }))

    if (modoOffline || !navigator.onLine) {
      const cacheResults = comerciosCacheRef.current
        .filter(c => c.nombre.toLowerCase().includes(query))
        .slice(0, 10)
      setComercios([...tempMatches, ...cacheResults])
      return
    }

    setBuscando(true)
    const timer = setTimeout(() => {
      supabase
        .from('comercios')
        .select('id, nombre, direccion, lat, lng, tipo, validado')
        .ilike('nombre', `%${busqueda}%`)
        .limit(10)
        .then(({ data }) => {
          setComercios([...tempMatches, ...(data as ComercioRow[] ?? [])])
          setBuscando(false)
        })
    }, 300)

    return () => { clearTimeout(timer); setBuscando(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, modoOffline, comerciosPendientes])

  // Iniciar GPS al llegar al paso GPS
  useEffect(() => {
    if (paso === 'gps') gps.solicitar()
    return () => { if (paso !== 'gps') gps.detener() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  // Para campañas tipo 'comercios': al llegar al paso 'gps' o al elegir el comercio,
  // redirigir al flujo especial 'comercios-gps'
  useEffect(() => {
    if (campana?.tipo === 'comercios' && paso === 'comercio') {
      // En campañas COMERCIOS no se elige comercio — ir directo a comercios-gps
      setPaso('comercios-gps')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campana?.tipo, paso])

  // Resetear búsqueda al salir del paso
  useEffect(() => {
    if (paso !== 'comercios-gps') {
      cmBusquedaHechaRef.current = false
    }
  }, [paso])

  // Buscar comercios cercanos UNA SOLA VEZ cuando el GPS está listo en comercios-gps
  useEffect(() => {
    if (paso !== 'comercios-gps') return
    if (gps.estado !== 'activo' || !gps.posicion) return
    if (cmBusquedaHechaRef.current) return   // Ya buscamos — no re-ejecutar aunque el GPS actualice

    cmBusquedaHechaRef.current = true
    const lat = gps.posicion.lat
    const lng  = gps.posicion.lng

    setCmBuscandoCercanos(true)
    supabase
      .from('comercios')
      .select('id, nombre, direccion, lat, lng, tipo, validado')
      .limit(500)
      .then(({ data }) => {
        if (data) {
          const cercanos = (data as ComercioRow[]).filter(c =>
            c.lat && c.lng && calcularDistanciaMetros(lat, lng, c.lat, c.lng) <= 20
          )
          setCmComerciosCercanos(cercanos)
        }
        setCmBuscandoCercanos(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, gps.estado, gps.posicion?.lat, gps.posicion?.lng])

  // Solicitar GPS al llegar al paso comercios-gps
  useEffect(() => {
    if (paso === 'comercios-gps') gps.solicitar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  // Advertir antes de cerrar la pestaña si hay captura en progreso
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const pasosFinal: Paso[] = ['comercio', 'exito', 'exito-offline', 'comercios-exito', 'comercios-gps']
      if (!pasosFinal.includes(paso)) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [paso])

  // ── Upload y registro ─────────────────────────────────────────────────────

  const handleEnviar = async () => {
    const declaracionFinal = campana?.tipoContenido === 'ninguno'
      ? 'producto_presente'
      : declaracion
    if (!fotoBlob || !comercio || !campana) return
    if (campana.tipoContenido !== 'ninguno' && !declaracion) return

    setEnviando(true)

    console.log('[compresión] Antes:', (fotoBlob.size / 1024).toFixed(1), 'KB')
    const blob = await comprimirImagen(fotoBlob, comprConfig.maxSizeMB, comprConfig.maxWidth, comprConfig.calidad)
    console.log('[compresión] Después:', (blob.size / 1024).toFixed(1), 'KB')
    const storagePath = generarPathFoto(campana.id, getDeviceId())
    const timestampDispositivo = new Date().toISOString()
    const lat = gps.posicion?.lat ?? 0
    const lng = gps.posicion?.lng ?? 0
    const bloqueIdBase = campana.primerBloqueId ?? ''

    const comercioPendienteData = comercio.id.startsWith('temp_')
      ? comerciosPendientes.find(p => p.tempId === comercio.id)
      : undefined

    const encolarFoto = async (fotoBlob: Blob) => {
      const reader = new FileReader()
      reader.onload = async () => {
        await encolar({
          campanaId: campana.id,
          bloqueId: bloqueIdBase,
          comercioId: comercio.id,
          storagePath,
          fotoBase64: reader.result as string,
          lat, lng,
          declaracion: declaracionFinal!,
          precio: precio ? parseFloat(precio) : null,
          deviceId: getDeviceId(),
          timestamp: timestampDispositivo,
          puntosAcreditar: campana.puntos_por_foto,
          comercioPendiente: comercioPendienteData
            ? { nombre: comercioPendienteData.nombre, tipo: comercioPendienteData.tipo, direccion: comercioPendienteData.direccion, lat: comercioPendienteData.lat, lng: comercioPendienteData.lng }
            : undefined,
        })
        setPaso('exito-offline')
        setEnviando(false)
      }
      reader.readAsDataURL(fotoBlob)
    }

    // Si no hay conexión, encolar directamente sin intentar el fetch
    if (!navigator.onLine) {
      await encolarFoto(blob)
      return
    }

    try {
      // Obtener o crear bloque genérico si la campaña no tiene bloques configurados
      const bloqueId = campana.primerBloqueId ?? await asegurarBloqueGenerico(campana.id)

      // Subir foto a Storage vía Server Action (service role bypasea RLS)
      const formData = new FormData()
      formData.append('foto', new File([blob], 'foto.jpg', { type: 'image/jpeg' }))
      formData.append('storagePath', storagePath)
      const { url } = await subirFoto(formData)

      // Construir array de respuestas para el servidor
      const respuestasArray = Object.entries(respuestas)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([campo_id, valor]) => ({ campo_id, valor }))

      // Registrar en DB vía Server Action
      const result = await registrarFoto({
        campanaId: campana.id,
        bloqueId,
        comercioId: comercio.id,
        storagePath,
        url,
        lat, lng,
        declaracion: declaracionFinal!,
        precioConfirmado: precio ? parseFloat(precio) : null,
        timestampDispositivo,
        deviceId: getDeviceId(),
        puntosAcreditar: campana.puntos_por_foto,
        blurScore,
        respuestas: respuestasArray.length > 0 ? respuestasArray : undefined,
      })

      setPuntosGanados(result.puntos)
      setPaso('exito')
    } catch (err) {
      const esErrorRed = !navigator.onLine ||
        (err instanceof Error && (
          err.message.includes('fetch') ||
          err.message.includes('network') ||
          err.message.includes('Failed')
        ))

      if (esErrorRed) {
        await encolarFoto(blob)
        return
      }

      setErrorGlobal(err instanceof Error ? err.message : 'Error al enviar la foto.')
    } finally {
      setEnviando(false)
    }
  }

  // Handler para enviar el nuevo comercio (flujo COMERCIOS)
  const handleEnviarComercio = async () => {
    if (!campana || !cmNombre.trim()) return
    if (!gps.posicion) { setCmErrorMsg('Necesitamos tu ubicación GPS.'); return }

    setCmSubiendo(true)
    setCmErrorMsg(null)

    try {
      let fachadaPath: string | null = null
      let fachadaUrl:  string | null = null

      // Subir foto de fachada si existe
      if (cmFachadaBlob) {
        const fd = new FormData()
        fd.append('foto', new File([cmFachadaBlob], 'fachada.jpg', { type: 'image/jpeg' }))
        fd.append('campanaId', campana.id)
        const res = await subirFotoFachada(fd)
        fachadaPath = res.path
        fachadaUrl  = res.url
      }

      const result = await crearComercioNuevo({
        campanaId:           campana.id,
        nombre:              cmNombre.trim(),
        tipo:                cmTipo,
        direccion:           cmDireccion.trim() || null,
        lat:                 gps.posicion.lat,
        lng:                 gps.posicion.lng,
        telefono:            cmTelefono.trim() || null,
        encargado:           cmEncargado.trim() || null,
        fachadaStoragePath:  fachadaPath,
        fachadaUrl:          fachadaUrl,
      })

      if ('error' in result && result.error) {
        setCmErrorMsg(result.error)
        return
      }

      setPaso('comercios-exito')
    } catch (err) {
      setCmErrorMsg(err instanceof Error ? err.message : 'Error al guardar el comercio.')
    } finally {
      setCmSubiendo(false)
    }
  }

  // Limpiar preview URL al desmontar
  useEffect(() => {
    return () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview) }
  }, [fotoPreview])

  // ── Estados de carga / error globales ─────────────────────────────────────

  if (!campanaId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-4">
        <p className="text-gray-600 text-center">No se especificó ninguna campaña.</p>
        <button onClick={() => router.push('/gondolero/misiones')}
          className="px-6 py-3 bg-gondo-verde-400 text-white rounded-xl font-semibold">
          Ir a mis misiones
        </button>
      </div>
    )
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="text-gondo-verde-400 animate-spin" />
      </div>
    )
  }

  if (errorGlobal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 gap-4">
        <XCircle size={40} className="text-red-400" />
        <p className="text-gray-700 text-center">{errorGlobal}</p>
        <button onClick={() => router.back()}
          className="px-6 py-3 bg-gondo-verde-400 text-white rounded-xl font-semibold">
          Volver
        </button>
        <BotonReportarError errorTecnico={errorGlobal} />
      </div>
    )
  }

  // ── PASO CÁMARA — full screen, sin header ─────────────────────────────────
  if (paso === 'camara') {
    return (
      <PasoCamara
        onCaptura={async (blob, previewUrl) => {
          console.log('Foto capturada, iniciando blur detection...')
          console.log('Blob size:', blob.size, 'type:', blob.type)
          setFotoBlob(blob)
          setFotoPreview(previewUrl)
          const score = await calcularBlur(blob)
          setBlurScore(score)
          console.log('Device:', /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop')
          console.log('Blur score:', score, '| Threshold:', BLUR_THRESHOLD)
          console.log('¿Foto borrosa?', score < BLUR_THRESHOLD)
          if (score < BLUR_THRESHOLD) {
            console.log('Mostrando advertencia de blur')
            setPaso('blur-advertencia')
          } else if (campana?.tipoContenido === 'ninguno') {
            setDeclaracion('producto_presente')
            setPaso(campana.campos.length > 0 ? 'formulario' : 'confirmacion')
          } else {
            setPaso('declaracion')
          }
        }}
        onVolver={() => setPaso('gps')}
      />
    )
  }

  // ── ÉXITO ─────────────────────────────────────────────────────────────────
  if (paso === 'exito') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white gap-6 text-center">
        <div className="w-20 h-20 bg-gondo-verde-50 rounded-full flex items-center justify-center">
          <CheckCircle2 size={40} className="text-gondo-verde-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">¡Foto enviada!</h1>
          <p className="text-gray-500 text-sm">La foto está en revisión</p>
        </div>
        <div className="flex items-center gap-2 bg-gondo-verde-50 px-6 py-3 rounded-2xl">
          <Star size={18} className="text-gondo-verde-400 fill-gondo-verde-400" />
          <span className="text-lg font-bold text-gondo-verde-400">
            +{formatearPuntos(puntosGanados)} puntos
          </span>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => {
              setFotoBlob(null); setFotoPreview(null)
              setDeclaracion(null); setPrecio('')
              setRespuestas({})
              setComercio(null); setBusqueda('')
              setPaso('comercio')
            }}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
          >
            Capturar otra foto
          </button>
          <button
            onClick={() => router.push('/gondolero/misiones')}
            className="w-full py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl min-h-touch"
          >
            Ir a mis misiones
          </button>
        </div>
      </div>
    )
  }

  // ── ÉXITO OFFLINE ────────────────────────────────────────────────────────────
  if (paso === 'exito-offline') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white gap-6 text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center text-4xl">
          ✈️
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Foto guardada</h1>
          <p className="text-gray-500 text-sm max-w-xs">
            No hay conexión. La foto se va a subir automáticamente cuando vuelva el internet.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => {
              setFotoBlob(null); setFotoPreview(null)
              setDeclaracion(null); setPrecio('')
              setRespuestas({})
              setComercio(null); setBusqueda('')
              setPaso('comercio')
            }}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
          >
            Capturar otra foto
          </button>
          <button
            onClick={() => router.push('/gondolero/misiones')}
            className="w-full py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl min-h-touch"
          >
            Ir a mis misiones
          </button>
        </div>
      </div>
    )
  }

  // ── FLUJO ESPECIAL COMERCIOS ─────────────────────────────────────────────────

  // Éxito COMERCIOS
  if (paso === 'comercios-exito') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-white gap-6 text-center">
        <div className="w-20 h-20 bg-gondo-verde-50 rounded-full flex items-center justify-center">
          <CheckCircle2 size={40} className="text-gondo-verde-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Comercio registrado!</h1>
          <p className="text-gray-500 text-sm max-w-xs">
            Tus puntos se acreditarán cuando el comercio sea validado por tu distribuidora.
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => {
              setCmNombre(''); setCmTipo('almacen'); setCmDireccion('')
              setCmTelefono(''); setCmEncargado('')
              setCmFachadaBlob(null); setCmFachadaPreview(null)
              setCmComerciosCercanos([]); setCmComercioYaExiste(null)
              setCmErrorMsg(null)
              setPaso('comercios-gps')
            }}
            className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
          >
            Registrar otro comercio
          </button>
          <button
            onClick={() => router.push('/gondolero/misiones')}
            className="w-full py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl min-h-touch"
          >
            Ir a mis misiones
          </button>
        </div>
      </div>
    )
  }

  // Comercio ya existe (seleccionado de la lista cercana)
  if (paso === 'comercios-existente' && cmComercioYaExiste) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => setPaso('comercios-gps')} className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">Comercio encontrado</h1>
        </div>
        <div className="px-4 py-8 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
            <MapPin size={28} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">{cmComercioYaExiste.nombre}</h2>
            {cmComercioYaExiste.direccion && (
              <p className="text-sm text-gray-500">{cmComercioYaExiste.direccion}</p>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 max-w-sm">
            <p className="text-sm text-blue-800 font-medium mb-1">Este comercio ya está registrado</p>
            <p className="text-xs text-blue-600">
              Para generar puntos debés registrar un comercio nuevo que aún no esté en el mapa.
            </p>
          </div>
          <button
            onClick={() => { setCmComercioYaExiste(null); setPaso('comercios-gps') }}
            className="w-full max-w-xs py-4 bg-gondo-verde-400 text-white font-semibold rounded-2xl min-h-touch"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  // Paso GPS de comercios: pedir ubicación y buscar cercanos
  if (paso === 'comercios-gps') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-xs text-gray-400">{campana?.nombre}</p>
            <h1 className="text-base font-bold text-gray-900">Registrar comercio nuevo</h1>
          </div>
        </div>
        <div className="flex-1 px-4 py-5 space-y-5">
          {/* Estado GPS */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            {gps.estado === 'idle' && (
              <>
                <Navigation size={36} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-4">
                  Necesitamos tu ubicación GPS para verificar que no hay un comercio cercano ya registrado.
                </p>
                <button
                  onClick={gps.solicitar}
                  className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
                >
                  Activar GPS
                </button>
              </>
            )}
            {gps.estado === 'solicitando' && (
              <>
                <Loader2 size={36} className="text-gondo-verde-400 mx-auto mb-3 animate-spin" />
                <p className="text-sm text-gray-600">Obteniendo tu ubicación...</p>
              </>
            )}
            {gps.estado === 'error' && (
              <>
                <XCircle size={36} className="text-red-400 mx-auto mb-3" />
                <p className="text-sm text-red-600 mb-4">{gps.error}</p>
                <button onClick={gps.solicitar} className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch">
                  Reintentar
                </button>
              </>
            )}
            {gps.estado === 'activo' && gps.posicion && (
              <div className="flex items-center justify-center gap-2 text-gondo-verde-400">
                <Navigation size={18} className="shrink-0" />
                <span className="text-sm font-medium">Ubicación obtenida ✓</span>
              </div>
            )}
          </div>

          {/* Buscando comercios cercanos */}
          {cmBuscandoCercanos && (
            <div className="flex items-center gap-2 text-gray-500 justify-center py-3">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Verificando comercios cercanos...</span>
            </div>
          )}

          {/* Comercios cercanos encontrados */}
          {!cmBuscandoCercanos && cmComerciosCercanos.length > 0 && gps.estado === 'activo' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  Hay {cmComerciosCercanos.length} comercio{cmComerciosCercanos.length !== 1 ? 's' : ''} registrado{cmComerciosCercanos.length !== 1 ? 's' : ''} a menos de 20m. ¿Es alguno de estos?
                </p>
              </div>
              {cmComerciosCercanos.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCmComercioYaExiste(c); setPaso('comercios-existente') }}
                  className="w-full flex items-start gap-3 p-3.5 bg-white border border-gray-200 rounded-xl text-left hover:border-amber-300 transition-colors"
                >
                  <MapPin size={16} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{c.nombre}</p>
                    {c.direccion && <p className="text-xs text-gray-400 truncate">{c.direccion}</p>}
                  </div>
                </button>
              ))}
              <p className="text-xs text-gray-400 text-center">o bien...</p>
            </div>
          )}

          {/* Botón para ir al formulario de nuevo comercio */}
          {gps.estado === 'activo' && !cmBuscandoCercanos && (
            <button
              onClick={() => setPaso('comercios-formulario')}
              className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl min-h-touch"
            >
              {cmComerciosCercanos.length > 0 ? 'No es ninguno — es un comercio nuevo' : 'Continuar — Completar datos'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Formulario del nuevo comercio (datos básicos)
  if (paso === 'comercios-formulario') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => setPaso('comercios-gps')} className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">Datos del comercio</h1>
        </div>
        <div className="px-4 py-5 space-y-5">

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre del comercio <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={cmNombre}
              onChange={e => setCmNombre(e.target.value)}
              placeholder="Ej: Almacén Don Juan"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
              autoComplete="off"
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_COMERCIO.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setCmTipo(t.value)}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-colors min-h-touch ${
                    cmTipo === t.value
                      ? 'bg-gondo-verde-50 border-gondo-verde-400 text-gondo-verde-400'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dirección */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Dirección <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={cmDireccion}
              onChange={e => setCmDireccion(e.target.value)}
              placeholder="Ej: San Martín 450, Concordia"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
              autoComplete="street-address"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Teléfono <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="tel"
              value={cmTelefono}
              onChange={e => setCmTelefono(e.target.value)}
              placeholder="Ej: 345 412-3456"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
            />
          </div>

          {/* Encargado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Encargado / dueño <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={cmEncargado}
              onChange={e => setCmEncargado(e.target.value)}
              placeholder="Ej: Juan García"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
              autoComplete="off"
            />
          </div>

          {cmErrorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600">{cmErrorMsg}</p>
            </div>
          )}

          <button
            onClick={() => {
              if (!cmNombre.trim()) { setCmErrorMsg('El nombre es obligatorio.'); return }
              setCmErrorMsg(null)
              setPaso('comercios-fachada')
            }}
            className="w-full py-4 bg-gondo-verde-400 text-white font-semibold rounded-2xl text-base min-h-touch"
          >
            Siguiente → Foto de fachada
          </button>
        </div>
      </div>
    )
  }

  // Foto de fachada del comercio
  if (paso === 'comercios-fachada') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 flex items-center gap-3">
          <button onClick={() => setPaso('comercios-formulario')} className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">Foto de fachada</h1>
        </div>
        <div className="px-4 py-6 space-y-5">
          <div className="text-center space-y-1.5">
            <p className="text-base font-semibold text-gray-900">Sacá una foto de la fachada del local</p>
            <p className="text-sm text-gray-500">Ayuda a verificar que el comercio existe</p>
          </div>

          {cmFachadaPreview ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={cmFachadaPreview} alt="Fachada" className="w-full h-full object-cover" />
              </div>
              <button
                type="button"
                onClick={() => cmFachadaInputRef.current?.click()}
                className="w-full py-3 border border-gray-300 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Repetir foto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => cmFachadaInputRef.current?.click()}
              className="w-full py-10 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center gap-3 text-gray-500 hover:border-gondo-verde-400 hover:text-gondo-verde-400 transition-colors"
            >
              <Camera size={36} className="text-gray-300" />
              <div className="text-center">
                <p className="font-semibold text-sm">Sacar foto</p>
                <p className="text-xs text-gray-400 mt-0.5">Abre la cámara trasera</p>
              </div>
            </button>
          )}

          <input
            ref={cmFachadaInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              if (cmFachadaPreview) URL.revokeObjectURL(cmFachadaPreview)
              const preview = URL.createObjectURL(file)
              setCmFachadaPreview(preview)
              try {
                const compressed = await comprimirImagen(file, 0.25, 1024)
                setCmFachadaBlob(compressed)
              } catch {
                setCmFachadaBlob(file)
              }
              e.target.value = ''
            }}
          />

          {cmErrorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600">{cmErrorMsg}</p>
            </div>
          )}

          <div className="space-y-2 pt-1">
            {cmFachadaPreview && (
              <button
                onClick={handleEnviarComercio}
                disabled={cmSubiendo}
                className="w-full py-4 bg-gondo-verde-400 text-white font-semibold rounded-2xl text-base disabled:opacity-50 min-h-touch flex items-center justify-center gap-2"
              >
                {cmSubiendo
                  ? <><Loader2 size={18} className="animate-spin" /> Guardando...</>
                  : 'Guardar con foto'}
              </button>
            )}
            <button
              type="button"
              onClick={handleEnviarComercio}
              disabled={cmSubiendo}
              className="w-full py-3.5 text-gray-500 font-medium text-sm rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-touch flex items-center justify-center"
            >
              {cmSubiendo && !cmFachadaPreview
                ? <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Guardando...</span>
                : 'Omitir por ahora'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── BLUR ADVERTENCIA ─────────────────────────────────────────────────────────
  if (paso === 'blur-advertencia') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {fotoPreview && (
          <div className="relative flex-1">
            <Image src={fotoPreview} alt="Preview" fill className="object-contain" />
          </div>
        )}
        <div className="bg-amber-50 border-t border-amber-200 px-5 py-5 shrink-0">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900 text-base">La foto puede estar borrosa</p>
              <p className="text-sm text-amber-700 mt-0.5">¿Querés tomarla de nuevo?</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => { setFotoBlob(null); setFotoPreview(null); setBlurScore(null); setPaso('camara') }}
              className="w-full py-3.5 bg-amber-500 text-white font-semibold rounded-xl min-h-touch"
            >
              Repetir foto
            </button>
            <button
              onClick={() => {
                if (campana?.tipoContenido === 'ninguno') {
                  setDeclaracion('producto_presente')
                  setPaso(campana.campos.length > 0 ? 'formulario' : 'confirmacion')
                } else {
                  setPaso('declaracion')
                }
              }}
              className="w-full py-3.5 border border-amber-300 text-amber-700 font-semibold rounded-xl min-h-touch"
            >
              Usar igual
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Layout con header para el resto de los pasos ──────────────────────────

  const tieneCampos = (campana?.campos?.length ?? 0) > 0
  const esCampanaComercio = campana?.tipo === 'comercios'
  const PASOS_LABEL = esCampanaComercio
    ? ['Ubicación', 'Formulario', 'Fachada']
    : tieneCampos
      ? ['Comercio', 'Ubicación', 'Foto', 'Declaración', 'Formulario', 'Confirmar']
      : ['Comercio', 'Ubicación', 'Foto', 'Declaración', 'Confirmar']
  const PASOS_KEY: Paso[] = esCampanaComercio
    ? ['comercios-gps', 'comercios-formulario', 'comercios-fachada']
    : tieneCampos
      ? ['comercio', 'gps', 'camara', 'declaracion', 'formulario', 'confirmacion']
      : ['comercio', 'gps', 'camara', 'declaracion', 'confirmacion']
  const pasoActualIdx = PASOS_KEY.indexOf(paso)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => {
              if (paso === 'comercio') router.back()
              else {
                const prev: Record<Paso, Paso> = {
                  comercio:              'comercio',
                  gps:                   'comercio',
                  camara:                'gps',
                  'blur-advertencia':    'camara',
                  declaracion:           'camara',
                  formulario:            campana?.tipoContenido === 'ninguno' ? 'camara' : 'declaracion',
                  confirmacion:          tieneCampos ? 'formulario' : (campana?.tipoContenido === 'ninguno' ? 'camara' : 'declaracion'),
                  exito:                 'confirmacion',
                  'exito-offline':       'confirmacion',
                  'comercios-gps':       'comercio',
                  'comercios-existente': 'comercios-gps',
                  'comercios-formulario':'comercios-gps',
                  'comercios-fachada':   'comercios-formulario',
                  'comercios-exito':     'comercios-gps',
                }
                setPaso(prev[paso])
              }
            }}
            className="text-gray-500 -ml-1 p-1"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-xs text-gray-400 leading-none">{campana?.nombre}</p>
            <p className="text-sm font-semibold text-gray-900">
              Paso {pasoActualIdx + 1} — {PASOS_LABEL[pasoActualIdx]}
            </p>
          </div>
        </div>

        {/* Barra de progreso de pasos */}
        <div className="flex gap-1">
          {PASOS_KEY.map((p, i) => (
            <div
              key={p}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i <= pasoActualIdx ? 'bg-gondo-verde-400' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 py-5">

        {/* ── PASO 1: COMERCIO ── */}
        {paso === 'comercio' && (
          <div className="space-y-4">
            {modoOffline && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <WifiOff size={14} className="text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  Modo sin conexión — mostrando comercios guardados
                </p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                ¿En qué comercio estás?
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscá por nombre del comercio..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  autoFocus
                />
                {buscando && (
                  <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                )}
              </div>
            </div>

            {/* Resultados */}
            {comercios.length > 0 && (
              <div className="space-y-2">
                {comercios.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { setComercio(c); setPaso('gps') }}
                    className="w-full flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl text-left hover:border-gondo-verde-400 transition-colors"
                  >
                    <MapPin size={16} className="text-gondo-verde-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{c.nombre}</p>
                      {c.direccion && (
                        <p className="text-gray-400 text-xs truncate">{c.direccion}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {busqueda.trim() && comercios.length === 0 && !buscando && (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-3">
                  No encontramos &quot;{busqueda}&quot; en el mapa
                </p>
                <button
                  onClick={() => router.push(`/gondolero/comercios/nuevo?nombre=${encodeURIComponent(busqueda)}&campana=${campanaId}`)}
                  className="px-4 py-2 border border-gondo-verde-400 text-gondo-verde-400 rounded-xl text-sm font-semibold"
                >
                  + Agregar comercio nuevo
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: GPS ── */}
        {paso === 'gps' && comercio && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-0.5">Comercio seleccionado</p>
              <p className="font-semibold text-gray-900">{comercio.nombre}</p>
              {comercio.direccion && (
                <p className="text-sm text-gray-500">{comercio.direccion}</p>
              )}
            </div>

            {/* Aviso comercio sin validar */}
            {!comercio.validado && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Este comercio está pendiente de validación por tu distribuidora — podés usarlo igual.
                </p>
              </div>
            )}

            {/* Estado GPS */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              {gps.estado === 'idle' && (
                <>
                  <Navigation size={36} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-4">
                    Necesitamos tu ubicación para verificar que estás en el comercio.
                  </p>
                  <button
                    onClick={gps.solicitar}
                    className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
                  >
                    Activar GPS
                  </button>
                </>
              )}

              {gps.estado === 'solicitando' && (
                <>
                  <Loader2 size={36} className="text-gondo-verde-400 mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-gray-600">Obteniendo tu ubicación...</p>
                </>
              )}

              {gps.estado === 'error' && (
                <>
                  <XCircle size={36} className="text-red-400 mx-auto mb-3" />
                  <p className="text-sm text-red-600 mb-4">{gps.error}</p>
                  <button
                    onClick={gps.solicitar}
                    className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl min-h-touch"
                  >
                    Reintentar
                  </button>
                </>
              )}

              {gps.estado === 'activo' && gps.posicion && (() => {
                const distancia = calcularDistanciaMetros(
                  gps.posicion.lat, gps.posicion.lng,
                  comercio.lat, comercio.lng
                )
                const dentroDelRadio = distancia <= 50
                return (
                  <>
                    <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
                      dentroDelRadio ? 'bg-gondo-verde-50' : 'bg-amber-50'
                    }`}>
                      <Navigation size={28} className={dentroDelRadio ? 'text-gondo-verde-400' : 'text-amber-500'} />
                    </div>
                    {dentroDelRadio ? (
                      <>
                        <p className="font-semibold text-gondo-verde-400 mb-1">¡Estás en el lugar!</p>
                        <p className="text-xs text-gray-400">A {formatearDistancia(distancia)} del comercio</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-amber-600 mb-1">
                          Estás a {formatearDistancia(distancia)} del comercio
                        </p>
                        <p className="text-xs text-gray-500">Acercate para capturar con mejor precisión</p>
                        <div className="mt-3 flex items-start gap-2 bg-amber-50 rounded-xl p-3 text-left">
                          <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-700">
                            La foto puede ser rechazada si no estás en el comercio. En el piloto podés continuar igual.
                          </p>
                        </div>
                      </>
                    )}
                  </>
                )
              })()}
            </div>

            {gps.estado === 'activo' && (
              <button
                onClick={() => setPaso('camara')}
                className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl min-h-touch"
              >
                Continuar — Abrir cámara
              </button>
            )}
          </div>
        )}

        {/* ── PASO 4: DECLARACIÓN ── */}
        {paso === 'declaracion' && fotoPreview && (
          <div className="space-y-4">
            {/* Thumbnail */}
            <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gray-100">
              <Image src={fotoPreview} alt="Foto capturada" fill className="object-cover" />
              <button
                onClick={() => { setFotoBlob(null); setFotoPreview(null); setPaso('camara') }}
                className="absolute top-2 right-2 bg-black/50 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
              >
                <RefreshCw size={12} /> Repetir
              </button>
            </div>

            <p className="text-sm font-semibold text-gray-700">¿Qué encontraste?</p>

            {/* Opciones de declaración */}
            <div className="space-y-3">
              {([
                { valor: 'producto_presente', emoji: '✅', label: 'El producto está presente' },
                { valor: 'producto_no_encontrado', emoji: '❌', label: 'No encontré el producto' },
                { valor: 'solo_competencia', emoji: '🔄', label: 'Solo hay productos de la competencia' },
              ] as { valor: Declaracion; emoji: string; label: string }[]).map(op => (
                <button
                  key={op.valor}
                  onClick={() => setDeclaracion(op.valor)}
                  className={`w-full flex items-center gap-3 p-4 border-2 rounded-2xl text-left transition-colors min-h-touch ${
                    declaracion === op.valor
                      ? 'border-gondo-verde-400 bg-gondo-verde-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className="text-2xl shrink-0">{op.emoji}</span>
                  <span className="font-medium text-gray-900 text-sm">{op.label}</span>
                </button>
              ))}
            </div>

            {/* Precio — solo si el bloque lo requiere */}
            {declaracion === 'producto_presente' && campana?.bloqueSolicitarPrecio && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ¿A cuánto está {campana.bloqueInstruccion}?
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={precio}
                    onChange={e => setPrecio(e.target.value)}
                    placeholder="0"
                    className="w-full pl-7 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Ingresá el precio que ves en la góndola</p>
              </div>
            )}

            <button
              onClick={() => setPaso(tieneCampos ? 'formulario' : 'confirmacion')}
              disabled={!declaracion}
              className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl disabled:opacity-40 min-h-touch"
            >
              Continuar
            </button>
          </div>
        )}

        {/* ── PASO FORMULARIO ── */}
        {paso === 'formulario' && campana && campana.campos.length > 0 && (
          <div className="space-y-5">
            <p className="text-sm font-semibold text-gray-700">
              Preguntas adicionales ({campana.campos.filter(c => c.obligatorio).length} obligatoria{campana.campos.filter(c => c.obligatorio).length !== 1 ? 's' : ''})
            </p>

            {campana.campos.map(campo => {
              const val = respuestas[campo.id]
              return (
                <div key={campo.id} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-800">
                    {campo.pregunta}
                    {campo.obligatorio && <span className="text-red-400 ml-1">*</span>}
                  </label>

                  {/* Sí / No */}
                  {campo.tipo === 'binaria' && (
                    <div className="flex gap-3">
                      {['Sí', 'No'].map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setRespuestas(r => ({ ...r, [campo.id]: op === 'Sí' }))}
                          className={`flex-1 py-3 border-2 rounded-2xl text-sm font-semibold transition-colors ${
                            val === (op === 'Sí')
                              ? 'border-gondo-verde-400 bg-gondo-verde-50 text-gondo-verde-400'
                              : 'border-gray-200 bg-white text-gray-700'
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selección única */}
                  {campo.tipo === 'seleccion_unica' && campo.opciones && (
                    <div className="space-y-2">
                      {campo.opciones.map(op => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setRespuestas(r => ({ ...r, [campo.id]: op }))}
                          className={`w-full flex items-center gap-3 p-3.5 border-2 rounded-2xl text-left transition-colors ${
                            val === op
                              ? 'border-gondo-verde-400 bg-gondo-verde-50'
                              : 'border-gray-200 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${val === op ? 'border-gondo-verde-400 bg-gondo-verde-400' : 'border-gray-300'}`} />
                          <span className="text-sm text-gray-900">{op}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Selección múltiple */}
                  {campo.tipo === 'seleccion_multiple' && campo.opciones && (
                    <div className="space-y-2">
                      {campo.opciones.map(op => {
                        const sel = Array.isArray(val) && (val as string[]).includes(op)
                        return (
                          <button
                            key={op}
                            type="button"
                            onClick={() => {
                              const prev = Array.isArray(val) ? (val as string[]) : []
                              setRespuestas(r => ({
                                ...r,
                                [campo.id]: sel
                                  ? prev.filter(v => v !== op)
                                  : [...prev, op],
                              }))
                            }}
                            className={`w-full flex items-center gap-3 p-3.5 border-2 rounded-2xl text-left transition-colors ${
                              sel
                                ? 'border-gondo-verde-400 bg-gondo-verde-50'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${sel ? 'border-gondo-verde-400 bg-gondo-verde-400' : 'border-gray-300'}`}>
                              {sel && <span className="text-white text-[10px] font-bold">✓</span>}
                            </div>
                            <span className="text-sm text-gray-900">{op}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {/* Número */}
                  {campo.tipo === 'numero' && (
                    <input
                      type="number"
                      inputMode="numeric"
                      value={val !== undefined ? String(val) : ''}
                      onChange={e => setRespuestas(r => ({ ...r, [campo.id]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      placeholder="0"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                    />
                  )}

                  {/* Texto libre */}
                  {campo.tipo === 'texto' && (
                    <textarea
                      value={val !== undefined ? String(val) : ''}
                      onChange={e => setRespuestas(r => ({ ...r, [campo.id]: e.target.value || undefined }))}
                      placeholder="Escribí tu respuesta..."
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-sm"
                    />
                  )}
                </div>
              )
            })}

            {(() => {
              const camposObligatorios = campana.campos.filter(c => c.obligatorio)
              const todosCompletos = camposObligatorios.every(c => {
                const v = respuestas[c.id]
                if (v === undefined || v === null || v === '') return false
                if (Array.isArray(v) && v.length === 0) return false
                return true
              })
              return (
                <button
                  onClick={() => setPaso('confirmacion')}
                  disabled={!todosCompletos}
                  className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl disabled:opacity-40 min-h-touch"
                >
                  Continuar
                </button>
              )
            })()}
          </div>
        )}

        {/* ── PASO 5: CONFIRMACIÓN ── */}
        {paso === 'confirmacion' && comercio && fotoPreview && (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-gray-700">Resumen antes de enviar</p>

            {/* Foto */}
            <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gray-100">
              <Image src={fotoPreview} alt="Foto capturada" fill className="object-cover" />
            </div>

            {/* Datos */}
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
              <div className="flex items-center gap-3 p-3">
                <MapPin size={16} className="text-gray-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Comercio</p>
                  <p className="text-sm font-medium text-gray-900">{comercio.nombre}</p>
                </div>
              </div>
              {campana?.tipoContenido !== 'ninguno' && declaracion && (
              <div className="flex items-center gap-3 p-3">
                <span className="text-lg shrink-0">
                  {declaracion === 'producto_presente' ? '✅' : declaracion === 'producto_no_encontrado' ? '❌' : '🔄'}
                </span>
                <div>
                  <p className="text-xs text-gray-400">Declaración</p>
                  <p className="text-sm font-medium text-gray-900">
                    {declaracion === 'producto_presente'
                      ? `Producto presente${precio ? ` · $${precio}` : ''}`
                      : declaracion === 'producto_no_encontrado'
                      ? 'No encontrado'
                      : 'Solo competencia'}
                  </p>
                </div>
              </div>
              )}
              <div className="flex items-center gap-3 p-3">
                <Star size={16} className="text-gondo-verde-400 fill-gondo-verde-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Puntos a ganar</p>
                  <p className="text-sm font-bold text-gondo-verde-400">
                    +{formatearPuntos(campana?.puntos_por_foto ?? 0)} pts
                  </p>
                </div>
              </div>
            </div>

            {errorGlobal && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {errorGlobal}
              </div>
            )}

            <button
              onClick={handleEnviar}
              disabled={enviando}
              className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl disabled:opacity-60 min-h-touch text-base shadow-lg"
            >
              {enviando
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" />Enviando...</span>
                : 'Enviar foto'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Export con Suspense (useSearchParams requiere boundary) ───────────────────

export default function CapturaPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={32} className="text-gondo-verde-400 animate-spin" />
      </div>
    }>
      <CapturaContent />
    </Suspense>
  )
}
