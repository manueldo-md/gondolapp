import { createClient as createAdminClient } from '@supabase/supabase-js'
import { tiempoRelativo } from '@/lib/utils'
import { FotoLightbox } from '@/components/shared/foto-lightbox'
import { FotoAccionesAdmin } from './foto-acciones'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ESTADO_COLOR: Record<string, string> = {
  pendiente:   'bg-amber-100 text-amber-700 border-amber-200',
  aprobada:    'bg-green-100 text-green-700 border-green-200',
  rechazada:   'bg-red-100 text-red-700 border-red-200',
  en_revision: 'bg-blue-100 text-blue-700 border-blue-200',
}

export default async function FotosAdminPage({
  searchParams,
}: {
  searchParams: { estado?: string; campana?: string }
}) {
  const admin = adminClient()
  const filtroEstado = searchParams.estado ?? 'todos'

  let query = admin
    .from('fotos')
    .select(`
      id, url, estado, declaracion, puntos_otorgados, created_at,
      gondolero:profiles!gondolero_id(nombre),
      comercio:comercios(nombre),
      campana:campanas(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(60)

  if (filtroEstado !== 'todos') query = query.eq('estado', filtroEstado)
  if (searchParams.campana) query = query.eq('campana_id', searchParams.campana)

  const { data: fotosRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]

  // Generate signed URLs
  const signed = await Promise.all(
    fotos.map(async f => {
      const { data } = await admin.storage.from('fotos-gondola').createSignedUrl(f.url, 3600)
      return { id: f.id, signedUrl: data?.signedUrl ?? null }
    })
  )
  const signedMap: Record<string, string | null> = {}
  signed.forEach(s => { signedMap[s.id] = s.signedUrl })

  const FILTROS = ['todos', 'pendiente', 'aprobada', 'rechazada', 'en_revision']

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Fotos</h1>
        <p className="text-sm text-gray-500 mt-0.5">{fotos.length} fotos (últimas 60)</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <a
            key={f}
            href={`/admin/fotos${f !== 'todos' ? `?estado=${f}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filtroEstado === f
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {fotos.map(f => {
          const gondoleroNombre = Array.isArray(f.gondolero) ? f.gondolero[0]?.nombre : f.gondolero?.nombre
          const comercioNombre  = Array.isArray(f.comercio)  ? f.comercio[0]?.nombre  : f.comercio?.nombre
          const campanaNombre   = Array.isArray(f.campana)   ? f.campana[0]?.nombre   : f.campana?.nombre
          const signedUrl = signedMap[f.id] ?? null

          return (
            <div key={f.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <FotoLightbox
                src={signedUrl}
                alt={`Foto ${f.id}`}
                containerClassName="relative w-full h-44 shrink-0"
              >
                <div className="absolute top-2 left-2">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ESTADO_COLOR[f.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {f.estado}
                  </span>
                </div>
              </FotoLightbox>
              <div className="p-3 space-y-1">
                <p className="text-xs font-medium text-gray-800 truncate">{gondoleroNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-500 truncate">{comercioNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-400 truncate">{campanaNombre ?? '—'}</p>
                <p className="text-[11px] text-gray-400">{tiempoRelativo(f.created_at)}</p>
                {f.estado === 'pendiente' && (
                  <FotoAccionesAdmin fotoId={f.id} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {fotos.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-sm text-gray-400">No hay fotos con este filtro</p>
        </div>
      )}
    </div>
  )
}
