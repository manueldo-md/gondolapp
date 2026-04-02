'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import {
  MoreHorizontal, X, Eye, EyeOff, Loader2, ExternalLink, AlertTriangle,
} from 'lucide-react'
import type { TipoActor } from '@/types'
import {
  cambiarPasswordAdmin,
  enviarEmailRecuperacion,
  toggleActivarCuenta,
  editarPerfilAdmin,
  eliminarUsuario,
  cambiarTipoActor,
} from './actions'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface UsuarioData {
  id: string
  email: string
  nombre: string | null
  celular: string | null
  tipo_actor: string
  activo: boolean
  distri_id: string | null
  marca_id: string | null
  razon_social?: string | null
  cuit?: string | null
}

type ModalType = null | 'password' | 'editar' | 'eliminar' | 'rol'
const TIPOS_ACTOR: TipoActor[] = ['gondolero', 'fixer', 'distribuidora', 'marca', 'admin']

// ── Helpers ────────────────────────────────────────────────────────────────────

function ModalBase({
  title, onClose, children,
}: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const INPUT = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1E1B4B]'
const BTN_PRIMARY = 'flex-1 py-2.5 bg-[#1E1B4B] text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity'
const BTN_SECONDARY = 'flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 disabled:opacity-50 hover:bg-gray-50 transition-colors'
const MENU_ITEM = 'w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left'

// ── Componente principal ───────────────────────────────────────────────────────

export function AccionesUsuario({
  usuario,
  distribuidoras,
  marcas,
}: {
  usuario: UsuarioData
  distribuidoras: { id: string; razon_social: string }[]
  marcas: { id: string; razon_social: string }[]
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [modal, setModal] = useState<ModalType>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)
  const [activoLocal, setActivoLocal] = useState(usuario.activo)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cerrar menú al click fuera
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const openModal = (m: ModalType) => { setMenuOpen(false); setModal(m); setFeedback(null) }
  const closeModal = () => { setModal(null); setFeedback(null) }

  const showFeedback = (ok: boolean, msg: string) => {
    setFeedback({ ok, msg })
    if (ok) setTimeout(() => setFeedback(null), 3000)
  }

  // ── Acciones directas ──────────────────────────────────────────────────────

  const handleEnviarRecuperacion = () => {
    setMenuOpen(false)
    startTransition(async () => {
      const res = await enviarEmailRecuperacion(usuario.id, usuario.email)
      showFeedback(!res.error, res.error ?? `Email enviado a ${usuario.email}`)
    })
  }

  const handleToggleActivo = () => {
    setMenuOpen(false)
    const nuevoEstado = !activoLocal
    startTransition(async () => {
      const res = await toggleActivarCuenta(usuario.id, nuevoEstado)
      if (!res.error) {
        setActivoLocal(nuevoEstado)
        showFeedback(true, nuevoEstado ? 'Cuenta activada' : 'Cuenta desactivada')
      } else {
        showFeedback(false, res.error)
      }
    })
  }

  // ── Estados de modales ─────────────────────────────────────────────────────

  // Cambiar contraseña
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)

  const handleCambiarPassword = () => {
    setPassError(null)
    if (newPass.length < 6) { setPassError('Mínimo 6 caracteres.'); return }
    if (newPass !== confirmPass) { setPassError('Las contraseñas no coinciden.'); return }
    startTransition(async () => {
      const res = await cambiarPasswordAdmin(usuario.id, newPass)
      if (res.error) { setPassError(res.error); return }
      setNewPass(''); setConfirmPass('')
      closeModal()
      showFeedback(true, 'Contraseña actualizada')
    })
  }

  // Editar perfil
  const [editForm, setEditForm] = useState({
    nombre:       usuario.nombre ?? '',
    celular:      usuario.celular ?? '',
    distri_id:    usuario.distri_id ?? '',
    marca_id:     usuario.marca_id ?? '',
    tipo_actor:   usuario.tipo_actor,
    razon_social: usuario.razon_social ?? '',
    cuit:         usuario.cuit ?? '',
  })
  const [editError, setEditError] = useState<string | null>(null)

  const handleEditarPerfil = () => {
    setEditError(null)
    if (!editForm.nombre.trim()) { setEditError('El nombre es obligatorio.'); return }
    startTransition(async () => {
      const res = await editarPerfilAdmin(usuario.id, {
        nombre:       editForm.nombre,
        celular:      editForm.celular,
        distri_id:    editForm.distri_id || null,
        marca_id:     editForm.marca_id  || null,
        razon_social: editForm.razon_social || null,
        cuit:         editForm.cuit || null,
      })
      if (res.error) { setEditError(res.error); return }
      closeModal()
      showFeedback(true, 'Perfil actualizado')
    })
  }

  // Cambiar rol
  const handleCambiarRol = (nuevoTipo: TipoActor) => {
    startTransition(async () => {
      await cambiarTipoActor(usuario.id, nuevoTipo)
      closeModal()
      showFeedback(true, `Rol cambiado a ${nuevoTipo}`)
    })
  }

  // Eliminar usuario
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const resetDeleteModal = () => { setDeleteStep(1); setDeleteInput(''); setDeleteError(null) }

  const handleEliminar = () => {
    if (deleteInput !== 'DELETE') { setDeleteError('Escribí exactamente "DELETE" para confirmar.'); return }
    startTransition(async () => {
      const res = await eliminarUsuario(usuario.id)
      if (res.error) { setDeleteError(res.error); return }
      closeModal()
    })
  }

  const mostrarDistri = editForm.tipo_actor === 'gondolero' || editForm.tipo_actor === 'distribuidora'
  const mostrarMarca  = editForm.tipo_actor === 'marca'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={menuRef}>

      {/* Feedback flotante */}
      {feedback && (
        <div className={`absolute right-0 -top-8 z-10 text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap font-medium pointer-events-none ${
          feedback.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Botón trigger */}
      <button
        onClick={() => setMenuOpen(v => !v)}
        disabled={isPending}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
        title="Acciones"
      >
        {isPending ? <Loader2 size={15} className="animate-spin" /> : <MoreHorizontal size={15} />}
      </button>

      {/* Dropdown */}
      {menuOpen && (
        <div className="absolute right-0 top-8 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[210px]">
          <a
            href={`/admin/usuarios/${usuario.id}`}
            className={`${MENU_ITEM} font-medium`}
          >
            <ExternalLink size={12} className="shrink-0" />
            Ver detalle completo
          </a>

          <div className="border-t border-gray-100 my-1" />

          <button onClick={() => openModal('editar')} className={MENU_ITEM}>
            <span className="w-3 h-3 shrink-0" />
            Editar perfil
          </button>
          <button onClick={() => openModal('password')} className={MENU_ITEM}>
            <span className="w-3 h-3 shrink-0" />
            Cambiar contraseña
          </button>
          <button onClick={handleEnviarRecuperacion} className={MENU_ITEM}>
            <span className="w-3 h-3 shrink-0" />
            Enviar email de recuperación
          </button>
          <button onClick={() => openModal('rol')} className={MENU_ITEM}>
            <span className="w-3 h-3 shrink-0" />
            Cambiar rol
          </button>

          <div className="border-t border-gray-100 my-1" />

          <button
            onClick={handleToggleActivo}
            className={`${MENU_ITEM} ${activoLocal ? 'text-amber-600 hover:bg-amber-50' : 'text-green-600 hover:bg-green-50'}`}
          >
            <span className="w-3 h-3 shrink-0" />
            {activoLocal ? 'Desactivar cuenta' : 'Activar cuenta'}
          </button>

          <div className="border-t border-gray-100 my-1" />

          <button
            onClick={() => { openModal('eliminar'); resetDeleteModal() }}
            className={`${MENU_ITEM} text-red-600 hover:bg-red-50`}
          >
            <span className="w-3 h-3 shrink-0" />
            Eliminar usuario
          </button>
        </div>
      )}

      {/* ── MODAL: Cambiar contraseña ─────────────────────────────────────── */}
      {modal === 'password' && (
        <ModalBase title="Cambiar contraseña" onClose={closeModal}>
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={`${INPUT} pr-10`}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder="Repetí la contraseña"
                className={INPUT}
                onKeyDown={e => e.key === 'Enter' && handleCambiarPassword()}
              />
            </div>
            {passError && <p className="text-red-600 text-xs">{passError}</p>}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={closeModal} disabled={isPending} className={BTN_SECONDARY}>Cancelar</button>
            <button
              onClick={handleCambiarPassword}
              disabled={isPending || !newPass || !confirmPass}
              className={BTN_PRIMARY}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
            </button>
          </div>
        </ModalBase>
      )}

      {/* ── MODAL: Editar perfil ──────────────────────────────────────────── */}
      {modal === 'editar' && (
        <ModalBase title="Editar perfil" onClose={closeModal}>
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Nombre</label>
              <input
                type="text"
                value={editForm.nombre}
                onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre completo"
                className={INPUT}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Celular <span className="text-gray-400 font-normal normal-case">(opcional)</span>
              </label>
              <input
                type="tel"
                value={editForm.celular}
                onChange={e => setEditForm(f => ({ ...f, celular: e.target.value }))}
                placeholder="11 2345-6789"
                className={INPUT}
              />
            </div>
            {mostrarDistri && distribuidoras.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Distribuidora <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <select
                  value={editForm.distri_id}
                  onChange={e => setEditForm(f => ({ ...f, distri_id: e.target.value }))}
                  className={`${INPUT} bg-white`}
                >
                  <option value="">Sin distribuidora</option>
                  {distribuidoras.map(d => (
                    <option key={d.id} value={d.id}>{d.razon_social}</option>
                  ))}
                </select>
              </div>
            )}
            {mostrarMarca && marcas.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Marca <span className="text-gray-400 font-normal normal-case">(opcional)</span>
                </label>
                <select
                  value={editForm.marca_id}
                  onChange={e => setEditForm(f => ({ ...f, marca_id: e.target.value }))}
                  className={`${INPUT} bg-white`}
                >
                  <option value="">Sin marca</option>
                  {marcas.map(m => (
                    <option key={m.id} value={m.id}>{m.razon_social}</option>
                  ))}
                </select>
              </div>
            )}
            {(editForm.tipo_actor === 'distribuidora' || editForm.tipo_actor === 'marca') && (
              <>
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
                    Datos de la empresa
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Razón social</label>
                  <input
                    type="text"
                    value={editForm.razon_social}
                    onChange={e => setEditForm(f => ({ ...f, razon_social: e.target.value }))}
                    placeholder="Nombre legal de la empresa"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">CUIT</label>
                  <input
                    type="text"
                    value={editForm.cuit}
                    onChange={e => setEditForm(f => ({ ...f, cuit: e.target.value }))}
                    placeholder="30-12345678-9"
                    className={INPUT}
                    inputMode="numeric"
                  />
                </div>
              </>
            )}
            {editError && <p className="text-red-600 text-xs">{editError}</p>}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={closeModal} disabled={isPending} className={BTN_SECONDARY}>Cancelar</button>
            <button
              onClick={handleEditarPerfil}
              disabled={isPending || !editForm.nombre.trim()}
              className={BTN_PRIMARY}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
            </button>
          </div>
        </ModalBase>
      )}

      {/* ── MODAL: Cambiar rol ────────────────────────────────────────────── */}
      {modal === 'rol' && (
        <ModalBase title="Cambiar rol" onClose={closeModal}>
          <p className="text-xs text-gray-500 mb-3">
            Rol actual: <span className="font-semibold text-gray-700">{usuario.tipo_actor}</span>
          </p>
          <div className="space-y-1.5">
            {TIPOS_ACTOR.filter(t => t !== usuario.tipo_actor).map(tipo => (
              <button
                key={tipo}
                disabled={isPending}
                onClick={() => handleCambiarRol(tipo)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border border-gray-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <span>→ {tipo}</span>
                {isPending && <Loader2 size={13} className="animate-spin text-gray-400" />}
              </button>
            ))}
          </div>
          <button onClick={closeModal} disabled={isPending} className={`${BTN_SECONDARY} mt-4`} style={{ flex: 'none', width: '100%' }}>
            Cancelar
          </button>
        </ModalBase>
      )}

      {/* ── MODAL: Eliminar usuario ───────────────────────────────────────── */}
      {modal === 'eliminar' && (
        <ModalBase title="Eliminar usuario" onClose={closeModal}>
          {deleteStep === 1 ? (
            <>
              <div className="flex gap-3 mb-4">
                <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">
                    ¿Estás seguro de eliminar este usuario?
                  </p>
                  <p className="text-xs text-gray-500">
                    Se eliminarán permanentemente la cuenta de <span className="font-medium">{usuario.email}</span> y todos sus datos asociados. Esta acción no se puede deshacer.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={closeModal} className={BTN_SECONDARY}>Cancelar</button>
                <button
                  onClick={() => setDeleteStep(2)}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
                >
                  Continuar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700 mb-3">
                Para confirmar, escribí <span className="font-mono font-bold text-red-600">DELETE</span> en el campo:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={e => { setDeleteInput(e.target.value); setDeleteError(null) }}
                placeholder="DELETE"
                className={`${INPUT} font-mono`}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleEliminar()}
              />
              {deleteError && <p className="text-red-600 text-xs mt-2">{deleteError}</p>}
              <div className="flex gap-3 mt-4">
                <button onClick={() => { closeModal(); resetDeleteModal() }} disabled={isPending} className={BTN_SECONDARY}>
                  Cancelar
                </button>
                <button
                  onClick={handleEliminar}
                  disabled={isPending || deleteInput !== 'DELETE'}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-700 transition-colors"
                >
                  {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Eliminar definitivamente'}
                </button>
              </div>
            </>
          )}
        </ModalBase>
      )}

    </div>
  )
}
