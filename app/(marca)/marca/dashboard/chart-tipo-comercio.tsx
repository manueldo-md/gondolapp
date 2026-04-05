'use client'
import { TipoComercioChart } from './dashboard-charts'
import type { TipoComercioData } from './dashboard-charts'

export default function ChartTipoComercio({ data }: { data: TipoComercioData[] }) {
  return <TipoComercioChart data={data} />
}
