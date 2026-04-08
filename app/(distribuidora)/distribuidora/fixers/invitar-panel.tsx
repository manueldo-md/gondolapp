'use client'

import { useState, useTransition } from 'react'
import { Link2, Hash, Copy, Check, Loader2, Search, UserCheck } from 'lucide-react'
import { generarLinkInvitacionFixer, buscarFixerPorCodigo, confirmarVinculacionPorCodigo } from './invitar-actions'

export function InvitarFixerPanel({
  distriId,
  distriNombre,
}: {
  distriId: string
  distriNombre: string
}) {
  // Link de invitación
  const [link, setLink] = useState<string | null>(null)
  const [linkCopiado, setLinkCopiado] = useState(false)
  const [isPendingLink, startLink] = useTransition()
  const [linkError, setLinkError] = useState<string | null>(null)

  // Código de fixer
  const [codigo, setCodigo] = useState('')
  const [fixerEncontrado, setFixerEncontrado] = useState<{
    id: string; alias: string | null; nombre: string | null
  } | null>(null)
  const [codigoError, setCodigoError] = useState<string | null>(null)
  const [isPendingBuscar, startBuscar] = useTransition()
  const [isPendingVincular, startVincular] = useTransition()
  const [vinculadoOk, setVinculadoOk] = useState(false)
  const [vinculadoNombre, setVinculadoNombre] = useState<string | null>(null)

  const handleGenerarLink = () => {
    setLinkError(null)
    startLink(async () => {
      const res = await generarLinkInvitacionFixer(distriId, distriNombre)
      if (res.error) { setLinkError(res.error); return }
      setLink(res.link!)
    })
  }

  const handleCopiarLink = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setLinkCopiado(true)
    setTimeout(() => setLinkCopiado(false), 2000)
  }

  const handleWhatsApp = () => {
    if (!link) return
    const texto = encodeURIComponent(
      `Te invito a unirte a ${distriNombre} en GondolApp como fixer. Hacé clic acá: ${link}`
    )
    window.open(`https://wa.me/?text=${texto}`, '_blank')
  }

  const handleBuscarCodigo = () => {
    if (!codigo.trim()) return
    setCodigoError(null)
    setFixerEncontrado(null)
    setVinculadoOk(false)
    startBuscar(async () => {
      const res = await buscarFixerPorCodigo(codigo.trim(), distriId)
      if (res.error) { setCodigoError(res.error); return }
      if (res.fixer) setFixerEncontrado(res.fixer)
    })
  }

  const handleVincular = () => {
    if (!fixerEncontrado) return
    const nombre = fixerEncontrado.alias ?? fixerEncontrado.nombre ?? 'El fixer'
    startVincular(async () => {
      const res = await confirmarVinculacionPorCodigo(fixerEncontrado.id, distriId, distriNombre)
      if (res.error) { setCodigoError(res.error); return }
      setVinculadoNombre(nombre)
      setVinculadoOk(true)
      setFixerEncontrado(null)
      setCodigo('')
    })
  }

  return (
    <div className="space-y-4">

      {/* ── Link de invitación ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link2 size={16} className="text-gondo-amber-400" />
          <h3 className="text-sm font-semibold text-gray-700">Invitar fixer por link</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Generá un link único (válido 7 días) y compartilo con el fixer. Al abrirlo, podrá solicitar vincularse a tu distribuidora.
        </p>

        {!link ? (
          <div>
            <button
              onClick={handleGenerarLink}
              disabled={isPendingLink}
              className="flex items-center gap-2 px-4 py-2.5 bg-gondo-amber-400 text-white text-sm font-semibold rounded-lg hover:bg-gondo-amber-600 transition-colors disabled:opacity-50"
            >
              {isPendingLink ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              Generar link de invitación
            </button>
            {linkError && <p className="text-xs text-red-500 mt-2">{linkError}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-600 truncate flex-1 font-mono">{link}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopiarLink}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {linkCopiado ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                {linkCopiado ? 'Copiado' : 'Copiar link'}
              </button>
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                📱 Enviar por WhatsApp
              </button>
              <button
                onClick={() => setLink(null)}
                className="px-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Nuevo link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Código de fixer ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Hash size={16} className="text-gondo-amber-400" />
          <h3 className="text-sm font-semibold text-gray-700">Vincular por código de fixer</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          El fixer te comparte su código personal (ej: FIXR-7823). Ingresalo para enviarle una invitación.
        </p>

        {vinculadoOk && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
            <UserCheck size={15} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-700">Solicitud enviada</p>
              <p className="text-xs text-green-600">{vinculadoNombre ?? 'El fixer'} debe aceptarla desde su perfil.</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={codigo}
            onChange={e => { setCodigo(e.target.value.toUpperCase()); setCodigoError(null); setFixerEncontrado(null); setVinculadoOk(false) }}
            onKeyDown={e => e.key === 'Enter' && handleBuscarCodigo()}
            placeholder="Ej: FIXR-7823"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gondo-amber-400"
          />
          <button
            onClick={handleBuscarCodigo}
            disabled={isPendingBuscar || !codigo.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isPendingBuscar ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Buscar
          </button>
        </div>

        {codigoError && <p className="text-xs text-red-500 mt-2">{codigoError}</p>}

        {fixerEncontrado && (
          <div className="mt-3 p-4 border border-gray-200 rounded-xl bg-gray-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gondo-amber-50 flex items-center justify-center shrink-0">
                <span className="text-gondo-amber-400 font-bold text-sm">
                  {(fixerEncontrado.alias ?? fixerEncontrado.nombre ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {fixerEncontrado.alias ?? fixerEncontrado.nombre ?? 'Fixer'}
                </p>
                <p className="text-xs text-blue-600 font-semibold">Fixer</p>
              </div>
            </div>
            <button
              onClick={handleVincular}
              disabled={isPendingVincular}
              className="flex items-center gap-1.5 px-4 py-2 bg-gondo-verde-400 text-white text-sm font-semibold rounded-lg hover:bg-gondo-verde-600 transition-colors disabled:opacity-50"
            >
              {isPendingVincular ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
              Vincular
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
