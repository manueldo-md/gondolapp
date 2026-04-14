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
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
      // lh3.googleusercontent.com: destino real del redirect 302 de drive.google.com/thumbnail
      "img-src 'self' blob: data: https://*.supabase.co https://drive.google.com https://*.googleusercontent.com https://picsum.photos",
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
