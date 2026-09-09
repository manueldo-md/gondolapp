import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { ResultadosView } from '@/components/campanas/ResultadosView'
import { loadResultadosCampanaData } from '@/lib/resultados'
import { FotoAcciones } from '../../../gondolas/foto-acciones'

export default async function DistriCampanaResultadosPage({
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

  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()
  const distriId = profile?.distri_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, objetivo_comercios, comercios_relevados, puntos_por_foto, distri_id')
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).distri_id !== distriId) notFound()

  const tab = searchParams.tab ?? ''
  const data = await loadResultadosCampanaData(admin, params.id, tab)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/distribuidora/campanas"
        detalleHref={`/distribuidora/campanas/${params.id}/detalle`}
        resultadosHref={`/distribuidora/campanas/${params.id}/resultados`}
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
          accentColor:       'text-gondo-amber-400',
          progressBarColor:  'bg-gondo-amber-400',
          seleccionBarColor: 'bg-blue-400',
          agentLabel:        'Gondoleros',
          agentHeaderLabel:  'Gondolero',
          showAgent:         true,
          limiteComercio:    c.objetivo_comercios ?? null,
        }}
        renderFotoAcciones={(fotoId, estado) =>
          estado === 'pendiente' ? (
            <div className="px-4 pb-4 shrink-0">
              <FotoAcciones fotoId={fotoId} />
            </div>
          ) : null
        }
      />
    </div>
  )
}
