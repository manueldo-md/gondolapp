// ── La versión del service worker ────────────────────────────────────────────
// El SW se registra como `/sw.js?v=<esto>` y usa el mismo valor como nombre de
// su cache. Cambiar el scriptURL es lo que hace que el browser reinstale y que
// `activate` borre el cache anterior; sin eso, la versión era una constante
// que alguien tenía que acordarse de bumpear en cada deploy.
//
// El SHA del commit y no un timestamp, por dos razones: next.config.js se
// evalúa más de una vez por build (compilación de server y de cliente) y dos
// `Date.now()` distintos darían dos versiones distintas en el mismo deploy; y
// además el SHA es rastreable — la versión del cache dice de qué commit salió.
//
// ── DOS FUENTES, Y NINGUNA ES UN DEFAULT SILENCIOSO ─────────────────────────
// `VERCEL_GIT_COMMIT_SHA` existe en el build de Vercel, pero solo si el
// proyecto tiene activado "Automatically expose System Environment Variables".
// Si está apagado, la variable simplemente no está — y caer a un nombre fijo
// es volver al bug que este valor vino a cerrar, en silencio.
//
// Por eso hay un segundo origen: el SHA leído del repo, que en el build de
// Vercel está clonado. Y si los dos fallan estando en Vercel, el build CORTA:
// un deploy que no puede versionar su cache es exactamente el problema.
// `generate-sw-manifest.js` verifica además que el valor haya llegado al
// bundle, que es lo que acá no se puede comprobar.
function calcularBuildId() {
  const deVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (deVercel) return deVercel.slice(0, 12)

  try {
    const sha = require('node:child_process')
      .execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    if (/^[0-9a-f]{40}$/.test(sha)) return sha.slice(0, 12)
  } catch { /* sin git: cae abajo */ }

  if (process.env.VERCEL) {
    throw new Error(
      'No se pudo determinar el BUILD_ID del service worker.\n' +
      '  Ni VERCEL_GIT_COMMIT_SHA ni `git rev-parse HEAD` dieron un SHA.\n' +
      '  Activá "Automatically expose System Environment Variables" en el\n' +
      '  proyecto de Vercel. Sin esto el cache del SW queda con nombre fijo y\n' +
      '  los deploys dejan de purgarlo.'
    )
  }
  return 'dev'
}

const BUILD_ID = calcularBuildId()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PWA — para que funcione offline en celulares de gondoleros
  // En V2 agregar next-pwa aquí

  // Server Actions — aumentar el límite para uploads de fotos comprimidas
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },

  // Imágenes — permitir las de Supabase Storage y Google Drive
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        port: '',
        pathname: '/thumbnail',
      },
      {
        // Drive redirige 302 a lh3.googleusercontent.com al servir la imagen
        protocol: 'https',
        hostname: '*.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },

  // Headers de seguridad
  async headers() {
    const csp = [
      "default-src 'self'",
      // unsafe-eval requerido por Supabase Realtime (usa eval() internamente)
      // unsafe-inline requerido por Next.js (inline scripts de hidratación)
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      // wss://*.supabase.co requerido para WebSockets de Realtime
      //
      // Los dominios de imágenes también van acá, no solo en img-src: el
      // service worker intercepta todos los requests que no son de navegación
      // y los re-emite con fetch(), así que una carga de <img> cross-origin
      // deja de estar gobernada por img-src y pasa a estarlo por connect-src.
      // Sin esto el browser tira "Fetch API cannot load ... Refused to connect".
      // Ver el fix de fondo en public/sw.js, que ignora el cross-origin.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://picsum.photos https://*.picsum.photos https://drive.google.com https://*.googleusercontent.com",
      // Hay que permitir el dominio de ENTRADA y el de DESTINO de cada redirect.
      // Ya pasó tres veces:
      //   drive.google.com/thumbnail  → 302 → lh3.googleusercontent.com
      //   picsum.photos               → 302 → fastly.picsum.photos
      // La CSP se evalúa contra la URL final, así que permitir solo el primero
      // no alcanza y el error habla de un dominio que no está en ningún lado
      // del código.
      "img-src 'self' blob: data: https://*.supabase.co https://drive.google.com https://*.googleusercontent.com https://picsum.photos https://*.picsum.photos",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "media-src 'self' blob:",
      // blob: requerido para preview de fotos capturadas con la cámara
      "worker-src 'self' blob:",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },

  // Variables de entorno públicas
  // ── UN SOLO `env`, Y NO ES UN DETALLE DE ESTILO ────────────────────────────
  // El 24/9/2026 se agregó un segundo bloque `env` arriba, con
  // NEXT_PUBLIC_BUILD_ID adentro. Son dos claves iguales en el mismo objeto
  // literal: gana la última, JS no avisa, el build pasa en verde y la variable
  // nunca existió. El síntoma fue un cache llamado `gondolapp-dev` en
  // producción, o sea el nombre fijo que este valor venía a eliminar.
  // Si hace falta exponer algo nuevo, va ACÁ.
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'GondolApp',
    NEXT_PUBLIC_GPS_RADIO_METROS: process.env.NEXT_PUBLIC_GPS_RADIO_METROS || '50',
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
}

module.exports = nextConfig
