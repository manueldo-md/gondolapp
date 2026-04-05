'use client'
import { EvolucionChart } from './dashboard-charts'
import type { EvolucionData } from './dashboard-charts'

export default function ChartEvolucion({ data }: { data: EvolucionData[] }) {
  return <EvolucionChart data={data} />
}
