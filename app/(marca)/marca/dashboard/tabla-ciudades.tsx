'use client'
import { CiudadTable } from './ciudad-table'
import type { CiudadRow } from './ciudad-table'

export default function TablaCiudades({ rows }: { rows: CiudadRow[] }) {
  return <CiudadTable rows={rows} />
}
