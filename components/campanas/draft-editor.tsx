'use client'

import { useState, useTransition, useRef } from 'react'
import { AlertTriangle, Loader2, MapPin, Camera, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { CamposBloqueBuilder, type CampoBloque } from '@/components/shared/campos-bloque-builder'
import { SelectorZona, type GrupoZona } from '@/components/shared/selector-zona'
import type { DraftData } from '@/app/(marca)/marca/campanas/[id]/detalle/draft-actions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CampoExistente {
  id: string
  tipo: string
  pregunta: string
  opciones: string[] | null
  obligatorio: boolean
  orden: number
}

interface ZonaNueva {
  id: string
  nombre: string
}

interface BloqueNuevo {
  tempId: string
  instruccion: string
  tipo_contenido: string
  campos: CampoBloque[]
}

const TIPO_CONTENIDO_LABEL: Record<string, string> = {
  propios: 'Productos propios', competencia: 'Competencia',
  ambos: 'Ambos', ninguno: 'Sin productos',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  campanaId: string
  instruccionActual: string | null
  puntosActual: number
  tienesDraft: boolean
  draftDescripcion: string | null
  draftBounty: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftZonasGuardadas: any[] | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftBloquesGuardados: any[] | null
  zonasActuales: string[]
  zonasDisponibles: { id: string; nombre: string }[]
  /** IDs (string de integer) de las localidades ya configuradas en la campaña */
  localidadesIds?: string[]
  bloquesActuales: { id: string; instruccion: string; tipo_contenido: string; campos?: CampoExistente[] }[]
  accentColor: 'indigo' | 'amber'
  guardarBorradorFn: (campanaId: string, data: DraftData) => Promise<void>
  republicarFn: (campanaId: string) => Promise<{ error?: string }>
  descartarFn: (campanaId: string) => Promise<void>
}

// ── Componente ────────────────────────────────────────────────────────────────

export function CampanaDraftEditor({
  campanaId,
  instruccionActual,
  puntosActual,
  tienesDraft,
  draftDescripcion,
  draftBounty,
  draftZonasGuardadas,
  draftBloquesGuardados,
  zonasActuales,
  zonasDisponibles,
  localidadesIds,
  bloquesActuales,
  accentColor,
  guardarBorradorFn,
  republicarFn,
  descartarFn,
}: Props) {
  // ── Estado editable ──────────────────────────────────────────────────────────
  const [instruccion, setInstruccion] = useState(
    tienesDraft ? (draftDescripcion ?? instruccionActual ?? '') : (instruccionActual ?? '')
  )
  const [puntos, setPuntos] = useState(
    tienesDraft ? (draftBounty ?? puntosActual) : puntosActual
  )
  const [nuevasZonas, setNuevasZonas] = useState<ZonaNueva[]>(
    tienesDraft ? ((draftZonasGuardadas as ZonaNueva[] | null) ?? []) : []
  )
  // ── SelectorZona state ──────────────────────────────────────────────────────
  const [grupos, setGrupos] = useState<GrupoZona[]>([])
  const prevGrupoIdsRef = useRef<Set<string>>(new Set())
  // Lookup: localidad_id (string) → nombre (from zonasDisponibles)
  const localidadNombreMap = Object.fromEntries(zonasDisponibles.map(z => [z.id, z.nombre]))
  // Set of IDs already configured on the campaign (to avoid duplicates)
  const lIdsConfigurados = new Set(localidadesIds ?? [])

  const [nuevosBloques, setNuevosBloques] = useState<BloqueNuevo[]>(
    tienesDraft
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((draftBloquesGuardados as any[] | null) ?? []).map((b: any) => ({
          ...b,
          tempId: b.tempId ?? `bloque_${Math.random().toString(36).slice(2)}`,
          campos: b.campos ?? [],
        }))
      : []
  )

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [agregandoBloque, setAgregandoBloque] = useState(false)
  const [bloqueTemp, setBloqueTemp] = useState<Omit<BloqueNuevo, 'tempId'>>({
    instruccion: '', tipo_contenido: 'propios', campos: [],
  })
  const [confirmRepublicar, setConfirmRepublicar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState(false)

  const [saving, startSaving] = useTransition()
  const [publishing, startPublishing] = useTransition()
  const [discarding, startDiscarding] = useTransition()

  // ── Accent helpers ─────────────────────────────────────────────────────────
  const A = accentColor === 'amber'
    ? { ring: 'focus:ring-gondo-amber-400/30', btn: 'bg-gondo-amber-400 hover:opacity-90', badge: 'bg-gondo-amber-50 text-gondo-amber-400 border border-gondo-amber-200', text: 'text-gondo-amber-400' }
    : { ring: 'focus:ring-gondo-indigo-600/30', btn: 'bg-gondo-indigo-600 hover:bg-gondo-indigo-400', badge: 'bg-gondo-indigo-50 text-gondo-indigo-600 border border-gondo-indigo-100', text: 'text-gondo-indigo-600' }

  const accentBuilderClass = accentColor === 'amber'
    ? 'focus:ring-gondo-amber-400/30 focus:border-gondo-amber-400'
    : 'focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600'

  // ── Handlers ──────────────────────────────────────────────────────────────────

  function getCurrentData(): DraftData {
    return {
      instruccion,
      puntos: puntos ?? puntosActual,
      nuevasZonas,
      nuevosBloques: nuevosBloques.map(b => ({
        instruccion: b.instruccion,
        tipo_contenido: b.tipo_contenido,
        campos: b.campos,
      })),
    }
  }

  function handleGuardarBorrador() {
    setError(null)
    setExito(false)
    startSaving(async () => {
      await guardarBorradorFn(campanaId, getCurrentData())
      setExito(true)
      setTimeout(() => setExito(false), 3000)
    })
  }

  function handleRepublicar() {
    setError(null)
    startPublishing(async () => {
      const result = await republicarFn(campanaId)
      if (result?.error) {
        setError(result.error)
        setConfirmRepublicar(false)
      } else {
        setConfirmRepublicar(false)
        // Reset draft state
        setNuevasZonas([])
        setNuevosBloques([])
      }
    })
  }

  function handleDescartar() {
    setError(null)
    startDiscarding(async () => {
      await descartarFn(campanaId)
      setInstruccion(instruccionActual ?? '')
      setPuntos(puntosActual)
      setNuevasZonas([])
      setNuevosBloques([])
      setGrupos([])
      prevGrupoIdsRef.current = new Set()
    })
  }

  function handleGrupos(newGrupos: GrupoZona[]) {
    const newIds = new Set(newGrupos.flatMap(g => g.localidadIds.map(String)))
    const prevIds = prevGrupoIdsRef.current
    const addedIds   = [...newIds].filter(id => !prevIds.has(id))
    const removedIds = [...prevIds].filter(id => !newIds.has(id))
    prevGrupoIdsRef.current = newIds
    setGrupos(newGrupos)
    setNuevasZonas(prev => [
      // Quitar las localidades que el usuario eliminó del SelectorZona
      ...prev.filter(z => !removedIds.includes(z.id)),
      // Agregar las nuevas, evitando duplicados y las ya configuradas en la campaña
      ...addedIds
        .filter(id => !prev.find(z => z.id === id) && !lIdsConfigurados.has(id))
        .map(id => ({ id, nombre: localidadNombreMap[id] ?? `Localidad ${id}` })),
    ])
  }

  function confirmarBloque() {
    if (!bloqueTemp.instruccion.trim()) return
    setNuevosBloques(prev => [...prev, {
      ...bloqueTemp,
      tempId: `bloque_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    }])
    setBloqueTemp({ instruccion: '', tipo_contenido: 'propios', campos: [] })
    setAgregandoBloque(false)
  }

  return (
    <div className="space-y-5">
      {/* Banner: cambios sin publicar */}
      {tienesDraft && !exito && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-500 shrink-0" />
            <p className="text-sm font-medium text-amber-800">Tenés cambios sin publicar</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmRepublicar(true)}
              className="text-xs font-semibold text-amber-700 hover:underline whitespace-nowrap"
            >
              Republicar
            </button>
            <button
              onClick={handleDescartar}
              disabled={discarding}
              className="text-xs font-semibold text-gray-500 hover:underline whitespace-nowrap"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {exito && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">Borrador guardado</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Descripción editable */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Descripción / Instrucciones</h3>
        <textarea
          value={instruccion}
          onChange={e => setInstruccion(e.target.value)}
          rows={3}
          placeholder="Instrucciones para el gondolero…"
          className={`w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 ${A.ring} resize-none`}
        />
      </div>

      {/* Puntos por foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Puntos por foto</h3>
        <p className="text-xs text-gray-400 mb-3">Solo podés aumentar el bounty, no reducirlo.</p>
        <input
          type="number"
          value={puntos ?? puntosActual}
          onChange={e => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) setPuntos(v)
          }}
          min={puntosActual}
          className={`w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 ${A.ring}`}
        />
      </div>

      {/* Zonas */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <MapPin size={14} className="text-gray-400" /> Zonas
        </h3>

        {/* Zonas actuales publicadas (solo lectura) */}
        {zonasActuales.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {zonasActuales.map(z => (
              <span key={z} className={`text-xs px-2.5 py-1 rounded-full ${A.badge}`}>{z}</span>
            ))}
          </div>
        )}

        {/* Nuevas zonas en draft */}
        {nuevasZonas.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {nuevasZonas.map(z => (
              <span key={z.id} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-green-50 text-green-700 rounded-full border border-green-200">
                {z.nombre}
                <button
                  type="button"
                  onClick={() => setNuevasZonas(prev => prev.filter(nz => nz.id !== z.id))}
                  className="text-green-400 hover:text-red-500 font-bold leading-none ml-0.5"
                >×</button>
              </span>
            ))}
          </div>
        )}

        {zonasActuales.length === 0 && nuevasZonas.length === 0 && (
          <p className="text-xs text-gray-400 mb-3">Sin zonas (visible para todos los gondoleros)</p>
        )}

        <SelectorZona
          grupos={grupos}
          onGrupos={handleGrupos}
          accentClass={accentColor === 'amber'
            ? 'focus:ring-gondo-amber-400/30 focus:border-gondo-amber-400'
            : 'focus:ring-gondo-indigo-600/20 focus:border-gondo-indigo-600'}
          addBtnClass={A.btn}
          showLabel={false}
        />
      </div>

      {/* Bloques de foto */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Camera size={14} className="text-gray-400" />
          Bloques de foto ({bloquesActuales.length + nuevosBloques.length})
        </h3>

        {/* Bloques publicados (solo lectura) */}
        {bloquesActuales.length > 0 && (
          <div className="space-y-2 mb-4">
            {bloquesActuales.map((b, i) => (
              <div key={b.id} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs font-bold text-gray-400 w-5 shrink-0 pt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">{b.instruccion}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TIPO_CONTENIDO_LABEL[b.tipo_contenido] ?? b.tipo_contenido}</p>
                  {b.campos && b.campos.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 pl-2 border-l border-gray-100">
                      {[...b.campos].sort((a, x) => (a.orden ?? 0) - (x.orden ?? 0)).map(campo => (
                        <p key={campo.id} className="text-xs text-gray-400">
                          {campo.pregunta}
                          <span className="ml-1 text-gray-300 text-[10px]">({campo.tipo})</span>
                          {campo.obligatorio && <span className="ml-1 text-red-300 text-[10px]">*</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Nuevos bloques en draft */}
        {nuevosBloques.length > 0 && (
          <div className="space-y-2 mb-4">
            {nuevosBloques.map((b, i) => (
              <div key={b.tempId} className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                <span className="text-xs font-bold text-gray-400 w-5 shrink-0 pt-0.5">
                  {bloquesActuales.length + i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{b.instruccion}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TIPO_CONTENIDO_LABEL[b.tipo_contenido] ?? b.tipo_contenido}</p>
                  {b.campos.length > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">{b.campos.length} pregunta{b.campos.length !== 1 ? 's' : ''}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setNuevosBloques(prev => prev.filter(nb => nb.tempId !== b.tempId))}
                  className="text-gray-400 hover:text-red-500 shrink-0 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Formulario de nuevo bloque */}
        {!agregandoBloque ? (
          <button
            type="button"
            onClick={() => setAgregandoBloque(true)}
            className={`flex items-center gap-1.5 text-sm font-semibold ${A.text} hover:opacity-70 transition-opacity`}
          >
            <Plus size={14} /> Agregar bloque
          </button>
        ) : (
          <div className="space-y-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nuevo bloque</h4>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Instrucción</label>
              <textarea
                value={bloqueTemp.instruccion}
                onChange={e => setBloqueTemp(p => ({ ...p, instruccion: e.target.value }))}
                rows={2}
                placeholder="Instrucción del bloque…"
                className={`w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 ${A.ring} resize-none bg-white`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contenido</label>
              <select
                value={bloqueTemp.tipo_contenido}
                onChange={e => setBloqueTemp(p => ({ ...p, tipo_contenido: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="propios">Productos propios</option>
                <option value="competencia">Competencia</option>
                <option value="ambos">Ambos</option>
                <option value="ninguno">Sin productos</option>
              </select>
            </div>

            <CamposBloqueBuilder
              campos={bloqueTemp.campos}
              onChange={campos => setBloqueTemp(p => ({ ...p, campos }))}
              accentClass={accentBuilderClass}
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={confirmarBloque}
                disabled={!bloqueTemp.instruccion.trim()}
                className={`px-4 py-2 ${A.btn} text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40`}
              >
                Confirmar bloque
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgregandoBloque(false)
                  setBloqueTemp({ instruccion: '', tipo_contenido: 'propios', campos: [] })
                }}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Botones de acción */}
      <div className="flex items-center gap-3 flex-wrap pb-2">
        <button
          type="button"
          onClick={handleGuardarBorrador}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 ${A.btn} text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50`}
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Guardar borrador
        </button>
        {tienesDraft && (
          <>
            <button
              type="button"
              onClick={() => { setError(null); setConfirmRepublicar(true) }}
              disabled={publishing}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {publishing && <Loader2 size={14} className="animate-spin" />}
              Republicar campaña
            </button>
            <button
              type="button"
              onClick={handleDescartar}
              disabled={discarding}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {discarding && <Loader2 size={14} className="animate-spin" />}
              Descartar cambios
            </button>
          </>
        )}
      </div>

      {/* Modal de confirmación de republicar */}
      {confirmRepublicar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Republicar campaña?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Los cambios del borrador se publicarán y serán visibles para los gondoleros.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleRepublicar}
                disabled={publishing}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 text-sm"
              >
                {publishing && <Loader2 size={13} className="animate-spin" />}
                Confirmar
              </button>
              <button
                onClick={() => setConfirmRepublicar(false)}
                disabled={publishing}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
