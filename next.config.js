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
        pathname: '/storage/v1/object/public/**',
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
  env: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'GondolApp',
    NEXT_PUBLIC_GPS_RADIO_METROS: process.env.NEXT_PUBLIC_GPS_RADIO_METROS || '50',
  },
}

module.exports = nextConfig
