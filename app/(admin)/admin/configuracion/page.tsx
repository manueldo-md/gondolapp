import { getConfigCompresion } from '@/lib/config'
import { ConfigForm } from './config-form'

export default async function ConfiguracionPage() {
  const config = await getConfigCompresion()

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Parámetros globales de la plataforma</p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Compresión de fotos</h2>
        <p className="text-xs text-gray-400 mb-5">
          Afecta a todas las fotos subidas por gondoleros (online y offline).
          Objetivo: 120–200 KB para legibilidad humana y procesamiento por IA.
        </p>
        <ConfigForm
          maxKb={Math.round(config.maxSizeMB * 1000)}
          maxWidth={config.maxWidth}
          calidad={config.calidad}
        />
      </section>
    </div>
  )
}
