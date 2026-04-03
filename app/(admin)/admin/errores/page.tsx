import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { ErroresGrid } from './errores-grid'

export default async function ErroresPage({
  searchParams,
}: {
  searchParams: { estado?: string; actor?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let query = admin
    .from('errores_reportados')
    .select('id, usuario_id, tipo_actor, url, descripcion, error_tecnico, contexto, estado, created_at, perfil:profiles(nombre)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (searchParams.estado) query = query.eq('estado', searchParams.estado)
  if (searchParams.actor)  query = query.eq('tipo_actor', searchParams.actor)

  const { data } = await query

  const errores = (data ?? []) as unknown as {
    id: string
    usuario_id: string | null
    tipo_actor: string | null
    url: string
    descripcion: string | null
    error_tecnico: string | null
    contexto: Record<string, unknown> | null
    estado: string
    created_at: string
    perfil: { nombre: string } | null
  }[]

  const { count: totalNuevos } = await admin
    .from('errores_reportados')
    .select('*', { count: 'exact', head: true })
    .eq('estado', 'nuevo')

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <AlertTriangle size={22} className="text-amber-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Errores reportados</h1>
          {(totalNuevos ?? 0) > 0 && (
            <p className="text-sm text-amber-600 font-medium">
              {totalNuevos} sin revisar
            </p>
          )}
        </div>
      </div>

      <ErroresGrid errores={errores} estadoFiltro={searchParams.estado} actorFiltro={searchParams.actor} />
    </div>
  )
}
