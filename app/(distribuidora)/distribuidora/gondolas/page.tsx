import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Clock, MapPin, User } from 'lucide-react'
import { formatearFechaHora, labelTipoCampana } from '@/lib/utils'
import type { DeclaracionFoto, TipoCampana } from '@/types'
import { FotoAcciones } from './foto-acciones'
import { FotoLightbox } from '@/components/shared/foto-lightbox'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface FotoPendienteRaw {
  id: string
  url: string
  storage_path: string | null
  declaracion: DeclaracionFoto
  precio_detectado: number | null
  created_at: string
  campana_id: string
  gondolero: { nombre: string | null; alias: string | null } | null
  comercio:  { nombre: string; direccion: string | null } | null
  campana:   { nombre: string; tipo: TipoCampana } | null
}

interface FotoPendiente extends FotoPendienteRaw {
  signedUrl: string | null
}

// ── Helpers visuales ──────────────────────────────────────────────────────────

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

// ── FotoCard ──────────────────────────────────────────────────────────────────

function FotoCard({ foto }: { foto: FotoPendiente & { campana_id: string } }) {
  const gondoleroNombre = foto.gondolero?.alias ?? foto.gondolero?.nombre ?? 'Gondolero'
  const decl = foto.declaracion
  const imgSrc = foto.signedUrl ?? foto.url

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col">

      {/* Imagen */}
      <FotoLightbox
        src={imgSrc}
        alt={`Foto de ${foto.comercio?.nombre ?? 'comercio'}`}
        containerClassName="relative w-full h-52 shrink-0"
      />

      {/* Datos */}
      <div className="p-4 flex-1 flex flex-col gap-3">

        {foto.campana && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                {foto.campana.nombre}
              </span>
              <span className="text-[10px] text-gray-300">·</span>
              <span className="text-[11px] text-gray-400 shrink-0">
                {labelTipoCampana(foto.campana.tipo)}
              </span>
            </div>
            <Link
              href={`/distribuidora/campanas/${foto.campana_id}`}
              className="shrink-0 text-[11px] font-semibold text-gondo-amber-400 hover:underline"
            >
              Ver campana →
            </Link>
          </div>
        )}

        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {foto.comercio?.nombre ?? 'Comercio desconocido'}
            </p>
            {foto.comercio?.direccion && (
              <p className="text-xs text-gray-400 truncate">{foto.comercio.direccion}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <User size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 truncate">{gondoleroNombre}</span>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${DECL_COLOR[decl]}`}>
            {DECL_LABEL[decl]}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400 mt-auto">
          {foto.precio_detectado != null
            ? <span className="font-medium text-gray-600">${foto.precio_detectado}</span>
            : <span />
          }
          <div className="flex items-center gap-1">
            <Clock size={11} />
            <span>{formatearFechaHora(foto.created_at)}</span>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 shrink-0">
        <FotoAcciones fotoId={foto.id} />
      </div>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function GondolasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario actual
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id ?? null

  // Gondoleros vinculados a esta distribuidora
  const { data: gondoleros } = await admin
    .from('profiles')
    .select('id')
    .eq('distri_id', distriId ?? '')

  const gondoleroIds = (gondoleros ?? []).map((g: { id: string }) => g.id)

  // Campañas propias de esta distribuidora
  const { data: campanasDistri } = await admin
    .from('campanas')
    .select('id')
    .eq('distri_id', distriId ?? '')

  const campanaIds = (campanasDistri ?? []).map((c: { id: string }) => c.id)

  // Fotos donde gondolero es de la distri OR la campaña pertenece a la distri
  const hayGondoleros = gondoleroIds.length > 0
  const hayCampanas   = campanaIds.length > 0

  let query = admin
    .from('fotos')
    .select(`
      id, url, storage_path, declaracion, precio_detectado, created_at, campana_id,
      gondolero:profiles ( nombre, alias ),
      comercio:comercios  ( nombre, direccion ),
      campana:campanas    ( nombre, tipo )
    `)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })
    .limit(100)

  if (hayGondoleros && hayCampanas) {
    query = query.or(
      `gondolero_id.in.(${gondoleroIds.join(',')}),campana_id.in.(${campanaIds.join(',')})`
    )
  } else if (hayGondoleros) {
    query = query.in('gondolero_id', gondoleroIds)
  } else if (hayCampanas) {
    query = query.in('campana_id', campanaIds)
  } else {
    // Sin gondoleros ni campañas → no hay fotos
    query = query.in('gondolero_id', [''])
  }

  const { data, error } = await query

  if (error) console.error('Error fetching fotos pendientes:', error.message)

  const fotosRaw = (data as FotoPendienteRaw[] | null) ?? []

  // Generar URLs firmadas para el bucket privado
  const fotos: FotoPendiente[] = await Promise.all(
    fotosRaw.map(async (foto) => {
      if (!foto.storage_path) return { ...foto, signedUrl: null }
      const { data: signed } = await admin.storage
        .from('fotos-gondola')
        .createSignedUrl(foto.storage_path, 3600)
      return { ...foto, signedUrl: signed?.signedUrl ?? null }
    })
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fotos pendientes</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fotos.length === 0
              ? 'No hay fotos pendientes de revisión'
              : `${fotos.length} foto${fotos.length !== 1 ? 's' : ''} esperando revisión`
            }
          </p>
        </div>
      </div>

      {fotos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle2 size={28} className="text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Todo al día</h3>
          <p className="text-sm text-gray-400">No hay fotos pendientes de revisión.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {fotos.map(foto => (
            <FotoCard key={foto.id} foto={foto} />
          ))}
        </div>
      )}
    </div>
  )
}
