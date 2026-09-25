'use client'

import { useState, useTransition, useEffect } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SelectorZona, type GrupoZona } from '@/components/shared/selector-zona'
import type { ZonaGondolero } from '@/lib/zonas-gondolero'
import { actualizarZonasGondolero } from './actions'

/**
 * Las zonas del gondolero, AL NIVEL QUE LAS ELIGIÓ.
 *
 * ETAPA 8: antes esta pantalla recibía `localidadesActuales: number[]` y las
 * reagrupaba por departamento para reconstruir los chips. Eso tenía un problema
 * que no se veía: **"todas las del departamento" y "estas 12 de 12" llegaban
 * idénticas**, porque al guardar se había expandido. El chip decía "12
 * localidades" aunque el gondolero hubiera elegido todo el departamento.
 *
 * Ahora llegan con el nivel puesto y el chip dice lo que él eligió.
 */
interface Props {
  zonasActuales: ZonaGondolero[]
}

export function LocalidadesSelector({ zonasActuales }: Props) {
  const [grupos, setGrupos] = useState<GrupoZona[]>([])
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Los nombres para los chips. Las zonas ya vienen del servidor: lo único que
  // falta es cómo se llaman, y eso depende del nivel de cada una.
  useEffect(() => {
    if (zonasActuales.length === 0) return
    const sb = createClient()

    const locIds = zonasActuales.filter(z => z.nivel === 'localidad').map(z => z.refId)
    const depIds = zonasActuales.filter(z => z.nivel === 'departamento').map(z => z.refId)
    const provIds = zonasActuales.filter(z => z.nivel === 'provincia').map(z => z.refId)

    Promise.all([
      locIds.length
        ? sb.from('localidades')
            .select('id, departamento_id, departamentos(id, nombre, provincias(id, nombre))')
            .in('id', locIds)
        : Promise.resolve({ data: [] }),
      depIds.length
        ? sb.from('departamentos').select('id, nombre, provincias(id, nombre)').in('id', depIds)
        : Promise.resolve({ data: [] }),
      provIds.length
        ? sb.from('provincias').select('id, nombre').in('id', provIds)
        : Promise.resolve({ data: [] }),
    ]).then(([locs, deps, provs]) => {
      // Los embeds de PostgREST llegan como objeto o como array según el caso.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const uno = (v: any) => (Array.isArray(v) ? v[0] ?? null : v ?? null)
      const armados: GrupoZona[] = []

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (provs.data ?? []) as any[]) {
        armados.push({
          nivel: 'provincia', provinciaId: p.id, provinciaNombre: p.nombre,
          departamentoId: 0, departamentoNombre: '', localidadIds: [], todas: true,
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of (deps.data ?? []) as any[]) {
        const pr = uno(d.provincias)
        armados.push({
          nivel: 'departamento', provinciaId: pr?.id ?? 0, provinciaNombre: pr?.nombre ?? '',
          departamentoId: d.id, departamentoNombre: d.nombre, localidadIds: [], todas: true,
        })
      }
      // Las sueltas sí se agrupan por departamento, que es como se muestran.
      const porDepto: Record<number, GrupoZona> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of (locs.data ?? []) as any[]) {
        const d = uno(l.departamentos)
        const pr = uno(d?.provincias)
        const k = l.departamento_id
        if (!porDepto[k]) {
          porDepto[k] = {
            nivel: 'localidad', provinciaId: pr?.id ?? 0, provinciaNombre: pr?.nombre ?? '',
            departamentoId: k, departamentoNombre: d?.nombre ?? '', localidadIds: [], todas: false,
          }
        }
        porDepto[k].localidadIds.push(l.id)
      }
      setGrupos([...armados, ...Object.values(porDepto)])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // solo al montar

  const handleGuardar = () => {
    setError(null)
    startTransition(async () => {
      // Se guarda el NIVEL, no la expansión. Un grupo de provincia son 143
      // localidades hoy; guardarlas lo dejaría viejo mañana.
      const zonas: ZonaGondolero[] = grupos.flatMap((g): ZonaGondolero[] =>
        g.nivel === 'provincia'    ? [{ nivel: 'provincia' as const,    refId: g.provinciaId }]
      : g.nivel === 'departamento' ? [{ nivel: 'departamento' as const, refId: g.departamentoId }]
      : g.localidadIds.map(id => ({ nivel: 'localidad' as const, refId: id })))

      const r = await actualizarZonasGondolero(zonas)
      if (r?.error) { setError(r.error); return }
      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={16} className="text-gondo-verde-400" />
        <h2 className="text-sm font-semibold text-gray-700">¿En qué zonas trabajás?</h2>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Elegí dónde relevás comercios. Podés agregar una provincia entera, un departamento
        completo o localidades sueltas. Esto filtra las campañas disponibles para vos.
      </p>

      <SelectorZona
        grupos={grupos}
        onGrupos={setGrupos}
        showLabel={false}
        accentClass="focus:ring-2 focus:ring-gondo-verde-400/20 focus:border-gondo-verde-400"
        addBtnClass="bg-gondo-verde-400 hover:opacity-90 text-white"
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleGuardar}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-gondo-verde-400 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
        >
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {isPending ? 'Guardando...' : 'Guardar zonas'}
        </button>
        {guardado && <span className="text-sm text-gondo-verde-400 font-medium">✓ Guardado</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  )
}
