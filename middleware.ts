import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { TipoActor } from '@/types'

// Rutas públicas — no requieren autenticación
const RUTAS_PUBLICAS = [
  '/auth',
  '/auth/callback',
  '/auth/error',
  '/auth/recuperar',
  '/auth/nueva-password',
]

// Destino por tipo de actor después del login
const DESTINO_POR_ACTOR: Record<TipoActor, string> = {
  gondolero:     '/gondolero/campanas',
  fixer:         '/gondolero/campanas',  // misma interfaz que gondolero
  distribuidora: '/distribuidora/gondolas',
  marca:         '/marca/dashboard',
  admin:         '/admin/tablero',
}

// Prefijos de ruta permitidos por tipo de actor
const RUTAS_PERMITIDAS: Record<TipoActor, string[]> = {
  gondolero:     ['/gondolero'],
  fixer:         ['/gondolero'],
  distribuidora: ['/distribuidora'],
  marca:         ['/marca'],
  admin:         ['/admin', '/gondolero', '/distribuidora', '/marca'], // admin ve todo
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  // Siempre permitir rutas públicas y assets
  const esPublica = RUTAS_PUBLICAS.some(r => pathname.startsWith(r))
  const esAsset = pathname.startsWith('/_next') ||
                  pathname.startsWith('/api') ||
                  pathname.includes('.') // archivos estáticos

  if (esPublica || esAsset) {
    return supabaseResponse
  }

  // Verificar sesión
  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesión → al login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/auth'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Obtener tipo de actor del perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('tipo_actor')
    .eq('id', user.id)
    .single()

  const tipoActor = profile?.tipo_actor as TipoActor | null

  // Sin perfil → error
  if (!tipoActor) {
    const errorUrl = request.nextUrl.clone()
    errorUrl.pathname = '/auth/error'
    errorUrl.searchParams.set('message', 'perfil_no_encontrado')
    return NextResponse.redirect(errorUrl)
  }

  // Redirigir desde la raíz al destino correcto
  if (pathname === '/') {
    const destino = request.nextUrl.clone()
    destino.pathname = DESTINO_POR_ACTOR[tipoActor]
    return NextResponse.redirect(destino)
  }

  // Verificar acceso a la ruta actual
  const rutasPermitidas = RUTAS_PERMITIDAS[tipoActor] || []
  const tieneAcceso = rutasPermitidas.some(r => pathname.startsWith(r))

  if (!tieneAcceso) {
    // Redirigir a su destino correspondiente
    const destino = request.nextUrl.clone()
    destino.pathname = DESTINO_POR_ACTOR[tipoActor]
    return NextResponse.redirect(destino)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
