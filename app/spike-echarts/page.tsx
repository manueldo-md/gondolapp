/**
 * SPIKE etapa 2 — ruta suelta para probar ECharts SSR en el runtime de Vercel.
 * No está enlazada desde ningún menú. Se borra cuando se tome la decisión.
 */
import { barraHorizontalSVG } from '@/lib/spike/grafico-barras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATOS = [
  { etiqueta: 'Arcor',     valor: 14 },
  { etiqueta: 'Georgalos', valor: 11 },
  { etiqueta: 'Molinos',   valor: 6 },
  { etiqueta: 'Otros',     valor: 2 },
]

export default function SpikeEchartsPage() {
  const svg = barraHorizontalSVG(DATOS, { ancho: 620 })
  const tieneScript = /<script/i.test(svg)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Spike — ECharts SSR</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gráfico renderizado en el servidor con <code>renderToSVGString()</code>.
            Si ves las barras, corre en el runtime de Vercel.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-800 mb-3">
            ¿Qué competidores están presentes?
          </p>
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
          <p className="font-semibold text-gray-800">Verificación</p>
          <p className={tieneScript ? 'text-red-600' : 'text-green-700'}>
            {tieneScript
              ? '✗ El SVG contiene <script>: NO sirve para el export'
              : '✓ El SVG no contiene ningún <script> — se ve sin JavaScript'}
          </p>
          <p className="text-gray-500">Tamaño del SVG: {svg.length.toLocaleString('es-AR')} bytes</p>
          <p className="text-gray-500">
            El mismo SVG, servido crudo como <code>image/svg+xml</code>:{' '}
            <a href="/spike-echarts/svg" className="text-blue-600 underline">
              /spike-echarts/svg
            </a>{' '}
            — abrilo y vas a ver el gráfico como imagen, sin una línea de JS.
          </p>
        </div>
      </div>
    </div>
  )
}
