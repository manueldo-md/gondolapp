'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { X, Camera } from 'lucide-react'

interface FotoLightboxProps {
  src: string | null
  alt: string
  /** Tailwind classes for the thumbnail container, e.g. "relative w-full h-52 shrink-0" */
  containerClassName?: string
  /** Overlay content rendered on top of the thumbnail (badges, etc.) */
  children?: React.ReactNode
}

export function FotoLightbox({
  src,
  alt,
  containerClassName = 'relative w-full h-52 shrink-0',
  children,
}: FotoLightboxProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, close])

  return (
    <>
      {/* ── Thumbnail trigger ── */}
      <div
        className={`${containerClassName} bg-gray-100 ${src ? 'cursor-zoom-in' : ''}`}
        onClick={() => src && setOpen(true)}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, (max-width: 1280px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Camera size={32} className="text-gray-300" />
          </div>
        )}
        {children}
      </div>

      {/* ── Lightbox modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            onClick={close}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>

          {/* Image — stopPropagation so clicking the image itself doesn't close */}
          <div
            className="relative max-w-5xl w-full"
            onClick={e => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src!}
              alt={alt}
              className="w-full h-auto max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
