import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Clock, Target, Megaphone } from 'lucide-react'
import {
  labelEstadoCampana,
  colorEstadoCampana,
  diasRestantes,
  calcularPorcentaje,
} from '@/lib/utils'
import type { TipoCampana, EstadoCampana } from '@/types'

interface CampanaRow {
  id: string
  nombre: string
  tipo: TipoCampana
  estado: EstadoCampana
  fecha_inicio: string | null
  fecha_fin: string | null
  objetivo_comercios: number | null
  comercios_relevados: number
  puntos_por_foto: number
  financiada_por: string
  marca: { razon_social: string } | null
  created_at: string
}

export default async function CampanasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id ?? null

  // Todas las campañas donde participa esta distribuidora
  // (tanto propias financiada_por='distri' como las de marcas con distri_id asignado)
  const { data, error } = await admin
    .from('campanas')
    .select(`
      id, nombre, tipo, estado, fecha_inicio, fecha_fin,
      objetivo_comercios, comercios_relevados, puntos_por_foto,
      financiada_por, created_at,
      marca:marcas ( razon_social )
    `)
    .eq('distri_id', distriId ?? '')
    .order('created_at', { ascending: false })

  if (error) console.error('Error fetching campanas:', error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campanas = ((data ?? []) as any[]).map((c: any) => ({
    ...c,
    marca: Array.isArray(c.marca) ? (c.marca[0] ?? null) : c.marca,
  })) as CampanaRow[]

  const propias  = campanas.filter(c => c.financiada_por === 'distri')
  const deMarca  = campanas.filter(c => c.financiada_por !== 'distri')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Campañas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {propias.length} interna{propias.length !== 1 ? 's' : ''}
            {deMarca.length > 0 ? ` · ${deMarca.length} de marca` : ''}
          </p>
        </div>
        <Link
          href="/distribuidora/campanas/nueva"
          className="flex items-center gap-2 px-4 py-2.5 bg-gondo-amber-400 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Nueva campaña interna
        </Link>
      </div>

      {campanas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Megaphone size={32} className="text-gray-300 mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin campañas todavía</h3>
          <p className="text-sm text-gray-400 mb-6">
            Creá tu primera campaña interna para coordinar a tus gondoleros.
          </p>
          <Link
            href="/distribuidora/campanas/nueva"
            className="px-5 py-2.5 bg-gondo-amber-400 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Crear primera campaña
          </Link>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Campañas propias ── */}
          {propias.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Campañas internas
              </h3>
              <CampanaList campanas={propias} />
            </section>
          )}

          {/* ── Campañas de marcas ── */}
          {deMarca.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Campañas de marcas
              </h3>
              <CampanaList campanas={deMarca} />
            </section>
          )}

        </div>
      )}
    </div>
  )
}

function CampanaList({ campanas }: { campanas: CampanaRow[] }) {
  return (
    <div className="space-y-3">
      {campanas.map(c => {
        const dias     = c.fecha_fin ? diasRestantes(c.fecha_fin) : null
        const progreso = calcularPorcentaje(c.comercios_relevados, c.objetivo_comercios ?? 0)
        const esPropia = c.financiada_por === 'distri'

        return (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gondo-amber-400/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">

                {/* Badges */}
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    esPropia
                      ? 'bg-gondo-amber-50 text-gondo-amber-400'
                      : 'bg-gondo-indigo-50 text-gondo-indigo-600'
                  }`}>
                    {esPropia ? 'Interna' : `Marca${c.marca?.razon_social ? ` · ${c.marca.razon_social}` : ''}`}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${colorEstadoCampana(c.estado)}`}>
                    {labelEstadoCampana(c.estado)}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 text-base mb-3">{c.nombre}</h3>

                {/* Stats */}
                <div className="flex items-center gap-5 text-xs text-gray-500">
                  {dias !== null && (
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span className={dias <= 3 ? 'text-red-500 font-medium' : ''}>
                        {dias === 0 ? 'Último día' : `${dias} días restantes`}
                      </span>
                    </div>
                  )}
                  {c.objetivo_comercios && (
                    <div className="flex items-center gap-1">
                      <Target size={12} />
                      <span>{c.comercios_relevados} / {c.objetivo_comercios} comercios</span>
                    </div>
                  )}
                </div>

                {/* Barra de progreso */}
                {c.objetivo_comercios && c.objetivo_comercios > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-xs">
                      <div
                        className={`h-full rounded-full transition-all ${esPropia ? 'bg-gondo-amber-400' : 'bg-gondo-indigo-600'}`}
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <Link
                href={`/distribuidora/gondolas?campana=${c.id}`}
                className="shrink-0 text-xs font-semibold text-gondo-amber-400 hover:underline"
              >
                Ver fotos →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
