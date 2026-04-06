'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft, Navigation, Loader2, MapPin, Camera, ImageOff } from 'lucide-react'
import { get, set } from 'idb-keyval'
import { createClient } from '@/lib/supabase/client'
import { crearComercio } from './actions'
import { comprimirImagen } from '@/lib/utils'
import type { TipoComercio } from '@/types'

interface ComercioTempItem {
  tempId: string
  nombre: string
  tipo: string
  direccion: string | null
  lat: number
  lng: number
  timestamp: number
  localidad_id?: number | null
}

const TIPOS: { value: TipoComercio; label: string; emoji: string }[] = [
  { value: 'autoservicio', label: 'Autoservicio', emoji: '🏪' },
  { value: 'almacen',      label: 'Almacén',      emoji: '🧺' },
  { value: 'kiosco',       label: 'Kiosco',       emoji: '🗞️' },
  { value: 'mayorista',    label: 'Mayorista',    emoji: '📦' },
  { value: 'dietetica',    label: 'Dietética',    emoji: '🥗' },
  { value: 'otro',         label: 'Otro',         emoji: '🏬' },
]

function NuevoComercioForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const nombreParam = searchParams.get('nombre') ?? ''
  const campanaId   = searchParams.get('campana') ?? ''

  // ── Paso del formulario ────────────────────────────────────────────────────
  const [paso, setPaso] = useState<'formulario' | 'fachada'>('formulario')

  // ── Datos del comercio ─────────────────────────────────────────────────────
  const [nombre,    setNombre]    = useState(nombreParam)
  const [tipo,      setTipo]      = useState<TipoComercio>('autoservicio')
  const [direccion, setDireccion] = useState('')
  const [lat,       setLat]       = useState<number | null>(null)
  const [lng,       setLng]       = useState<number | null>(null)
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'obteniendo' | 'ok' | 'error'>('idle')
  const [gpsError,  setGpsError]  = useState<string | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)

  // ── Localidad (selector jerárquico) ────────────────────────────────────────
  const [provincias,    setProvincias]    = useState<{ id: number; nombre: string }[]>([])
  const [departamentos, setDepartamentos] = useState<{ id: number; nombre: string }[]>([])
  const [localidades,   setLocalidades]   = useState<{ id: number; nombre: string }[]>([])
  const [provinciaId,   setProvinciaId]   = useState<number | ''>('')
  const [departamentoId, setDepartamentoId] = useState<number | ''>('')
  const [localidadId,   setLocalidadId]   = useState<number | null>(null)

  // ── Foto de fachada ────────────────────────────────────────────────────────
  const [fotoPreview,  setFotoPreview]  = useState<string | null>(null)
  const [fotoBlob,     setFotoBlob]     = useState<Blob | null>(null)
  const [comprimiendo, setComprimiendo] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview) }
  }, [fotoPreview])

  // Cargar provincias al montar
  useEffect(() => {
    createClient().from('provincias').select('id, nombre').order('nombre')
      .then(({ data }) => setProvincias(data ?? []))
  }, [])

  // Cargar departamentos al cambiar provincia
  useEffect(() => {
    if (!provinciaId) { setDepartamentos([]); setDepartamentoId(''); setLocalidades([]); setLocalidadId(null); return }
    createClient().from('departamentos').select('id, nombre').eq('provincia_id', provinciaId).order('nombre')
      .then(({ data }) => { setDepartamentos(data ?? []); setDepartamentoId(''); setLocalidades([]); setLocalidadId(null) })
  }, [provinciaId])

  // Cargar localidades al cambiar departamento
  useEffect(() => {
    if (!departamentoId) { setLocalidades([]); setLocalidadId(null); return }
    createClient().from('localidades').select('id, nombre').eq('departamento_id', departamentoId).order('nombre')
      .then(({ data }) => { setLocalidades(data ?? []); setLocalidadId(null) })
  }, [departamentoId])

  // Pedir GPS automáticamente al abrir
  useEffect(() => {
    obtenerGPS()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const obtenerGPS = () => {
    if (!navigator.geolocation) {
      setGpsEstado('error')
      setGpsError('Tu dispositivo no soporta GPS.')
      return
    }
    setGpsEstado('obteniendo')
    setGpsError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setGpsEstado('ok')
      },
      (err) => {
        setGpsEstado('error')
        setGpsError(
          err.code === 1
            ? 'Permiso de ubicación denegado. Habilitalo en la configuración de tu navegador.'
            : 'No pudimos obtener tu ubicación. Intentá de nuevo.'
        )
      },
      { timeout: 15000, enableHighAccuracy: true }
    )
  }

  // ── Manejo de foto de fachada ──────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limpiar preview anterior
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    const preview = URL.createObjectURL(file)
    setFotoPreview(preview)
    setFotoBlob(null)

    // Comprimir
    setComprimiendo(true)
    try {
      const blob = await comprimirImagen(file, 0.25, 1024)
      setFotoBlob(blob)
    } catch {
      setFotoBlob(file) // Fallback: usar original
    }
    setComprimiendo(false)

    // Limpiar el input para permitir retomar la misma foto
    e.target.value = ''
  }

  // ── Paso 1: validar formulario y avanzar ──────────────────────────────────
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!nombre.trim()) { setErrorMsg('El nombre es obligatorio.'); return }
    if (gpsEstado !== 'ok' || !lat || !lng) {
      setErrorMsg('Necesitamos tu ubicación GPS. Activalo e intentá de nuevo.')
      return
    }

    // Sin conexión: guardar en IndexedDB y volver a captura con ID temporal
    if (!navigator.onLine) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`
      startTransition(async () => {
        const pendientes: ComercioTempItem[] = (await get('comercios_pendientes')) ?? []
        pendientes.push({
          tempId,
          nombre: nombre.trim(),
          tipo,
          direccion: direccion || null,
          lat: lat!,
          lng: lng!,
          timestamp: Date.now(),
          localidad_id: localidadId,
        })
        await set('comercios_pendientes', pendientes)
        const params = new URLSearchParams()
        if (campanaId) params.set('campana', campanaId)
        params.set('comercio_nuevo', tempId)
        router.push(`/gondolero/captura?${params.toString()}`)
      })
      return
    }

    // Online → ir al paso de foto de fachada
    setPaso('fachada')
  }

  // ── Paso 2: enviar con o sin foto ─────────────────────────────────────────
  const handleSubmitFinal = (conFoto: boolean) => {
    setErrorMsg(null)
    const fd = new FormData()
    fd.set('nombre',     nombre.trim())
    fd.set('tipo',       tipo)
    fd.set('direccion',  direccion)
    fd.set('lat',        String(lat))
    fd.set('lng',        String(lng))
    fd.set('campana_id', campanaId)
    if (localidadId) fd.set('localidad_id', String(localidadId))

    if (conFoto && fotoBlob) {
      fd.set('foto_fachada', fotoBlob, 'fachada.jpg')
    }

    startTransition(async () => {
      const result = await crearComercio(fd)
      if (result?.error) {
        setErrorMsg(result.error)
        setPaso('formulario')
      }
    })
  }

  // ── Render: paso de fachada ────────────────────────────────────────────────
  if (paso === 'fachada') {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4 flex items-center gap-3">
          <button
            onClick={() => setPaso('formulario')}
            className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-base font-bold text-gray-900">Foto de fachada</h1>
        </div>

        <div className="px-4 py-6 space-y-5">
          {/* Instrucción */}
          <div className="text-center space-y-1.5">
            <p className="text-base font-semibold text-gray-900">
              Sacá una foto de la fachada del local
            </p>
            <p className="text-sm text-gray-500">
              Ayuda a verificar que el comercio existe
            </p>
          </div>

          {/* Área de foto */}
          {fotoPreview ? (
            <div className="space-y-3">
              <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-video">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={fotoPreview}
                  alt="Fachada"
                  className="w-full h-full object-cover"
                />
                {comprimiendo && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <Loader2 size={24} className="text-white animate-spin" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="w-full py-3 border border-gray-300 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Repetir foto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-10 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center gap-3 text-gray-500 hover:border-gondo-verde-400 hover:text-gondo-verde-400 transition-colors"
            >
              <Camera size={36} className="text-gray-300" />
              <div className="text-center">
                <p className="font-semibold text-sm">Sacar foto</p>
                <p className="text-xs text-gray-400 mt-0.5">Abre la cámara de tu dispositivo</p>
              </div>
            </button>
          )}

          {/* Input cámara oculto */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Error */}
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}

          {/* Botones */}
          <div className="space-y-2 pt-1">
            {fotoPreview && (
              <button
                onClick={() => handleSubmitFinal(true)}
                disabled={isPending || comprimiendo}
                className="w-full py-4 bg-gondo-verde-400 text-white font-semibold rounded-2xl text-base disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch flex items-center justify-center gap-2"
              >
                {comprimiendo
                  ? <><Loader2 size={18} className="animate-spin" /> Procesando foto...</>
                  : isPending
                    ? <><Loader2 size={18} className="animate-spin" /> Guardando...</>
                    : 'Guardar con foto'
                }
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSubmitFinal(false)}
              disabled={isPending}
              className="w-full py-3.5 text-gray-500 font-medium text-sm rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 min-h-touch"
            >
              {isPending && !fotoPreview
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Guardando...</span>
                : 'Omitir por ahora'
              }
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: paso del formulario ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold text-gray-900">Agregar comercio nuevo</h1>
      </div>

      <form onSubmit={handleFormSubmit} className="px-4 py-5 space-y-5">

        {/* GPS */}
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${
          gpsEstado === 'ok'
            ? 'bg-gondo-verde-50 border-gondo-verde-400/30'
            : gpsEstado === 'error'
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-gray-200'
        }`}>
          {gpsEstado === 'obteniendo' && (
            <Loader2 size={18} className="text-gondo-verde-400 animate-spin shrink-0" />
          )}
          {gpsEstado === 'ok' && (
            <MapPin size={18} className="text-gondo-verde-400 shrink-0" />
          )}
          {(gpsEstado === 'idle' || gpsEstado === 'error') && (
            <Navigation size={18} className="text-gray-400 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            {gpsEstado === 'obteniendo' && (
              <p className="text-sm text-gray-600">Obteniendo ubicación...</p>
            )}
            {gpsEstado === 'ok' && (
              <p className="text-sm font-medium text-gondo-verde-400">Ubicación obtenida ✓</p>
            )}
            {gpsEstado === 'idle' && (
              <p className="text-sm text-gray-500">GPS necesario para registrar el comercio</p>
            )}
            {gpsEstado === 'error' && (
              <>
                <p className="text-sm text-red-600">{gpsError}</p>
                <button
                  type="button"
                  onClick={obtenerGPS}
                  className="text-sm font-semibold text-red-600 underline mt-1"
                >
                  Reintentar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Nombre del comercio <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Almacén Don Juan"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
            autoComplete="off"
          />
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo de comercio <span className="text-red-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left transition-colors min-h-touch ${
                  tipo === t.value
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
            value={direccion}
            onChange={e => setDireccion(e.target.value)}
            placeholder="Ej: San Martín 450, Concordia"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
            autoComplete="street-address"
          />
        </div>

        {/* Localidad */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Localidad <span className="text-gray-400 font-normal">(opcional — ayuda a filtrar campañas)</span>
          </label>
          <div className="space-y-2">
            <select
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base bg-white"
              value={provinciaId}
              onChange={e => {
                setProvinciaId(e.target.value ? Number(e.target.value) : '')
              }}
            >
              <option value="">Provincia…</option>
              {provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {provinciaId !== '' && (
              <select
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base bg-white"
                value={departamentoId}
                onChange={e => setDepartamentoId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Departamento…</option>
                {departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            )}
            {departamentoId !== '' && localidades.length > 0 && (
              <select
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base bg-white"
                value={localidadId ?? ''}
                onChange={e => setLocalidadId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Localidad…</option>
                {localidades.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            )}
          </div>
          {localidadId && (
            <p className="text-xs text-gondo-verde-400 font-medium pl-1">
              ✓ {localidades.find(l => l.id === localidadId)?.nombre} seleccionada
            </p>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-600">{errorMsg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending || gpsEstado === 'obteniendo'}
          className="w-full py-4 bg-gondo-verde-400 text-white font-semibold rounded-2xl text-base disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch flex items-center justify-center gap-2"
        >
          {isPending
            ? <><Loader2 size={18} className="animate-spin" /> Guardando...</>
            : 'Siguiente → Foto de fachada'
          }
        </button>

      </form>
    </div>
  )
}

export default function NuevoComercioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="text-gondo-verde-400 animate-spin" />
      </div>
    }>
      <NuevoComercioForm />
    </Suspense>
  )
}
