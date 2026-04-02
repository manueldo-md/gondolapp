import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  Users, Store, Megaphone, Image, Star, Gift, Truck, Tag,
} from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function TablasAdminPage() {
  const admin = adminClient()

  const [
    { count: gondoleros },
    { count: distribuidoras },
    { count: marcas },
    { count: campanasActivas },
    { data: fotosStats },
    { count: comercios },
    { data: puntosData },
    { count: canjesPendientes },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('tipo_actor', 'gondolero'),
    admin.from('distribuidoras').select('*', { count: 'exact', head: true }),
    admin.from('marcas').select('*', { count: 'exact', head: true }),
    admin.from('campanas').select('*', { count: 'exact', head: true }).eq('estado', 'activa'),
    admin.from('fotos').select('estado'),
    admin.from('comercios').select('*', { count: 'exact', head: true }),
    admin.from('movimientos_puntos').select('monto').eq('tipo', 'credito'),
    admin.from('canjes').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente'),
  ])

  const fotosList = (fotosStats ?? []) as { estado: string }[]
  const fotosPendientes = fotosList.filter(f => f.estado === 'pendiente').length
  const fotosAprobadas  = fotosList.filter(f => f.estado === 'aprobada').length
  const fotosRechazadas = fotosList.filter(f => f.estado === 'rechazada').length
  const fotosTotal      = fotosList.length
  const puntosEmitidos  = ((puntosData ?? []) as { monto: number }[]).reduce((s, r) => s + (r.monto ?? 0), 0)

  // Últimos eventos: fotos + usuarios + campañas
  const [
    { data: fotosRecientes },
    { data: usuariosRecientes },
    { data: campanasRecientes },
  ] = await Promise.all([
    admin.from('fotos')
      .select('id, estado, created_at, gondolero:profiles!gondolero_id(nombre), comercio:comercios(nombre)')
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('profiles')
      .select('id, nombre, tipo_actor, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    admin.from('campanas')
      .select('id, nombre, estado, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  type Evento = { tipo: 'foto' | 'usuario' | 'campana'; descripcion: string; fecha: string; badge: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventos: Evento[] = [
    ...((fotosRecientes ?? []) as any[]).map(f => ({
      tipo: 'foto' as const,
      descripcion: `Foto de ${f.gondolero?.nombre ?? '?'} en ${f.comercio?.nombre ?? '?'}`,
      fecha: f.created_at,
      badge: f.estado === 'pendiente' ? 'Pendiente' : f.estado === 'aprobada' ? 'Aprobada' : 'Rechazada',
    })),
    ...((usuariosRecientes ?? []) as any[]).map(u => ({
      tipo: 'usuario' as const,
      descripcion: `Nuevo ${u.tipo_actor}: ${u.nombre ?? 'Sin nombre'}`,
      fecha: u.created_at,
      badge: u.tipo_actor,
    })),
    ...((campanasRecientes ?? []) as any[]).map(c => ({
      tipo: 'campana' as const,
      descripcion: `Campaña: ${c.nombre}`,
      fecha: c.created_at,
      badge: c.estado,
    })),
  ]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 10)

  const METRICAS = [
    { label: 'Gondoleros',         valor: gondoleros ?? 0,    icon: Users,     color: 'text-gondo-verde-400' },
    { label: 'Distribuidoras',     valor: distribuidoras ?? 0,icon: Truck,     color: 'text-gondo-amber-400' },
    { label: 'Marcas',             valor: marcas ?? 0,        icon: Tag,       color: 'text-gondo-indigo-600' },
    { label: 'Campañas activas',   valor: campanasActivas ?? 0,icon: Megaphone, color: 'text-purple-500' },
    { label: 'Fotos totales',      valor: fotosTotal,         icon: Image,     color: 'text-gray-500',
      sub: `${fotosPendientes} pend · ${fotosAprobadas} apr · ${fotosRechazadas} rech` },
    { label: 'Comercios mapeados', valor: comercios ?? 0,     icon: Store,     color: 'text-teal-500' },
    { label: 'Puntos emitidos',    valor: puntosEmitidos,     icon: Star,      color: 'text-yellow-500' },
    { label: 'Canjes pendientes',  valor: canjesPendientes ?? 0, icon: Gift,  color: 'text-red-500' },
  ]

  const BADGE_COLOR: Record<string, string> = {
    pendiente:   'bg-amber-100 text-amber-700',
    aprobada:    'bg-green-100 text-green-700',
    rechazada:   'bg-red-100 text-red-700',
    activa:      'bg-blue-100 text-blue-700',
    gondolero:   'bg-gondo-verde-50 text-gondo-verde-600',
    distribuidora: 'bg-gondo-amber-50 text-gondo-amber-400',
    marca:       'bg-gondo-indigo-50 text-gondo-indigo-600',
    admin:       'bg-gray-100 text-gray-600',
    foto:        'bg-gray-100 text-gray-500',
    usuario:     'bg-gray-100 text-gray-500',
    campana:     'bg-gray-100 text-gray-500',
    pausada:     'bg-gray-100 text-gray-500',
    cerrada:     'bg-gray-100 text-gray-500',
    Pendiente:   'bg-amber-100 text-amber-700',
    Aprobada:    'bg-green-100 text-green-700',
    Rechazada:   'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tablero</h1>
        <p className="text-sm text-gray-500 mt-0.5">Vista general de la plataforma</p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METRICAS.map(m => {
          const Icon = m.icon
          return (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">{m.label}</p>
                <Icon size={15} className={m.color} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{m.valor.toLocaleString('es-AR')}</p>
              {'sub' in m && m.sub && <p className="text-[11px] text-gray-400 mt-0.5">{m.sub}</p>}
            </div>
          )
        })}
      </div>

      {/* Últimos eventos */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Últimos eventos</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {eventos.map((e, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3">
              <p className="text-sm text-gray-700">{e.descripcion}</p>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BADGE_COLOR[e.badge] ?? 'bg-gray-100 text-gray-500'}`}>
                  {e.badge}
                </span>
                <span className="text-xs text-gray-400">{tiempoRelativo(e.fecha)}</span>
              </div>
            </div>
          ))}
          {eventos.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Sin eventos recientes</p>
          )}
        </div>
      </div>
    </div>
  )
}
