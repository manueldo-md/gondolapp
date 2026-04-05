'use client'

import { CoverageMap } from './coverage-map'
import type { ZonaMapData } from './coverage-map'

export default function MapaCobertura({ zonas }: { zonas: ZonaMapData[] }) {
  return <CoverageMap zonas={zonas} />
}
