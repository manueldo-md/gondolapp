'use client'
import { PresenciaPieChart } from './dashboard-charts'

export default function ChartPresenciaPie({ presente, ausente }: { presente: number; ausente: number }) {
  return <PresenciaPieChart presente={presente} ausente={ausente} />
}
