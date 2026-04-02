'use client'

import { useState, useEffect, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft, Navigation, Loader2, MapPin } from 'lucide-react'
import { crearComercio } from './actions'
import type { TipoComercio } from '@/types'

const TIPOS: { value: TipoComercio; label: string; emoji: string }[] = [
  { value: 'autoservicio', label: 'Autoservicio', emoji: '🏪' },
  { value: 'almacen',      label: 'Almacén',      emoji: '🧺' },
  { value: 'kiosco',       label: 'Kiosco',        emoji: '🗞️' },
  { value: 'mayorista',    label: 'Mayorista',     emoji: '📦' },
  { value: 'otro',         label: 'Otro',          emoji: '🏬' },
]

function NuevoComercioForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const nombreParam = searchParams.get('nombre') ?? ''
  const campanaId   = searchParams.get('campana') ?? ''

  const [nombre,    setNombre]    = useState(nombreParam)
  const [tipo,      setTipo]      = useState<TipoComercio>('autoservicio')
  const [direccion, setDireccion] = useState('')
  const [lat,       setLat]       = useState<number | null>(null)
  const [lng,       setLng]       = useState<number | null>(null)
  const [gpsEstado, setGpsEstado] = useState<'idle' | 'obteniendo' | 'ok' | 'error'>('idle')
  const [gpsError,  setGpsError]  = useState<string | null>(null)
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null)

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!nombre.trim()) { setErrorMsg('El nombre es obligatorio.'); return }
    if (gpsEstado !== 'ok' || !lat || !lng) {
      setErrorMsg('Necesitamos tu ubicación GPS. Activalo e intentá de nuevo.')
      return
    }

    const fd = new FormData()
    fd.set('nombre',    nombre.trim())
    fd.set('tipo',      tipo)
    fd.set('direccion', direccion)
    fd.set('lat',       String(lat))
    fd.set('lng',       String(lng))
    fd.set('campana_id', campanaId)

    startTransition(async () => {
      const result = await crearComercio(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

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

      <form onSubmit={handleSubmit} className="px-4 py-5 space-y-5">

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
            : 'Guardar comercio'
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
