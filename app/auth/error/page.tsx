import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

const MENSAJES: Record<string, string> = {
  perfil_no_encontrado: 'No encontramos un perfil asociado a tu cuenta. Intentá registrarte de nuevo.',
  codigo_invalido:      'El enlace de verificación es inválido o ya expiró. Solicitá uno nuevo.',
  sesion_expirada:      'Tu sesión expiró. Ingresá de nuevo.',
}

export default function AuthErrorPage({
  searchParams,
}: {
  searchParams: { message?: string }
}) {
  const mensaje =
    MENSAJES[searchParams.message ?? ''] ??
    'Ocurrió un error inesperado durante la autenticación.'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 w-full max-w-sm text-center">

        <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <AlertCircle size={28} className="text-red-400" />
        </div>

        <h1 className="text-lg font-bold text-gray-900 mb-2">Error de autenticación</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{mensaje}</p>

        <Link
          href="/auth"
          className="block w-full py-3 bg-gondo-verde-400 text-white font-semibold rounded-xl hover:bg-gondo-verde-600 transition-colors text-sm"
        >
          Volver al login
        </Link>
      </div>
    </div>
  )
}
