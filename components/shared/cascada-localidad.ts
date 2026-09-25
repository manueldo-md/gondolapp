'use client'

/**
 * components/shared/cascada-localidad.ts — la cascada provincia → departamento
 * → localidad, en un solo lugar.
 *
 * ETAPA 5 del tramo "localidad_id en el alta de comercio".
 *
 * ── POR QUÉ UN HOOK Y NO UN COMPONENTE ──────────────────────────────────────
 * Hay dos pantallas que eligen localidad y **no eligen lo mismo**:
 *
 *   `SelectorZona`      área de cobertura → VARIAS localidades, con "todas las
 *                       del departamento". Lo usan el perfil del gondolero y
 *                       los tres editores de campaña.
 *   `SelectorLocalidad` "¿en qué pueblo está este comercio?" → UNA.
 *
 * El marcado del tercer nivel es distinto por definición —checkboxes contra un
 * select— así que un componente compartido tendría que ramificar por dentro. Lo
 * que sí es idéntico son las tres consultas y las reglas de reseteo en cascada:
 * eso es lo que vive acá.
 *
 * El riesgo que esto evita no es la duplicación de JSX sino la de REGLAS: que
 * una pantalla resetee el departamento al cambiar de provincia y la otra no, y
 * alguien termine guardando una localidad de otra provincia. Es la misma
 * familia que las dos definiciones de "está en este alcance" que `rutaEvidencia`
 * vino a unificar.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface OpcionGeo { id: number; nombre: string }

export interface Cascada {
  provincias: OpcionGeo[]
  departamentos: OpcionGeo[]
  localidades: OpcionGeo[]
  provinciaId: number | ''
  departamentoId: number | ''
  /** Cambia la provincia y **resetea lo de abajo**. */
  elegirProvincia: (id: number | '') => void
  /** Cambia el departamento y resetea las localidades. */
  elegirDepartamento: (id: number | '') => void
  /** Vuelve todo a cero. */
  limpiar: () => void
  /** Deja la cascada abierta en una localidad concreta, subiendo por la cadena. */
  abrirEn: (localidadId: number) => Promise<void>
  cargando: boolean
}

export function useCascadaLocalidad(): Cascada {
  const [provincias, setProvincias] = useState<OpcionGeo[]>([])
  const [departamentos, setDepartamentos] = useState<OpcionGeo[]>([])
  const [localidades, setLocalidades] = useState<OpcionGeo[]>([])
  const [provinciaId, setProvinciaId] = useState<number | ''>('')
  const [departamentoId, setDepartamentoId] = useState<number | ''>('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    createClient().from('provincias').select('id, nombre').order('nombre')
      .then(({ data }) => setProvincias((data ?? []) as OpcionGeo[]))
  }, [])

  useEffect(() => {
    if (!provinciaId) { setDepartamentos([]); setLocalidades([]); return }
    let vivo = true
    setCargando(true)
    createClient().from('departamentos').select('id, nombre')
      .eq('provincia_id', provinciaId).order('nombre')
      .then(({ data }) => {
        if (!vivo) return
        setDepartamentos((data ?? []) as OpcionGeo[])
        setCargando(false)
      })
    // `vivo` evita que una respuesta lenta de la provincia anterior pise la
    // lista de la nueva. Con dos cambios seguidos eso deja departamentos que no
    // son de la provincia elegida, y desde ahí se guarda cualquier cosa.
    return () => { vivo = false }
  }, [provinciaId])

  useEffect(() => {
    if (!departamentoId) { setLocalidades([]); return }
    let vivo = true
    setCargando(true)
    createClient().from('localidades').select('id, nombre')
      .eq('departamento_id', departamentoId).order('nombre')
      .then(({ data }) => {
        if (!vivo) return
        setLocalidades((data ?? []) as OpcionGeo[])
        setCargando(false)
      })
    return () => { vivo = false }
  }, [departamentoId])

  return {
    provincias, departamentos, localidades, provinciaId, departamentoId, cargando,
    elegirProvincia: id => { setProvinciaId(id); setDepartamentoId(''); setLocalidades([]) },
    elegirDepartamento: id => { setDepartamentoId(id) },
    limpiar: () => { setProvinciaId(''); setDepartamentoId(''); setDepartamentos([]); setLocalidades([]) },
    /**
     * Para precargar la cascada en la localidad sugerida: se sube de la
     * localidad al departamento y a la provincia, y se baja llenando las listas.
     * Así el que quiere CORREGIR una sugerencia arranca parado al lado, en vez
     * de tener que volver a elegir la provincia desde cero.
     */
    abrirEn: async (localidadId: number) => {
      setCargando(true)
      const sb = createClient()
      const { data } = await sb.from('localidades')
        .select('id, departamento_id, departamentos!inner(id, provincia_id)')
        .eq('id', localidadId).single()
      if (!data) { setCargando(false); return }
      const d = (Array.isArray(data.departamentos) ? data.departamentos[0] : data.departamentos) as
        { id: number; provincia_id: number } | null
      if (!d) { setCargando(false); return }
      setProvinciaId(d.provincia_id)
      setDepartamentoId(d.id)
      setCargando(false)
    },
  }
}
