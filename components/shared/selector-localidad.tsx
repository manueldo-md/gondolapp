'use client'

/**
 * components/shared/selector-localidad.tsx — "¿en qué pueblo está este
 * comercio?", con la sugerencia del servidor precargada.
 *
 * ETAPA 5 del tramo "localidad_id en el alta de comercio".
 *
 * ── LO QUE ESTA PANTALLA TIENE QUE HACER FÁCIL ──────────────────────────────
 * Confirmar. El servidor ya geocodificó y acierta 8 de cada 9 veces que
 * resuelve, así que el camino dominante es **un clic**. Corregir tiene que ser
 * posible, no cómodo: si las dos acciones pesaran igual, quien revisa en serie
 * terminaría tocando la que está más a mano.
 *
 * Pero confirmar NO puede ser automático, y esa es toda la razón de que esta
 * pantalla exista: **1 de cada 9 sugerencias exactas apunta a otra localidad**
 * —un comercio de Gualeguaychú resolvió a "Larroque", con los dos proveedores
 * probados—. Ese caso es internamente consistente y ninguna lógica lo detecta.
 * Lo detecta alguien que conoce la zona, mirando.
 *
 * ── LOS CUATRO ESTADOS SE VEN DISTINTO, A PROPÓSITO ─────────────────────────
 *   exacto    la sugerencia, y un botón para aceptarla
 *   ambiguo   el nombre y las opciones — NO se elige por el usuario
 *   fuera     lo que dijo el proveedor, que el padrón no tiene. Es un pedido
 *             de alta de localidad y hay que poder leerlo
 *   sin_dato  nada que ofrecer: el cascader pelado
 *   error     no se pudo preguntar. Distinto de sin_dato, y se dice
 */
import { useState, useTransition } from 'react'
import { Check, MapPin, AlertTriangle, Pencil } from 'lucide-react'
import { useCascadaLocalidad } from './cascada-localidad'

export interface SugerenciaLocalidad {
  estado: 'exacto' | 'ambiguo' | 'fuera' | 'sin_dato' | 'error' | null
  /** Solo en `exacto`. */
  id: number | null
  /** El nombre que devolvió el proveedor. */
  texto: string | null
  /** La cadena legible de la sugerencia, resuelta en el servidor. */
  etiqueta: string | null
}

export function SelectorLocalidad({ comercioId, sugerencia, onAsignar }: {
  comercioId: string
  sugerencia: SugerenciaLocalidad
  /** Escribe `localidad_id`. Devuelve un error para mostrar, o nada. */
  onAsignar: (comercioId: string, localidadId: number) => Promise<{ error?: string } | void>
}) {
  const [corrigiendo, setCorrigiendo] = useState(false)
  const [elegida, setElegida] = useState<number | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const cascada = useCascadaLocalidad()

  const asignar = (localidadId: number) => {
    setError(null)
    empezar(async () => {
      const r = await onAsignar(comercioId, localidadId)
      if (r && 'error' in r && r.error) setError(r.error)
    })
  }

  const abrirCorrector = async () => {
    setCorrigiendo(true)
    // Si hay sugerencia, la cascada arranca parada al lado en vez de en cero.
    if (sugerencia.id) await cascada.abrirEn(sugerencia.id)
  }

  const selectCls = `px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white
    focus:outline-none focus:ring-2 focus:ring-gondo-amber-500/20 focus:border-gondo-amber-500
    disabled:opacity-40 disabled:cursor-not-allowed`

  // ── El encabezado: qué dijo el servidor ───────────────────────────────────
  const cabecera = () => {
    switch (sugerencia.estado) {
      case 'exacto':
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin size={12} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-700 truncate" title={sugerencia.etiqueta ?? ''}>
              {sugerencia.etiqueta ?? '—'}
            </span>
          </div>
        )
      case 'ambiguo':
        return (
          <p className="text-[11px] text-amber-700">
            <AlertTriangle size={11} className="inline mb-0.5 mr-1" />
            <strong>{sugerencia.texto}</strong> existe en más de un lugar. Elegí cuál.
          </p>
        )
      case 'fuera':
        return (
          <p className="text-[11px] text-gray-500">
            El GPS dice <strong className="text-gray-700">{sugerencia.texto}</strong>, que no está
            en el padrón. Elegí la más cercana o pedí que la agreguen.
          </p>
        )
      case 'error':
        return <p className="text-[11px] text-gray-400">No se pudo consultar la ubicación. Elegila a mano.</p>
      default:
        return <p className="text-[11px] text-gray-400">Sin dato de ubicación. Elegila a mano.</p>
    }
  }

  // Con sugerencia exacta y sin corregir: el camino de un clic.
  if (sugerencia.estado === 'exacto' && sugerencia.id && !corrigiendo) {
    return (
      <div className="space-y-1">
        {cabecera()}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => asignar(sugerencia.id as number)}
            disabled={pendiente}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
              bg-gondo-amber-600 text-white hover:bg-gondo-amber-700 disabled:opacity-50 transition-colors"
          >
            <Check size={11} /> {pendiente ? 'Guardando…' : 'Confirmar'}
          </button>
          <button
            onClick={abrirCorrector}
            disabled={pendiente}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]
              text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Pencil size={10} /> Otra
          </button>
        </div>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </div>
    )
  }

  // El resto de los casos, y el corrector: el cascader.
  return (
    <div className="space-y-1.5">
      {cabecera()}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          className={selectCls}
          value={cascada.provinciaId}
          onChange={e => { cascada.elegirProvincia(e.target.value ? Number(e.target.value) : ''); setElegida('') }}
        >
          <option value="">Provincia…</option>
          {cascada.provincias.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>

        <select
          className={selectCls}
          value={cascada.departamentoId}
          disabled={!cascada.provinciaId}
          onChange={e => { cascada.elegirDepartamento(e.target.value ? Number(e.target.value) : ''); setElegida('') }}
        >
          <option value="">Departamento…</option>
          {cascada.departamentos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>

        <select
          className={selectCls}
          value={elegida}
          disabled={!cascada.departamentoId}
          onChange={e => setElegida(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Localidad…</option>
          {cascada.localidades.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>

        <button
          onClick={() => elegida && asignar(elegida)}
          disabled={!elegida || pendiente}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold
            bg-gondo-amber-600 text-white hover:bg-gondo-amber-700 disabled:opacity-40
            disabled:cursor-not-allowed transition-colors"
        >
          <Check size={11} /> {pendiente ? 'Guardando…' : 'Asignar'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
