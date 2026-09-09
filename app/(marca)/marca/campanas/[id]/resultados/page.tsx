import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect, notFound } from 'next/navigation'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { ResultadosView } from '@/components/campanas/ResultadosView'
import { loadResultadosCampanaData } from '@/lib/resultados'
import { MarcaFotoAcciones } from '../../../gondolas/foto-acciones'

export default async function MarcaCampanaResultadosPage({
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
    .select('marca_id')
    .eq('id', user.id)
    .single()
  const marcaId = profile?.marca_id ?? null

  const { data: campana, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, objetivo_comercios, comercios_relevados, puntos_por_foto, marca_id')
    .eq('id', params.id)
    .single()

  if (error || !campana) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((campana as any).marca_id !== marcaId) notFound()

  const tab = searchParams.tab ?? ''
  const data = await loadResultadosCampanaData(admin, params.id, tab)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campana as any

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/marca/campanas"
        detalleHref={`/marca/campanas/${params.id}/detalle`}
        resultadosHref={`/marca/campanas/${params.id}/resultados`}
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
          accentColor:       'text-gondo-indigo-600',
          progressBarColor:  'bg-gondo-indigo-600',
          seleccionBarColor: 'bg-gondo-indigo-600',
          agentLabel:        'Gondoleros',
          agentHeaderLabel:  'Gondolero',
          showAgent:         false,
          limiteComercio:    c.objetivo_comercios ?? null,
        }}
        renderFotoAcciones={(fotoId, estado) =>
          estado === 'pendiente' ? (
            <div className="px-4 pb-4 shrink-0">
              <MarcaFotoAcciones fotoId={fotoId} estado={estado} />
            </div>
          ) : null
        }
      />
    </div>
  )
}
