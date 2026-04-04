'use client'

import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function ProgressBar() {
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)
  const [width,   setWidth]   = useState(0)

  useEffect(() => {
    setVisible(true)
    setWidth(0)

    // Salta a 85% enseguida, simula carga, luego cierra
    const t1 = setTimeout(() => setWidth(85),  10)
    const t2 = setTimeout(() => setWidth(100), 280)
    const t3 = setTimeout(() => setVisible(false), 520)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [pathname, searchParams])

  if (!visible) return null

  return (
    <div
      className="fixed top-0 left-0 z-[200] h-0.5 bg-gondo-verde-400 transition-[width] duration-300 ease-out"
      style={{ width: `${width}%` }}
    />
  )
}

// useSearchParams requiere Suspense boundary
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  )
}
