import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Users, Camera, CheckCircle2, Clock, Megaphone } from 'lucide-react'
import { formatearDia, formatearInstanteHora } from '@/lib/fecha-ar'
import { firmarFotos } from '@/lib/storage-fotos'
import { contarFotosAprobadas } from '@/lib/fotos-aprobadas'
import { inicioDelMes } from '@/lib/nivel-mensual'

function makeAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const NULL_UUID = '00000000-0000-0000-0000-000000000000'
function safe(ids: string[]) { return ids.length > 0 ? ids : [NULL_UUID] }

export default async function RepoDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = makeAdmin()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (admin as any)
    .from('profiles').select('repositora_id').eq('id', user.id).single()
  const repoId = profile?.repositora_id as string | null
  if (!repoId) redirect('/auth')

  // Fechas de referencia
  const ahora = new Date()
  const mesInicio = inicioDelMes(ahora)

  // Obtener IDs de fixers vinculados
  const { data: fixersData } = await admin
    .from('profiles')
    .select('id, alias, nombre')
    .eq('repositora_id', repoId)
    .eq('tipo_actor', 'fixer')

  const fixerIds = (fixersData ?? []).map((f: { id: string }) => f.id)
  const safeFixers = safe(fixerIds)

  // "Fotos aprobadas" se cuenta contra `fotos`: `profiles.fotos_aprobadas` era
  // un contador que la RPC inexistente nunca incrementó. Ver lib/fotos-aprobadas.ts.
  const aprobadasMap = await contarFotosAprobadas(fixerIds, admin)

  // Consultas en paralelo
  const [
    fotosEsteMesRes,
    fotosAprobEsteMesRes,
    fotosRechEsteMesRes,
    misionesEsteMesRes,
    campanasActivasRes,
    fotosRecientesRes,
  ] = await Promise.all([
    // Total fotos este mes
    admin.from('fotos')
      .select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeFixers)
      .gte('created_at', mesInicio.toISOString()),
    // Fotos aprobadas este mes
    admin.from('fotos')
      .select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeFixers)
      .eq('estado', 'aprobada')
      .gte('created_at', mesInicio.toISOString()),
    // Fotos rechazadas este mes
    admin.from('fotos')
      .select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeFixers)
      .eq('estado', 'rechazada')
      .gte('created_at', mesInicio.toISOString()),
    // Misiones completadas este mes
    admin.from('participaciones')
      .select('*', { count: 'exact', head: true })
      .in('gondolero_id', safeFixers)
      .eq('estado', 'completada')
      .gte('joined_at', mesInicio.toISOString()),
    // Campañas activas para fixers
    admin.from('campanas')
      .select('id, nombre, tipo, estado, fecha_fin, comercios_relevados, minimo_comercios')
      .eq('estado', 'activa')
      .eq('actor_campana', 'fixer')
      .order('created_at', { ascending: false })
      .limit(5),
    // Fotos recientes de los fixers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).from('fotos')
      .select('id, url, storage_path, estado, created_at, gondolero_id, campana:campanas(nombre), comercio:comercios(nombre)')
      .in('gondolero_id', safeFixers)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const fixersActivos = fixerIds.length
  const fotosEsteMes = fotosEsteMesRes.count ?? 0
  const fotosAprobadas = fotosAprobEsteMesRes.count ?? 0
  const fotosRechazadas = fotosRechEsteMesRes.count ?? 0
  const fotosPendientes = fotosEsteMes - fotosAprobadas - fotosRechazadas
  const misionesCompletadas = misionesEsteMesRes.count ?? 0
  const campanasActivas = (campanasActivasRes.data ?? []) as {
    id: string; nombre: string; tipo: string; estado: string
    fecha_fin: string | null; comercios_relevados: number; minimo_comercios: number | null
  }[]
  const fotosRecientes = (fotosRecientesRes.data ?? []) as {
    id: string; url: string | null; storage_path: string | null
    estado: string; created_at: string; gondolero_id: string
    campana: { nombre: string } | null; comercio: { nombre: string } | null
  }[]

  // Los buckets son PRIVADOS: mostrar `f.url` crudo deja la imagen rota para
  // toda foto que viva en Storage. Esta pantalla y /repositora/gondolas eran las
  // dos que no firmaban — las otras cinco ya lo hacían. Ver lib/storage-fotos.ts.
  const fotosFirmadas = await firmarFotos(fotosRecientes, admin)

  const ESTADO_COLOR: Record<string, string> = {
    pendiente:   'bg-amber-100 text-amber-700',
    aprobada:    'bg-green-100 text-green-700',
    rechazada:   'bg-red-100 text-red-700',
    en_revision: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Resumen de actividad de tus fixers</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={16} className="text-blue-600" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fixers activos</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fixersActivos}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Camera size={16} className="text-blue-600" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fotos este mes</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{fotosEsteMes}</p>
          <div className="flex gap-3 mt-2">
            <span className="text-xs text-green-600 font-medium">{fotosAprobadas} aprobadas</span>
            <span className="text-xs text-amber-600 font-medium">{fotosPendientes} pendientes</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-blue-600" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Misiones completadas</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{misionesCompletadas}</p>
          <p className="text-xs text-gray-400 mt-1">este mes</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Megaphone size={16} className="text-blue-600" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Campañas activas</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{campanasActivas.length}</p>
          <p className="text-xs text-gray-400 mt-1">para fixers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fotos recientes */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Fotos recientes</h2>
          </div>
          {fotosRecientes.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin fotos aún</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {fotosRecientes.map(f => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                    {fotosFirmadas[f.id] && (
                      <Image src={fotosFirmadas[f.id]} alt="" width={40} height={40} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {f.comercio?.nombre ?? 'Comercio desconocido'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {f.campana?.nombre ?? 'Sin campaña'} · {formatearInstanteHora(f.created_at)}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[f.estado] ?? 'bg-gray-100 text-gray-500'}`}>
                    {f.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campañas activas */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Campañas para fixers</h2>
          </div>
          {campanasActivas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin campañas activas para fixers</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {campanasActivas.map(c => (
                <div key={c.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-gray-900">{c.nombre}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">{c.tipo}</span>
                    {c.minimo_comercios && (
                      <span className="text-xs text-gray-400">
                        {c.comercios_relevados}/{c.minimo_comercios} comercios
                      </span>
                    )}
                    {c.fecha_fin && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={11} />
                        vence {formatearDia(c.fecha_fin)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabla de fixers */}
      {fixersData && fixersData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Mis fixers</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Fixer', 'Fotos aprobadas'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(fixersData as any[]).map(f => (
                  <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{f.alias ?? f.nombre ?? 'Sin nombre'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {aprobadasMap.get(f.id) ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
