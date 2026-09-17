'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { crearCampanaInterna } from './actions'
import { CamposBloqueBuilder, type CampoBloque } from '@/components/shared/campos-bloque-builder'
import { SelectorZona, type GrupoZona } from '@/components/shared/selector-zona'
import { validarMinimoComercios } from '@/lib/campana-minimo'
import { esCampanaDeAltas, validarBloqueCampana, MODALIDAD_ALTAS } from '@/lib/campana-altas'

/**
 * Las dos modalidades. El texto de ayuda importa: la diferencia no es evidente
 * desde el nombre, y elegir mal no se puede deshacer — el trigger
 * `campanas_modalidad_inmutable` impide cambiarla una vez que hay misiones.
 */
const MODALIDADES: { value: 'puntual' | 'seguimiento'; label: string; ayuda: string }[] = [
  {
    value: 'puntual',
    label: 'Puntual',
    ayuda: 'Cada comercio se releva una sola vez. Termina en una fecha.',
  },
  {
    value: 'seguimiento',
    label: 'Seguimiento',
    ayuda: 'Los mismos comercios se visitan cada semana. No termina sola.',
  },
]

/**
 * Los dos tipos que puede crear una distribuidora.
 *
 * No están 'relevamiento', 'precio' ni los demás: esos son de marca y de admin.
 * Y 'comercios' no está en el selector de marca, por la razón opuesta — una
 * marca quiere relevar sus góndolas, no poblar el mapa. Ver lib/campana-altas.ts.
 */
const TIPOS_DISTRI: { value: 'interna' | 'comercios'; label: string; ayuda: string }[] = [
  {
    value: 'interna',
    label: 'Relevamiento interno',
    ayuda: 'Tus gondoleros relevan góndolas y contestan preguntas.',
  },
  {
    value: 'comercios',
    label: 'Alta de comercios',
    ayuda: 'Tus gondoleros cargan comercios que no están en el mapa.',
  },
]

export default function NuevaCampanaPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [grupos, setGrupos] = useState<GrupoZona[]>([])
  const [solicitarPrecio, setSolicitarPrecio] = useState(false)

  const [campos, setCampos] = useState<CampoBloque[]>([])

  const [form, setForm] = useState({
    nombre:                      '',
    tipo:                        'interna' as 'interna' | 'comercios',
    instruccion:                 '',
    tipo_contenido:              'propios',
    puntos_por_mision:           '50',
    modalidad:                   'puntual',
    fecha_inicio:                '',
    fecha_fin:                   '',
    visitas_por_semana:          '',
    minimo_comercios:            '',
    tope_total_comercios:        '',
    max_comercios_por_gondolero: '20',
    min_comercios_para_cobrar:   '3',
    nivel_minimo:                'casual',
    actor_campana:               'gondolero',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const esSeguimiento = form.modalidad === 'seguimiento'
  const esAltas = esCampanaDeAltas(form.tipo)

  /**
   * Cambiar de tipo limpia lo que el otro tipo no usa, por el mismo motivo que
   * `setModalidad`: el submit serializa el objeto entero, así que un valor que
   * dejó de verse viaja igual.
   *
   * Una campaña de altas es SIEMPRE puntual — no se da de alta el mismo comercio
   * tres veces por semana— así que el tipo fuerza la modalidad y de paso evita
   * el CHECK de `visitas_por_semana`.
   */
  const setTipo = (tipo: 'interna' | 'comercios') =>
    setForm(p => ({
      ...p,
      tipo,
      modalidad:          tipo === 'comercios' ? MODALIDAD_ALTAS : p.modalidad,
      visitas_por_semana: tipo === 'comercios' ? '' : p.visitas_por_semana,
      tipo_contenido:     tipo === 'comercios' ? 'ninguno' : p.tipo_contenido,
    }))

  /**
   * Cambiar de modalidad LIMPIA los campos de la otra.
   *
   * No es cosmético: los campos escondidos siguen en el estado y el submit
   * serializa el objeto entero con `Object.entries(form)`. Si alguien carga una
   * fecha de cierre, cambia a seguimiento y envía, la fecha viaja igual y la
   * rechaza el CHECK de Postgres con un error que no se entiende. Limpiar acá
   * hace que lo que se ve sea lo que se manda.
   */
  const setModalidad = (modalidad: 'puntual' | 'seguimiento') =>
    setForm(p => ({
      ...p,
      modalidad,
      fecha_fin:            modalidad === 'seguimiento' ? '' : p.fecha_fin,
      tope_total_comercios: modalidad === 'seguimiento' ? '' : p.tope_total_comercios,
      visitas_por_semana:   modalidad === 'puntual'     ? '' : p.visitas_por_semana,
    }))

  // El minimo es obligatorio y no puede superar el tope. La regla vive en
  // lib/campana-minimo.ts porque los tres editores estan duplicados.
  // Sigue siendo obligatorio en seguimiento: sin tope y sin fecha de cierre, es
  // la unica referencia que le queda a la campana para medirse.
  const minimoCheck = validarMinimoComercios(form.minimo_comercios, form.tope_total_comercios)
  const minimoError = form.minimo_comercios.trim() !== '' && !minimoCheck.ok ? minimoCheck.error : null

  const visitasNum = parseInt(form.visitas_por_semana, 10)
  const visitasError = esSeguimiento && form.visitas_por_semana.trim() !== ''
    && (!Number.isFinite(visitasNum) || visitasNum < 1 || visitasNum > 14)
    ? 'Las visitas por semana tienen que estar entre 1 y 14.'
    : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (form.nombre.trim().length < 3) { setErrorMsg('El nombre debe tener al menos 3 caracteres.'); return }
    const bloqueCheck = validarBloqueCampana({ tipo: form.tipo, campos: campos.length })
    if (!bloqueCheck.ok) { setErrorMsg(bloqueCheck.error); return }
    if (esSeguimiento && !form.visitas_por_semana.trim()) {
      setErrorMsg('Indicá cuántas visitas por semana espera la campaña.')
      return
    }
    if (visitasError) { setErrorMsg(visitasError); return }

    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.set(k, v))
    grupos.flatMap(g => g.localidadIds).forEach(id => fd.append('localidad_ids', String(id)))
    fd.set('solicitar_precio', solicitarPrecio ? 'true' : 'false')
    fd.set('campos_json', JSON.stringify(campos))

    startTransition(async () => {
      const result = await crearCampanaInterna(fd)
      if (result?.error) setErrorMsg(result.error)
    })
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {esAltas ? 'Nueva campaña de altas' : 'Nueva campaña interna'}
          </h2>
          <p className="text-sm text-gray-400">
            {esAltas
              ? 'Tus gondoleros dan de alta comercios nuevos — sin costo de tokens'
              : 'Sin costo de tokens — uso interno'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nombre <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.nombre}
              onChange={set('nombre')}
              placeholder="Ej: Relevamiento Concordia - Agosto"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
          </div>

          {/* Tipo de campaña.
              Hasta el 17/9/2026 este formulario escribía `tipo: 'interna'` fijo y
              no había forma de crear una campaña de altas desde el panel de
              distribuidora. Va acá y no en un formulario aparte: quedamos en UN
              SOLO formulario para la distri. */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tipo de campaña
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_DISTRI.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTipo(t.value)}
                  className={`text-left px-3 py-2.5 border rounded-lg transition-colors ${
                    form.tipo === t.value
                      ? 'border-gondo-amber-400 bg-gondo-amber-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-800">{t.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-snug">{t.ayuda}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Instrucción */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Instrucción para el gondolero
            </label>
            <textarea
              value={form.instruccion}
              onChange={set('instruccion')}
              rows={3}
              placeholder="Qué deben fotografiar y cómo hacerlo..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
          </div>

          {/* Campos del bloque — una campaña de altas no lleva */}
          {!esAltas && (
            <CamposBloqueBuilder
              campos={campos}
              onChange={setCampos}
              accentClass="focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400"
            />
          )}

          {esAltas && (
            <div className="bg-gondo-amber-50 border border-gondo-amber-200 rounded-xl p-3.5">
              <p className="text-sm font-medium text-gray-800">El trabajo es dar de alta el comercio</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                El gondolero carga nombre, tipo, dirección, ubicación GPS y una foto
                de la fachada — obligatoria. No hay góndola que fotografiar ni
                preguntas que contestar, así que este bloque no lleva campos.
              </p>
            </div>
          )}

          {/* Tipo de contenido */}
          {!esAltas && <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tipo de contenido del bloque
            </label>
            <select
              value={form.tipo_contenido}
              onChange={set('tipo_contenido')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition bg-white"
            >
              <option value="propios">Solo mis productos</option>
              <option value="competencia">Solo competencia</option>
              <option value="ambos">Mis productos y competencia</option>
              <option value="ninguno">Sin productos (stands, comercios, etc.)</option>
            </select>
          </div>}

          {/* Solicitar precio — no aplica a una campaña de altas */}
          {!esAltas && <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={solicitarPrecio}
              onChange={e => setSolicitarPrecio(e.target.checked)}
              className="w-4 h-4 accent-gondo-amber-400"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">Pedir precio al gondolero</span>
              <p className="text-xs text-gray-400 mt-0.5">El gondolero deberá ingresar el precio cuando encuentre el producto</p>
            </div>
          </label>}

          {/* Puntos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Puntos por misión completada
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={100000}
                value={form.puntos_por_mision}
                onChange={set('puntos_por_mision')}
                className="w-28 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
              <span className="text-sm text-gray-500">
                {esAltas ? 'puntos por alta validada' : 'puntos por misión aprobada'}
              </span>
            </div>
          </div>

          {/* Modalidad — define qué otros campos aplican, así que va antes que ellos.
              En una campaña de altas no se ofrece: es siempre puntual. */}
          {!esAltas && <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modalidad</label>
            <div className="grid grid-cols-2 gap-2">
              {MODALIDADES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setModalidad(m.value)}
                  className={`text-left px-3 py-3 rounded-xl border transition-colors ${
                    esSeguimiento === (m.value === 'seguimiento')
                      ? 'bg-gondo-amber-50 border-gondo-amber-400 text-gondo-amber-400'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{m.ayuda}</span>
                </button>
              ))}
            </div>
          </div>}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha de inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={set('fecha_inicio')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
            {/* La fecha de cierre no aplica en seguimiento: la campaña es continua.
                El lugar no queda vacío —se explica por qué no está— porque un
                hueco se lee como un campo que falta cargar. */}
            {esSeguimiento ? (
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Fecha de cierre</label>
                <div className="w-full px-3 py-2.5 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 bg-gray-50">
                  Sin cierre — es continua
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Fecha de cierre <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  min={form.fecha_inicio || undefined}
                  value={form.fecha_fin}
                  onChange={set('fecha_fin')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
                />
              </div>
            )}
          </div>

          {/* Visitas por semana — solo seguimiento, y ahí es obligatoria.
              Es la definición de la campaña: sin frecuencia, el gondolero no
              sabe cada cuánto volver ni la marca qué esperar. */}
          {esSeguimiento && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Visitas por semana <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={14}
                value={form.visitas_por_semana}
                onChange={set('visitas_por_semana')}
                placeholder="Ej: 2"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
              <p className="text-xs text-gray-400 mt-1">
                Cuántas veces se espera visitar cada comercio por semana, de lunes a domingo. Entre 1 y 14.
              </p>
              {visitasError && <p className="text-xs text-red-600 mt-1">{visitasError}</p>}
            </div>
          )}

          {/* Mínimo de comercios — el piso de representatividad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mínimo de comercios <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.minimo_comercios}
              onChange={set('minimo_comercios')}
              placeholder="Ej: 30"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
            />
            <p className="text-xs text-gray-400 mt-1">
              Cuántos comercios hacen falta para que el relevamiento sea representativo.
              Por debajo de ese número los resultados no se presentan como conclusión.
            </p>
            {minimoError && <p className="text-xs text-red-600 mt-1">{minimoError}</p>}
          </div>

          {/* Tope global de comercios — no aplica en seguimiento: el tope existe
              para cerrar la campaña sola al llegar a N comercios, y una campaña
              continua no se cierra sola. Lo prohíbe el CHECK
              campanas_tope_solo_puntual. */}
          {!esSeguimiento && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tope global de comercios <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="number"
                min={1}
                value={form.tope_total_comercios}
                onChange={set('tope_total_comercios')}
                placeholder="Ej: 50"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
              <p className="text-xs text-gray-400 mt-1">Al alcanzarlo, la campaña se cierra automáticamente. Dejá vacío para sin límite.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Máx. por participante</label>
              <input
                type="number"
                min={1}
                value={form.max_comercios_por_gondolero}
                onChange={set('max_comercios_por_gondolero')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mín. para cobrar</label>
              <input
                type="number"
                min={1}
                value={form.min_comercios_para_cobrar}
                onChange={set('min_comercios_para_cobrar')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition"
              />
            </div>
          </div>

          {/* Nivel mínimo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Nivel mínimo requerido
            </label>
            <select
              value={form.nivel_minimo}
              onChange={set('nivel_minimo')}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400 transition bg-white"
            >
              <option value="casual">Casual (todos)</option>
              <option value="activo">Activo (50+ fotos aprobadas)</option>
              <option value="pro">Pro (150+ fotos aprobadas)</option>
            </select>
          </div>

          {/* Actor de la campaña */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ¿Para quién es esta campaña?
            </label>
            <div className="flex gap-4">
              {[
                { value: 'gondolero', label: 'Gondoleros' },
                { value: 'fixer', label: 'Fixers' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="actor_campana"
                    value={opt.value}
                    checked={form.actor_campana === opt.value}
                    onChange={set('actor_campana')}
                    className="accent-gondo-amber-400"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Zonas */}
          <SelectorZona
            grupos={grupos}
            onGrupos={setGrupos}
            accentClass="focus:ring-2 focus:ring-gondo-amber-400/20 focus:border-gondo-amber-400"
            addBtnClass="bg-gondo-amber-400 hover:opacity-90 text-white"
          />

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{errorMsg}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || !minimoCheck.ok}
            className="flex items-center gap-2 px-5 py-2.5 bg-gondo-amber-400 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? <><Loader2 size={15} className="animate-spin" /> Creando...</> : <><Check size={15} /> Crear campaña</>}
          </button>
        </div>
      </form>
    </div>
  )
}
