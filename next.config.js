/** @type {import('next').NextConfig} */
const nextConfig = {
  // PWA — para que funcione offline en celulares de gondoleros
  // En V2 agregar next-pwa aquí

  // Imágenes — permitir las de Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // Headers de seguridad
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
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
