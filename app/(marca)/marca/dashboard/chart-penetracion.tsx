'use client'
import { PenetracionChart } from './dashboard-charts'
import type { PenetracionData } from './dashboard-charts'

export default function ChartPenetracion({ data }: { data: PenetracionData[] }) {
  return <PenetracionChart data={data} />
}
