import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'

const POR_PAGINA = 20

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: { pagina?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const pagina = Math.max(1, parseInt(searchParams.pagina ?? '1', 10))
  const desde = (pagina - 1) * POR_PAGINA

  const { data: movimientos, count } = await admin
    .from('movimientos_puntos')
    .select('id, tipo, monto, concepto, created_at', { count: 'exact' })
    .eq('gondolero_id', user.id)
    .order('created_at', { ascending: false })
    .range(desde, desde + POR_PAGINA - 1)

  const lista = movimientos ?? []
  const total = count ?? 0
  const totalPaginas = Math.ceil(total / POR_PAGINA)

  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/actividad"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1"
        >
          <ArrowLeft size={16} />
          Actividad
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Movimientos de puntos</h1>
        {total > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">{total} movimientos</p>
        )}
      </div>

      <div className="px-4 py-4">
        {lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-base font-semibold text-gray-700">Sin movimientos todavía</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
            {lista.map((m: {
              id: string
              tipo: string
              monto: number
              concepto: string | null
              created_at: string
            }) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  m.tipo === 'credito' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {m.tipo === 'credito'
                    ? <ArrowUp size={14} className="text-gondo-verde-400" />
                    : <ArrowDown size={14} className="text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{m.concepto ?? 'Movimiento'}</p>
                  <p className="text-xs text-gray-400">{tiempoRelativo(m.created_at)}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${
                  m.tipo === 'credito' ? 'text-gondo-verde-400' : 'text-red-500'
                }`}>
                  {m.tipo === 'credito' ? '+' : '−'}{m.monto.toLocaleString('es-AR')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            {pagina > 1 && (
              <Link
                href={`/gondolero/actividad/movimientos?pagina=${pagina - 1}`}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white"
              >
                ← Anterior
              </Link>
            )}
            <span className="text-sm text-gray-400">{pagina} / {totalPaginas}</span>
            {pagina < totalPaginas && (
              <Link
                href={`/gondolero/actividad/movimientos?pagina=${pagina + 1}`}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white"
              >
                Siguiente →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
