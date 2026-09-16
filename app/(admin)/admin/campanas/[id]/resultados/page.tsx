import { notFound } from 'next/navigation'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { CampanaPageNav } from '@/components/campanas/campana-page-nav'
import { ResultadosView } from '@/components/campanas/ResultadosView'
import { loadResultadosCampanaData } from '@/lib/resultados'
import { FotoAccionesAdmin } from '../../../fotos/foto-acciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminCampanaResultadosPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { tab?: string }
}) {
  const admin = adminClient()

  const { data: campanaRaw, error } = await admin
    .from('campanas')
    .select('id, nombre, tipo, estado, fecha_fin, modalidad, visitas_por_semana, minimo_comercios, tope_total_comercios, comercios_relevados')
    .eq('id', params.id)
    .single()

  if (error || !campanaRaw) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = campanaRaw as any

  const tab = searchParams.tab ?? ''
  const data = await loadResultadosCampanaData(admin, params.id, tab, { ordenarPorMision: true })

  return (
    <div>
      <CampanaPageNav
        nombre={c.nombre}
        volverHref="/admin/campanas"
        detalleHref={`/admin/campanas/${params.id}/detalle`}
        resultadosHref={`/admin/campanas/${params.id}/resultados`}
        activo="resultados"
      />
      <ResultadosView
        data={data}
        campana={{
          id:                  c.id,
          nombre:              c.nombre,
          tipo:                c.tipo,
          fecha_fin:           c.fecha_fin ?? null,
          estado: c.estado ?? null,
          minimo_comercios: c.minimo_comercios ?? null,
          tope_total_comercios: c.tope_total_comercios ?? null,
          modalidad:            c.modalidad ?? null,
          visitas_por_semana:   c.visitas_por_semana ?? null,
        }}
        tab={tab}
        panel="admin"
        renderFotoAcciones={(fotoId, estado) =>
          (estado === 'pendiente' || estado === 'en_revision') ? (
            <div className="px-4 pb-4 shrink-0">
              <FotoAccionesAdmin fotoId={fotoId} />
            </div>
          ) : null
        }
      />
    </div>
  )
}
