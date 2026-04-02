import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SwRegistrar } from '@/components/sw-registrar'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: {
    template: '%s | GondolApp',
    default: 'GondolApp — El mapa del consumo masivo argentino',
  },
  description:
    'Plataforma de inteligencia de mercado para el canal tradicional argentino. ' +
    'Conecta gondoleros, distribuidoras y marcas a través de datos reales de góndola.',
  applicationName: 'GondolApp',
  keywords: ['góndola', 'canal tradicional', 'inteligencia de mercado', 'distribución', 'Argentina'],

  // PWA
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GondolApp',
  },

  // Open Graph
  openGraph: {
    type: 'website',
    siteName: 'GondolApp',
    title: 'GondolApp',
    description: 'El mapa del consumo masivo argentino',
  },
}

export const viewport: Viewport = {
  themeColor: '#1D9E75',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Previene zoom accidental en formularios mobile
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <head>
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className="font-sans antialiased bg-gray-50">
        <SwRegistrar />
        {children}
      </body>
    </html>
  )
}
