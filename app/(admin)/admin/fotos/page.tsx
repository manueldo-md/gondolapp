import { createClient as createAdminClient } from '@supabase/supabase-js'
import { FotosGrid } from './fotos-grid'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
      id, url, storage_path, estado, declaracion, puntos_otorgados, precio_detectado, precio_confirmado, created_at,
      gondolero:profiles!gondolero_id(nombre, alias),
      comercio:comercios(nombre),
      campana:campanas(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(60)

  if (filtroEstado !== 'todos') {
    query = query.eq('estado', filtroEstado)
  } else {
    // Por defecto excluir archivadas del listado general
    query = query.neq('estado', 'archivada')
  }

  if (searchParams.campana) query = query.eq('campana_id', searchParams.campana)

  const { data: fotosRaw, error: fotosError } = await query
  if (fotosError) console.error('[admin/fotos] query error:', fotosError.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fotos = (fotosRaw ?? []) as any[]
  console.log(`[admin/fotos] found ${fotos.length} fotos, filtro=${filtroEstado}`)

  // Generate signed URLs
  const signed = await Promise.all(
    fotos.map(async f => {
      const path: string | null = f.storage_path ?? null
      if (!path) return { id: f.id, signedUrl: f.url ?? null }
      const { data, error } = await admin.storage
        .from('fotos-gondola')
        .createSignedUrl(path, 3600)
      if (error) console.warn(`[admin/fotos] signedUrl error para ${f.id}:`, error.message)
      return { id: f.id, signedUrl: data?.signedUrl ?? f.url ?? null }
    })
  )
  const signedMap: Record<string, string | null> = {}
  signed.forEach(s => { signedMap[s.id] = s.signedUrl })

  // Fetch respuestas de formulario dinámico
  const fotoIds = fotos.map(f => f.id)
  const respuestasMap: Record<string, { pregunta: string; tipo: string; valor: unknown }[]> = {}
  if (fotoIds.length > 0) {
    const { data: respsData } = await admin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from('foto_respuestas' as any)
      .select('foto_id, valor, campo:bloque_campos(pregunta, tipo)')
      .in('foto_id', fotoIds)
    if (respsData) {
      for (const r of respsData as { foto_id: string; valor: unknown; campo: { pregunta: string; tipo: string } | { pregunta: string; tipo: string }[] | null }[]) {
        const campo = Array.isArray(r.campo) ? r.campo[0] : r.campo
        if (!campo) continue
        if (!respuestasMap[r.foto_id]) respuestasMap[r.foto_id] = []
        respuestasMap[r.foto_id].push({ pregunta: campo.pregunta, tipo: campo.tipo, valor: r.valor })
      }
    }
  }

  const FILTROS = ['todos', 'pendiente', 'aprobada', 'rechazada', 'en_revision', 'archivada']

  // Preparar datos para el componente cliente
  const fotosItems = fotos.map(f => ({
    id:              f.id,
    estado:          f.estado,
    signedUrl:       signedMap[f.id] ?? null,
    gondoleroNombre: Array.isArray(f.gondolero)
      ? (f.gondolero[0]?.alias ?? f.gondolero[0]?.nombre)
      : (f.gondolero?.alias ?? f.gondolero?.nombre),
    comercioNombre:  Array.isArray(f.comercio)  ? f.comercio[0]?.nombre  : f.comercio?.nombre,
    campanaNombre:   Array.isArray(f.campana)   ? f.campana[0]?.nombre   : f.campana?.nombre,
    createdAt:       f.created_at,
    precioConfirmado: f.precio_confirmado ?? null,
    precioDetectado:  f.precio_detectado ?? null,
    respuestas:      respuestasMap[f.id] ?? [],
  }))

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
            {f === 'en_revision' ? 'en revisión' : f}
          </a>
        ))}
      </div>

      {fotosItems.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-sm text-gray-400">No hay fotos con este filtro</p>
        </div>
      ) : (
        <FotosGrid fotos={fotosItems} />
      )}
    </div>
  )
}
