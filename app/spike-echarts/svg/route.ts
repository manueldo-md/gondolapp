/**
 * SPIKE etapa 2 — el mismo SVG servido crudo.
 * Abrirlo directo es la prueba más dura de que no necesita JavaScript: el
 * browser lo pinta como imagen, sin runtime de React ni de Next.
 */
import { barraHorizontalSVG } from '@/lib/spike/grafico-barras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const svg = barraHorizontalSVG(
    [
      { etiqueta: 'Arcor',     valor: 14 },
      { etiqueta: 'Georgalos', valor: 11 },
      { etiqueta: 'Molinos',   valor: 6 },
      { etiqueta: 'Otros',     valor: 2 },
    ],
    { ancho: 620 }
  )
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
