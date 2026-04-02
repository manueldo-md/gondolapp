import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Route Handler para el callback de autenticación de Supabase
// Supabase redirige acá después de verificar el magic link o el OTP por email

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Redirigir al destino original o a la raíz
      // El middleware se encarga de redirigir al panel correcto según el rol
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Error en la autenticación
  return NextResponse.redirect(
    `${origin}/auth/error?message=codigo_invalido`
  )
}
