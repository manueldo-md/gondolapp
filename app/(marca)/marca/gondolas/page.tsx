import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Image from 'next/image'
import { Camera } from 'lucide-react'
import { formatearFechaHora } from '@/lib/utils'
import type { EstadoFoto, DeclaracionFoto, TipoCampana } from '@/types'
import { GondolasFilter } from './gondolas-filter'

interface FotoRow {
  id: string
  storage_path: string | null
  url: string | null
  declaracion: DeclaracionFoto
  estado: EstadoFoto
  created_at: string
  comercio: { nombre: string } | null
  gondolero: { nombre: string | null; alias: string | null } | null
  signedUrl: string | null
}

interface CampanaOption {
  id: string
  nombre: string
  tipo: TipoCampana
}

const DECL_LABEL: Record<DeclaracionFoto, string> = {
  producto_presente:      'Presente',
  producto_no_encontrado: 'No encontrado',
  solo_competencia:       'Solo competencia',
}

const DECL_COLOR: Record<DeclaracionFoto, string> = {
  producto_presente:      'bg-green-100 text-green-700',
  producto_no_encontrado: 'bg-red-100 text-red-700',
  solo_competencia:       'bg-amber-100 text-amber-700',
}

const ESTADO_COLOR: Record<EstadoFoto, string> = {
  pendiente:   'bg-gray-100 text-gray-600',
  aprobada:    'bg-green-100 text-green-700',
  rechazada:   'bg-red-100 text-red-700',
  en_revision: 'bg-blue-100 text-blue-700',
}

const ESTADO_LABEL: Record<EstadoFoto, string> = {
  pendiente:   'Pendiente',
  aprobada:    'Aprobada',
  rechazada:   'Rechazada',
  en_revision: 'En revisión',
}

export default async function GondolasPage({
  searchParams,
}: {
  searchParams: { campana?: string; estado?: string }
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener marca_id
  const { data: profile } = await admin
    .from('profiles')
    .select('marca_id')
    .eq('id', user.id)
    .single()

  const marcaId = profile?.marca_id ?? null

  // Campañas de esta marca (para el filtro)
  const { data: campanasData } = await admin
    .from('campanas')
    .select('id, nombre, tipo')
    .eq('marca_id', marcaId ?? '')
    .order('created_at', { ascending: false })

  const campanas: CampanaOption[] = (campanasData as CampanaOption[] | null) ?? []
  const campanaIds = campanas.map(c => c.id)

  if (campanaIds.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Góndolas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Fotos recibidas en tus campañas</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <Camera size={32} className="text-gray-300 mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin fotos todavía</h3>
          <p className="text-sm text-gray-400">Primero creá una campaña para empezar a recibir fotos.</p>
        </div>
      </div>
    )
  }

  // Filtros desde URL
  const filtrosCampana = searchParams.campana ?? ''
  const filtroEstado = searchParams.estado ?? ''

  // Query de fotos
  let query = admin
    .from('fotos')
    .select('id, storage_path, url, declaracion, estado, created_at, comercio:comercios(nombre), gondolero:profiles(nombre, alias)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (filtrosCampana) {
    query = query.eq('campana_id', filtrosCampana)
  } else {
    query = query.in('campana_id', campanaIds)
  }

  if (filtroEstado) {
    query = query.eq('estado', filtroEstado as EstadoFoto)
  }

  const { data: fotosData } = await query

  // Generar URLs firmadas en paralelo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos: FotoRow[] = await Promise.all(
    ((fotosData ?? []) as any[]).map(async (f: any) => {
      let signedUrl: string | null = null
      if (f.storage_path) {
        const { data: signed } = await admin.storage
          .from('fotos-gondola')
          .createSignedUrl(f.storage_path, 3600)
        signedUrl = signed?.signedUrl ?? null
      }
      return { ...f, signedUrl: signedUrl ?? f.url ?? null }
    })
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Góndolas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fotos.length} foto{fotos.length !== 1 ? 's' : ''}
            {filtrosCampana ? ` en esta campaña` : ' en total'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <GondolasFilter
        campanas={campanas}
        campanaSeleccionada={filtrosCampana}
        estadoSeleccionado={filtroEstado}
      />

      {/* Grid */}
      {fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200 mt-4">
          <Camera size={32} className="text-gray-300 mb-4" />
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin fotos con ese filtro</h3>
          <p className="text-sm text-gray-400">Probá cambiando los filtros.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-4">
          {fotos.map(f => (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gondo-indigo-50 transition-colors">
              {/* Imagen */}
              <div className="relative aspect-square bg-gray-100">
                {f.signedUrl ? (
                  <Image
                    src={f.signedUrl}
                    alt="Foto de góndola"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <Camera size={24} className="absolute inset-0 m-auto text-gray-300" />
                )}
                {/* Badge de estado superpuesto */}
                <span className={`absolute top-1.5 right-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_COLOR[f.estado]}`}>
                  {ESTADO_LABEL[f.estado]}
                </span>
              </div>

              {/* Info */}
              <div className="p-2.5">
                <p className="text-xs font-medium text-gray-800 truncate mb-1">
                  {(f.comercio as { nombre: string } | null)?.nombre ?? 'Comercio'}
                </p>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${DECL_COLOR[f.declaracion]}`}>
                    {DECL_LABEL[f.declaracion]}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5 truncate">
                  {(f.gondolero as { nombre: string | null; alias: string | null } | null)?.alias
                    ?? (f.gondolero as { nombre: string | null; alias: string | null } | null)?.nombre
                    ?? '—'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatearFechaHora(f.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
