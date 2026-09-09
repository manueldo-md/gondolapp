import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { ResultadosView } from '@/components/campanas/ResultadosView'
import { loadResultadosCampanaData } from '@/lib/resultados'
import { FotoAccionesRepo } from './foto-acciones'

export default async function RepoCampanaResultadosPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (admin as any)
    .from('profiles')
    .select('repositora_id')
    .eq('id', user.id)
    .single()

  if (!perfil?.repositora_id) redirect('/repositora/dashboard')
  const repoId: string = perfil.repositora_id

  const { data: campanaRaw, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, objetivo_comercios, tope_total_comercios, comercios_relevados, puntos_por_foto, distri_id, marca_id, repositora_id')
    .eq('id', params.id)
    .single()

  if (error || !campanaRaw) notFound()

  // Verificar acceso
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campanaRaw as any
  const esDirecta = c.repositora_id === repoId
  if (!esDirecta) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks = await Promise.all([
      c.distri_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (admin as any)
            .from('distri_repo_relaciones').select('id')
            .eq('repositora_id', repoId).eq('distri_id', c.distri_id).eq('estado', 'activa').maybeSingle()
        : Promise.resolve({ data: null }),
      c.marca_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (admin as any)
            .from('marca_repo_relaciones').select('id')
            .eq('repositora_id', repoId).eq('marca_id', c.marca_id).eq('estado', 'activa').maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (!checks.some((r: { data: unknown }) => r.data !== null)) notFound()
  }

  const tab = searchParams.tab ?? ''
  const data = await loadResultadosCampanaData(admin, params.id, tab, { ordenarPorMision: true })

  // Repositora usa tope_total_comercios si está definido, si no objetivo_comercios
  const limiteComercio: number | null = c.tope_total_comercios ?? c.objetivo_comercios ?? null

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/repositora/campanas"
        detalleHref={`/repositora/campanas/${params.id}/detalle`}
        resultadosHref={`/repositora/campanas/${params.id}/resultados`}
        activo="resultados"
      />
      <ResultadosView
        data={data}
        campana={{
          id: c.id,
          nombre: c.nombre,
          tipo: c.tipo,
          fecha_fin: c.fecha_fin ?? null,
          comercios_relevados: c.comercios_relevados ?? null,
        }}
        tab={tab}
        config={{
          accentColor:       'text-blue-600',
          progressBarColor:  'bg-blue-500',
          seleccionBarColor: 'bg-blue-400',
          agentLabel:        'Fixers',
          agentHeaderLabel:  'Fixer',
          showAgent:         true,
          limiteComercio,
        }}
        renderFotoAcciones={(fotoId, estado) =>
          estado === 'pendiente' ? (
            <div className="px-4 pb-4 shrink-0">
              <FotoAccionesRepo fotoId={fotoId} />
            </div>
          ) : null
        }
      />
    </div>
  )
}
