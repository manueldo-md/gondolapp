'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { schemaLogin, schemaRegistro, type LoginForm, type RegistroForm } from '@/lib/validations'
import type { TipoActor } from '@/types'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type Fase = 'bienvenida' | 'login' | 'registro' | 'otp'

const OPCIONES_TIPO: Array<{
  tipo: Exclude<TipoActor, 'admin'>
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
  const [faseOrigen, setFaseOrigen] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [otpInput, setOtpInput] = useState('')

  const formLogin = useForm<LoginForm>({
    resolver: zodResolver(schemaLogin),
  })

  const formRegistro = useForm<RegistroForm>({
    resolver: zodResolver(schemaRegistro),
    defaultValues: { tipo_actor: 'gondolero' },
  })

  const tipoActorSeleccionado = formRegistro.watch('tipo_actor')

  // Auto-submit al completar 6 dígitos
  useEffect(() => {
    if (otpInput.length === 6) {
      handleVerificarOTP()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpInput])

  const irAOTP = (emailValue: string, origen: 'login' | 'registro') => {
    setEmail(emailValue)
    setFaseOrigen(origen)
    setFase('otp')
    setCargando(false)
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const handleLogin = async (data: LoginForm) => {
    setCargando(true)
    setError(null)

    const { error: err } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: undefined,
      },
    })

    if (err) {
      setError(
        err.message.toLowerCase().includes('user not found') || err.status === 400
          ? 'No encontramos una cuenta con ese email. ¿Querés registrarte?'
          : 'No pudimos enviarte el código. Intentá de nuevo.'
      )
      setCargando(false)
      return
    }

    irAOTP(data.email, 'login')
  }

  // ── REGISTRO ──────────────────────────────────────────────────────────────
  const handleRegistro = async (data: RegistroForm) => {
    setCargando(true)
    setError(null)

    const { error: err } = await supabase.auth.signInWithOtp({
      email: data.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
        data: {
          tipo_actor: data.tipo_actor,
          nombre: data.nombre,
          celular: data.celular || null,
        },
      },
    })

    if (err) {
      setError('No pudimos crear tu cuenta. Intentá de nuevo.')
      setCargando(false)
      return
    }

    irAOTP(data.email, 'registro')
  }

  // ── VERIFICAR OTP ─────────────────────────────────────────────────────────
  const handleVerificarOTP = async () => {
    if (otpInput.length !== 6 || cargando) return
    setCargando(true)
    setError(null)

    const { error: err } = await supabase.auth.verifyOtp({
      email,
      token: otpInput,
      type: 'email',
    })

    if (err) {
      setError('El código es incorrecto o ya expiró. Pedí uno nuevo.')
      setOtpInput('')
      setCargando(false)
      return
    }

    router.push(redirect)
    router.refresh()
  }

  const handleReenviarOTP = () => {
    setOtpInput('')
    setError(null)
    setFase(faseOrigen)
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
              onClick={() => setFase('login')}
              className="w-full py-3 px-4 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              Ya tengo cuenta — Entrar
            </button>
            <button
              onClick={() => setFase('registro')}
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
                Tu email
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

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {error}
                {error.includes('registrarte') && (
                  <button
                    type="button"
                    onClick={() => { setError(null); setFase('registro') }}
                    className="block mt-1 font-medium underline"
                  >
                    Ir a registro →
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={cargando}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {cargando ? 'Enviando código...' : 'Enviar código de acceso'}
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
                Tu email
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

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                {error}
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

        {/* ── OTP ── */}
        {fase === 'otp' && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-3">📬</div>
              <h2 className="text-lg font-semibold text-gray-900">Revisá tu email</h2>
              <p className="text-gray-500 text-sm mt-1">
                Te mandamos un código de 6 dígitos a{' '}
                <span className="font-medium text-gray-700">{email}</span>
              </p>
            </div>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gondo-verde-400 text-center text-3xl font-mono tracking-widest"
              autoComplete="one-time-code"
              autoFocus
              disabled={cargando}
            />

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm text-center">
                {error}
              </div>
            )}

            <button
              onClick={handleVerificarOTP}
              disabled={otpInput.length !== 6 || cargando}
              className="w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-gondo-verde-600 transition-colors min-h-touch"
            >
              {cargando ? 'Verificando...' : 'Entrar →'}
            </button>

            <button
              type="button"
              onClick={handleReenviarOTP}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 transition-colors"
            >
              No me llegó el código — reenviar
            </button>
          </div>
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
