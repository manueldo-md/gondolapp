import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-center">
      <WifiOff size={48} className="text-gray-300 mb-6" />
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Sin conexión</h1>
      <p className="text-gray-500 text-sm max-w-xs mb-2">
        Esta página no está disponible sin internet.
      </p>
      <p className="text-gray-400 text-sm max-w-xs mb-8">
        Podés volver a Campañas para ver las que ya se descargaron, o ir a tu Perfil.
      </p>
      <div className="w-full max-w-xs space-y-3">
        <Link
          href="/gondolero/campanas"
          className="block w-full py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl text-center"
        >
          Ver campañas
        </Link>
        <Link
          href="/gondolero/perfil"
          className="block w-full py-4 border border-gray-200 text-gray-600 font-semibold rounded-2xl text-center"
        >
          Mi perfil
        </Link>
      </div>
    </div>
  )
}
