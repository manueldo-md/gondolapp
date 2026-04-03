import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Camera } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import { RetirarFotoBtn } from '../../misiones/[campanaId]/retirar-foto-btn'

type FotoPendiente = {
  id: string
  url: string
  created_at: string
  comercio: { nombre: string } | null
  campana: { nombre: string; id: string } | null
}

export default async function FotosPendientesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data } = await admin
    .from('fotos')
    .select('id, url, created_at, comercio:comercios(nombre), campana:campanas(id, nombre)')
    .eq('gondolero_id', user.id)
    .in('estado', ['pendiente', 'en_revision'])
    .order('created_at', { ascending: false })

  const fotos = (data ?? []) as FotoPendiente[]

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 sticky top-0 z-10">
        <Link
          href="/gondolero/actividad"
          className="inline-flex items-center gap-1.5 text-gray-500 text-sm mb-3 -ml-1"
        >
          <ArrowLeft size={16} />
          Actividad
        </Link>
        <h1 className="text-lg font-bold text-gray-900">Fotos en revisión</h1>
        {fotos.length > 0 && (
          <p className="text-sm text-gray-400 mt-0.5">
            {fotos.length} {fotos.length === 1 ? 'foto pendiente' : 'fotos pendientes'} de aprobación
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {fotos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-base font-semibold text-gray-700 mb-1">
              Sin fotos pendientes
            </h2>
            <p className="text-sm text-gray-400 max-w-xs">
              Todas tus fotos fueron revisadas.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {fotos.map(foto => (
              <div key={foto.id} className="flex items-center gap-3 p-4">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                  {foto.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={foto.url}
                      alt="Foto de góndola"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera size={20} className="text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {foto.comercio?.nombre ?? 'Comercio'}
                  </p>
                  {foto.campana && (
                    <Link
                      href={`/gondolero/misiones/${foto.campana.id}`}
                      className="text-xs text-gondo-verde-400 font-medium truncate block"
                    >
                      {foto.campana.nombre}
                    </Link>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{tiempoRelativo(foto.created_at)}</p>
                </div>

                {/* Acciones */}
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    En revisión
                  </span>
                  <RetirarFotoBtn fotoId={foto.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
