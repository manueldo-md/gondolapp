import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function CampanaPageNav({
  nombre,
  volverHref,
  detalleHref,
  resultadosHref,
  activo,
}: {
  nombre: string
  volverHref: string
  detalleHref: string
  resultadosHref: string
  activo: 'detalle' | 'resultados'
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Link href={volverHref} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <h2 className="text-xl font-bold text-gray-900 truncate">{nombre}</h2>
      </div>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <Link
          href={detalleHref}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activo === 'detalle'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Detalle
        </Link>
        <Link
          href={resultadosHref}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activo === 'resultados'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Resultados
        </Link>
      </div>
    </div>
  )
}
