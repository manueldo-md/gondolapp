import { createClient as createAdminClient } from '@supabase/supabase-js'
import { MapPin } from 'lucide-react'
import { NuevaZonaBtn, ZonaFila } from './zona-modal'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ZonasPage() {
  const admin = adminClient()

  const [{ data: zonas }, { data: campanaZonas }, { data: gondoleroZonas }] = await Promise.all([
    admin.from('zonas').select('id, nombre, tipo, lat, lng').order('tipo').order('nombre'),
    admin.from('campana_zonas').select('zona_id'),
    admin.from('gondolero_zonas').select('zona_id'),
  ])

  const lista = zonas ?? []

  const campanaCountMap = new Map<string, number>()
  for (const cz of campanaZonas ?? []) {
    campanaCountMap.set(cz.zona_id, (campanaCountMap.get(cz.zona_id) ?? 0) + 1)
  }
  const gondoleroCountMap = new Map<string, number>()
  for (const gz of gondoleroZonas ?? []) {
    gondoleroCountMap.set(gz.zona_id, (gondoleroCountMap.get(gz.zona_id) ?? 0) + 1)
  }

  const resumen = {
    ciudades:   lista.filter(z => z.tipo === 'ciudad').length,
    provincias: lista.filter(z => z.tipo === 'provincia').length,
    regiones:   lista.filter(z => z.tipo === 'region').length,
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Zonas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {lista.length} zona{lista.length !== 1 ? 's' : ''} —
            {' '}{resumen.ciudades} ciudad{resumen.ciudades !== 1 ? 'es' : ''},
            {' '}{resumen.provincias} provincia{resumen.provincias !== 1 ? 's' : ''},
            {' '}{resumen.regiones} región{resumen.regiones !== 1 ? 'es' : ''}
          </p>
        </div>
        <NuevaZonaBtn />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <MapPin size={32} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">No hay zonas cargadas</p>
            <p className="text-xs text-gray-400 mt-1">
              Creá zonas para que los gondoleros puedan declararlas y las campañas puedan filtrarse por zona.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Nombre', 'Tipo', 'Coordenadas', 'Campañas', 'Gondoleros', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(zona => (
                  <ZonaFila
                    key={zona.id}
                    zona={zona as { id: string; nombre: string; tipo: 'ciudad' | 'provincia' | 'region'; lat: number | null; lng: number | null }}
                    campanas={campanaCountMap.get(zona.id) ?? 0}
                    gondoleros={gondoleroCountMap.get(zona.id) ?? 0}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
