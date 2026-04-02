'use client'

import { Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  ArrowLeft, MapPin, Camera, CheckCircle2, XCircle,
  RefreshCw, Navigation, Loader2, Star, AlertTriangle,
} from 'lucide-react'
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
import { registrarFoto, subirFoto, asegurarBloqueGenerico } from './actions'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Paso = 'comercio' | 'gps' | 'camara' | 'declaracion' | 'confirmacion' | 'exito' | 'exito-offline'
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

interface CampanaData {
  id: string
  nombre: string
  puntos_por_foto: number
  primerBloqueId: string | null
  tipoContenido: string
}

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

  // Cuando el estado pasa a 'activo', el <video> ya está en el DOM — conectar el stream
  useEffect(() => {
    if (camEstado === 'activo' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [camEstado])

  useEffect(() => {
    let cancelado = false

    const conectarStream = (stream: MediaStream) => {
      if (cancelado) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      // No tocar videoRef aquí — el elemento puede no estar en el DOM todavía.
      // El useEffect de arriba se encarga de conectarlo cuando camEstado cambia a 'activo'.
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

    canvas.toBlob((blob) => {
      if (!blob) { setCapturando(false); return }
      onCaptura(blob, URL.createObjectURL(blob))
    }, 'image/jpeg', 0.92)
  }, [capturando, onCaptura])

  const handleArchivo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    streamRef.current?.getTracks().forEach(t => t.stop())
    onCaptura(file, URL.createObjectURL(file))
  }, [onCaptura])

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

      {/* Botón captura + alternativa archivo en desktop */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-12 pt-6 bg-gradient-to-t from-black/60 to-transparent">
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

  // Datos del flujo
  const [busqueda, setBusqueda] = useState('')
  const [comercios, setComercios] = useState<ComercioRow[]>([])
  const [buscando, setBuscando] = useState(false)
  const [comercio, setComercio] = useState<ComercioRow | null>(null)
  const [fotoBlob, setFotoBlob] = useState<Blob | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [declaracion, setDeclaracion] = useState<Declaracion | null>(null)
  const [precio, setPrecio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [puntosGanados, setPuntosGanados] = useState(0)

  // Cargar datos de la campaña al montar
  useEffect(() => {
    if (!campanaId) { setCargando(false); return }

    supabase
      .from('campanas')
      .select('id, nombre, puntos_por_foto, bloques_foto ( id, tipo_contenido )')
      .eq('id', campanaId)
      .eq('estado', 'activa')
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setErrorGlobal('No encontramos la campaña o ya no está activa.')
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = data as any
          const bloques = d.bloques_foto as { id: string; tipo_contenido: string }[]
          setCampana({
            id: d.id,
            nombre: d.nombre,
            puntos_por_foto: d.puntos_por_foto,
            primerBloqueId: bloques?.[0]?.id ?? null,
            tipoContenido: bloques?.[0]?.tipo_contenido ?? 'propios',
          })
        }
        setCargando(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanaId])

  // Buscar comercios con debounce
  useEffect(() => {
    if (!busqueda.trim()) { setComercios([]); return }

    setBuscando(true)
    const timer = setTimeout(() => {
      supabase
        .from('comercios')
        .select('id, nombre, direccion, lat, lng, tipo, validado')
        .ilike('nombre', `%${busqueda}%`)
        .limit(10)
        .then(({ data }) => {
          setComercios((data as ComercioRow[]) ?? [])
          setBuscando(false)
        })
    }, 300)

    return () => { clearTimeout(timer); setBuscando(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  // Iniciar GPS al llegar al paso GPS
  useEffect(() => {
    if (paso === 'gps') gps.solicitar()
    return () => { if (paso !== 'gps') gps.detener() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso])

  // ── Upload y registro ─────────────────────────────────────────────────────

  const handleEnviar = async () => {
    const declaracionFinal = campana?.tipoContenido === 'ninguno'
      ? 'producto_presente'
      : declaracion
    if (!fotoBlob || !comercio || !campana) return
    if (campana.tipoContenido !== 'ninguno' && !declaracion) return

    setEnviando(true)

    try {
      // Obtener o crear bloque genérico si la campaña no tiene bloques configurados
      const bloqueId = campana.primerBloqueId ?? await asegurarBloqueGenerico(campana.id)

      const blob = await comprimirImagen(fotoBlob)
      const storagePath = generarPathFoto(campana.id, getDeviceId())
      const timestampDispositivo = new Date().toISOString()
      const lat = gps.posicion?.lat ?? 0
      const lng = gps.posicion?.lng ?? 0

      // Subir foto a Storage vía Server Action (service role bypasea RLS)
      const formData = new FormData()
      formData.append('foto', new File([blob], 'foto.jpg', { type: 'image/jpeg' }))
      formData.append('storagePath', storagePath)
      const { url } = await subirFoto(formData)

      // Registrar en DB vía Server Action
      const result = await registrarFoto({
        campanaId: campana.id,
        bloqueId,
        comercioId: comercio.id,
        storagePath,
        url,
        lat, lng,
        declaracion: declaracionFinal!,
        precioDetectado: precio ? parseFloat(precio) : null,
        timestampDispositivo,
        deviceId: getDeviceId(),
        puntosAcreditar: campana.puntos_por_foto,
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

      if (esErrorRed && fotoBlob) {
        // Encolar silenciosamente para sincronizar cuando haya conexión
        const bloqueId = campana.primerBloqueId ?? ''
        const storagePath = generarPathFoto(campana.id, getDeviceId())
        const timestampDispositivo = new Date().toISOString()
        const lat = gps.posicion?.lat ?? 0
        const lng = gps.posicion?.lng ?? 0

        const reader = new FileReader()
        reader.onload = async () => {
          await encolar({
            campanaId: campana.id,
            bloqueId,
            comercioId: comercio.id,
            storagePath,
            fotoBase64: reader.result as string,
            lat, lng,
            declaracion: declaracionFinal!,
            precio: precio ? parseFloat(precio) : null,
            deviceId: getDeviceId(),
            timestamp: timestampDispositivo,
            puntosAcreditar: campana.puntos_por_foto,
          })
          setPaso('exito-offline')
          setEnviando(false)
        }
        reader.readAsDataURL(fotoBlob)
        return
      }

      setErrorGlobal(err instanceof Error ? err.message : 'Error al enviar la foto.')
    } finally {
      setEnviando(false)
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
      </div>
    )
  }

  // ── PASO CÁMARA — full screen, sin header ─────────────────────────────────
  if (paso === 'camara') {
    return (
      <PasoCamara
        onCaptura={(blob, previewUrl) => {
          setFotoBlob(blob)
          setFotoPreview(previewUrl)
          if (campana?.tipoContenido === 'ninguno') {
            setDeclaracion('producto_presente')
            setPaso('confirmacion')
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

  // ── Layout con header para el resto de los pasos ──────────────────────────

  const PASOS_LABEL = ['Comercio', 'Ubicación', 'Foto', 'Declaración', 'Confirmar']
  const PASOS_KEY: Paso[] = ['comercio', 'gps', 'camara', 'declaracion', 'confirmacion']
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
                  comercio:       'comercio',
                  gps:            'comercio',
                  camara:         'gps',
                  declaracion:    'camara',
                  confirmacion:   campana?.tipoContenido === 'ninguno' ? 'camara' : 'declaracion',
                  exito:          'confirmacion',
                  'exito-offline':'confirmacion',
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

            {/* Precio opcional */}
            {declaracion === 'producto_presente' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Precio observado <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={precio}
                    onChange={e => setPrecio(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => setPaso('confirmacion')}
              disabled={!declaracion}
              className="w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl disabled:opacity-40 min-h-touch"
            >
              Continuar
            </button>
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
