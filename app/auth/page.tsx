'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { schemaLogin, schemaRegistro, type LoginForm, type RegistroForm } from '@/lib/validations'
import type { TipoActor } from '@/types'
import { generarAlias } from '@/lib/aliases'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Fase = 'bienvenida' | 'login' | 'registro' | 'zonas'

const OPCIONES_TIPO: Array<{
  tipo: Exclude<TipoActor, 'admin' | 'repositora'>
  label: string
  descripcion: string
  emoji: string
}> = [
  {
    tipo: 'gondolero',
    label: 'Soy gondolero',
    descripcion: 'Visito comercios y fotografío góndolas',
    emoji: '📷',
  },
  {
    tipo: 'distribuidora',
    label: 'Soy distribuidora',
    descripcion: 'Gestiono vendedores y campañas',
    emoji: '🚛',
  },
  {
    tipo: 'marca',
    label: 'Soy marca',
    descripcion: 'Quiero ver mi presencia en góndola',
    emoji: '🏷️',
  },
]

// ── Componente interno (necesita Suspense por useSearchParams) ────────────────

function AuthContent() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'

  const [fase, setFase] = useState<Fase>('bienvenida')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mostrarPassword, setMostrarPassword] = useState(false)
  const [mostrarConfirm, setMostrarConfirm] = useState(false)
  const [distribuidoras, setDistribuidoras] = useState<{ id: string; razon_social: string }[]>([])
  const [zonas, setZonas] = useState<{ id: string; nombre: string }[]>([])
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [guardandoZonas, setGuardandoZonas] = useState(false)

  const formLogin = useForm<LoginForm>({
    resolver: zodResolver(schemaLogin),
  })

  const formRegistro = useForm<RegistroForm>({
    resolver: zodResolver(schemaRegistro),
    defaultValues: { tipo_actor: 'gondolero' },
  })

  const tipoActorSeleccionado = formRegistro.watch('tipo_actor')

  // Cargar distribuidoras cuando se selecciona gondolero
  useEffect(() => {
    if (tipoActorSeleccionado !== 'gondolero') return
    supabase
      .from('distribuidoras')
      .select('id, razon_social')
      .eq('validada', true)
      .order('razon_social')
      .then(({ data }) => setDistribuidoras(data ?? []))
  }, [tipoActorSeleccionado]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const handleLogin = async (data: LoginForm) => {
    setCargando(true)
    setError(null)

    const { error: err } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (err) {
      setError(
        err.message.toLowerCase().includes('invalid login credentials') ||
        err.message.toLowerCase().includes('invalid credentials')
          ? 'Email o contraseña incorrectos.'
          : 'No pudimos iniciar sesión. Intentá de nuevo.'
      )
      setCargando(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  // ── REGISTRO ──────────────────────────────────────────────────────────────
  const handleRegistro = async (data: RegistroForm) => {
    setCargando(true)
    setError(null)

    // Para gondoleros: generar alias único antes de crear la cuenta
    let alias: string | null = null
    if (data.tipo_actor === 'gondolero') {
      try {
        alias = await generarAlias(supabase)
      } catch {
        // Si falla la generación del alias, continuar sin él — se puede asignar después
      }
    }

    const { data: signUpData, error: err } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          tipo_actor: data.tipo_actor,
          nombre: data.nombre,
          alias: alias,
          celular: data.celular || null,
          distri_id: data.distri_id || null,
        },
      },
    })

    if (err) {
      setError(
        err.message.toLowerCase().includes('already registered') ||
        err.message.toLowerCase().includes('user already registered')
          ? 'Ya existe una cuenta con ese email. ¿Querés iniciar sesión?'
          : 'No pudimos crear tu cuenta. Intentá de nuevo.'
      )
      setCargando(false)
      return
    }

    // Si email confirmation está desactivado en Supabase → sesión inmediata
    if (signUpData.session) {
      // Para gondoleros → mostrar paso de selección de zonas
      if (data.tipo_actor === 'gondolero') {
        const { data: zonasData } = await supabase
          .from('zonas')
          .select('id, nombre')
          .eq('tipo', 'ciudad')
          .order('nombre')
        const ciudades = zonasData ?? []
        if (ciudades.length > 0) {
          setUserId(signUpData.session.user.id)
          setZonas(ciudades)
          setCargando(false)
          setFase('zonas')
          return
        }
      }
      router.push(redirect)
      router.refresh()
      return
    }

    // Si está activado → pedir que confirmen email
    setError(null)
    setCargando(false)
    setFase('bienvenida')
    // Mostrar mensaje de confirmación (manejado arriba con un estado separado si fuera necesario)
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gondo-verde-400 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">GondolApp</h1>
          <p className="text-gray-500 text-sm mt-1">El mapa del consumo masivo argentino</p>
        </div>

        {/* ── BIENVENIDA ── */}
        {fase === 'bienvenida' && (
          <div className="space-y-3">
            <button
              onClick={() => { setError(null); setFase('login') }}
              className="w-full py-3 px-4 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              Ya tengo cuenta — Entrar
            </button>
            <button
              onClick={() => { setError(null); setFase('registro') }}
              className="w-full py-3 px-4 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors min-h-touch"
            >
              Registrarme
            </button>
          </div>
        )}

        {/* ── LOGIN ── */}
        {fase === 'login' && (
          <form onSubmit={formLogin.handleSubmit(handleLogin)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                {...formLogin.register('email')}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="email"
                inputMode="email"
                autoFocus
              />
              {formLogin.formState.errors.email && (
                <p className="text-red-600 text-sm mt-1">
                  {formLogin.formState.errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  {...formLogin.register('password')}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formLogin.formState.errors.password && (
                <p className="text-red-600 text-sm mt-1">
                  {formLogin.formState.errors.password.message}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {error}
                {error.includes('sesión') && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setFase('login') }}
                    className="block mt-1 font-medium underline"
                  >
                    Ir a iniciar sesión →
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {cargando ? 'Ingresando...' : 'Entrar'}
            </button>

            <a
              href="/auth/recuperar"
              className="block w-full py-1 text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </a>

            <button
              type="button"
              onClick={() => { setError(null); setFase('bienvenida') }}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              ← Volver
            </button>
          </form>
        )}

        {/* ── ZONAS ── */}
        {fase === 'zonas' && (
          <div className="space-y-4">
            <div className="text-center mb-2">
              <p className="text-base font-bold text-gray-900">¿En qué ciudades trabajás?</p>
              <p className="text-sm text-gray-500 mt-1">
                Seleccioná tus zonas para ver las campañas de tu área. Podés cambiarlo después desde tu Perfil.
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-3">
              {zonas.map(zona => (
                <label
                  key={zona.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={zonasSeleccionadas.includes(zona.id)}
                    onChange={() => setZonasSeleccionadas(prev =>
                      prev.includes(zona.id) ? prev.filter(z => z !== zona.id) : [...prev, zona.id]
                    )}
                    className="w-4 h-4 accent-gondo-verde-400 shrink-0"
                  />
                  <span className="text-sm text-gray-800">{zona.nombre}</span>
                </label>
              ))}
            </div>
            <button
              onClick={async () => {
                setGuardandoZonas(true)
                if (zonasSeleccionadas.length > 0 && userId) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (supabase as any).from('gondolero_zonas').insert(
                    zonasSeleccionadas.map(zona_id => ({ gondolero_id: userId, zona_id }))
                  )
                }
                router.push(redirect)
                router.refresh()
              }}
              disabled={guardandoZonas}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {guardandoZonas
                ? 'Guardando...'
                : zonasSeleccionadas.length > 0
                  ? `Guardar y empezar (${zonasSeleccionadas.length})`
                  : 'Guardar y empezar'}
            </button>
            <button
              type="button"
              disabled={guardandoZonas}
              onClick={() => { router.push(redirect); router.refresh() }}
              className="w-full py-2 text-gray-400 text-sm hover:text-gray-600 transition-colors"
            >
              Omitir por ahora
            </button>
          </div>
        )}

        {/* ── REGISTRO ── */}
        {fase === 'registro' && (
          <form onSubmit={formRegistro.handleSubmit(handleRegistro)} className="space-y-4">

            {/* Tipo de actor */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">¿Quién sos?</p>
              <div className="space-y-2">
                {OPCIONES_TIPO.map(opcion => (
                  <button
                    key={opcion.tipo}
                    type="button"
                    onClick={() => formRegistro.setValue('tipo_actor', opcion.tipo)}
                    className={`w-full flex items-center gap-3 p-3 border rounded-xl text-left transition-colors ${
                      tipoActorSeleccionado === opcion.tipo
                        ? 'border-gondo-verde-400 bg-gondo-verde-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-2xl shrink-0">{opcion.emoji}</span>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{opcion.label}</p>
                      <p className="text-gray-500 text-xs">{opcion.descripcion}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tu nombre
              </label>
              <input
                type="text"
                {...formRegistro.register('nombre')}
                placeholder={tipoActorSeleccionado === 'gondolero' ? 'Agustín R.' : 'Razón social o nombre'}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="name"
              />
              {formRegistro.formState.errors.nombre && (
                <p className="text-red-600 text-sm mt-1">
                  {formRegistro.formState.errors.nombre.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                {...formRegistro.register('email')}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                autoComplete="email"
                inputMode="email"
              />
              {formRegistro.formState.errors.email && (
                <p className="text-red-600 text-sm mt-1">
                  {formRegistro.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={mostrarPassword ? 'text' : 'password'}
                  {...formRegistro.register('password')}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formRegistro.formState.errors.password && (
                <p className="text-red-600 text-sm mt-1">
                  {formRegistro.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirmar contraseña
              </label>
              <div className="relative">
                <input
                  type={mostrarConfirm ? 'text' : 'password'}
                  {...formRegistro.register('confirmPassword')}
                  placeholder="Repetí tu contraseña"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {mostrarConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formRegistro.formState.errors.confirmPassword && (
                <p className="text-red-600 text-sm mt-1">
                  {formRegistro.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Celular — solo gondoleros */}
            {tipoActorSeleccionado === 'gondolero' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Celular <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="tel"
                  {...formRegistro.register('celular')}
                  placeholder="11 2345-6789"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base"
                  autoComplete="tel"
                  inputMode="tel"
                />
                {formRegistro.formState.errors.celular && (
                  <p className="text-red-600 text-sm mt-1">
                    {formRegistro.formState.errors.celular.message}
                  </p>
                )}
              </div>
            )}

            {/* Distribuidora — solo gondoleros */}
            {tipoActorSeleccionado === 'gondolero' && distribuidoras.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ¿Para qué distribuidora trabajás? <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select
                  {...formRegistro.register('distri_id')}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-base bg-white"
                >
                  <option value="">Sin distribuidora</option>
                  {distribuidoras.map(d => (
                    <option key={d.id} value={d.id}>{d.razon_social}</option>
                  ))}
                </select>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {error}
                {error.includes('iniciar sesión') && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setFase('login') }}
                    className="block mt-1 font-medium underline"
                  >
                    Ir a iniciar sesión →
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {cargando ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>

            <button
              type="button"
              onClick={() => { setError(null); setFase('bienvenida') }}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              ← Volver
            </button>
          </form>
        )}

      </div>
    </div>
  )
}

// ── Page export con Suspense (requerido por useSearchParams en Next.js 14) ────

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gondo-verde-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AuthContent />
    </Suspense>
  )
}
