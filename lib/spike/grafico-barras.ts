/**
 * SPIKE etapa 2 — barra horizontal con ECharts renderizado en el servidor.
 *
 * No integrar al dashboard todavía: es una prueba para decidir entre ECharts
 * SSR y dibujar el SVG a mano.
 *
 * `ssr: true` + `renderer: 'svg'` + contenedor `null` es el modo documentado
 * para Node: no toca el DOM, no abre el loop de animación y devuelve un string
 * SVG autocontenido que no necesita JavaScript para verse.
 */
import * as echarts from 'echarts'

export interface BarraDato {
  etiqueta: string
  valor: number
}

export function barraHorizontalSVG(
  datos: BarraDato[],
  opts: { ancho?: number; alto?: number; color?: string } = {}
): string {
  const { ancho = 600, alto = 36 * datos.length + 40, color = '#4F46E5' } = opts

  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: ancho,
    height: alto,
  })

  chart.setOption({
    animation: false,
    grid: { left: 140, right: 48, top: 8, bottom: 8, containLabel: false },
    xAxis: { type: 'value', show: false, max: Math.max(...datos.map(d => d.valor), 1) },
    yAxis: {
      type: 'category',
      inverse: true,
      data: datos.map(d => d.etiqueta),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#4B5563', fontSize: 12 },
    },
    series: [{
      type: 'bar',
      data: datos.map(d => d.valor),
      barWidth: 14,
      itemStyle: { color, borderRadius: 7 },
      label: { show: true, position: 'right', color: '#6B7280', fontSize: 12 },
    }],
  })

  const svg = chart.renderToSVGString()
  chart.dispose()
  return svg
}
