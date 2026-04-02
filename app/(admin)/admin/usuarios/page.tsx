import { createClient as createAdminClient } from '@supabase/supabase-js'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoActor } from '@/types'
import { CambiarRolBtn } from './cambiar-rol-btn'
import { NuevoUsuarioModal } from './nuevo-usuario-modal'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TIPO_COLOR: Record<TipoActor, string> = {
  gondolero:    'bg-gondo-verde-50 text-gondo-verde-600',
  fixer:        'bg-blue-50 text-blue-600',
  distribuidora:'bg-gondo-amber-50 text-gondo-amber-400',
  marca:        'bg-gondo-indigo-50 text-gondo-indigo-600',
  admin:        'bg-red-50 text-red-600',
}

const NIVEL_COLOR: Record<string, string> = {
  casual: 'bg-gray-100 text-gray-500',
  activo: 'bg-blue-100 text-blue-700',
  pro:    'bg-amber-100 text-amber-700',
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: { tipo?: string }
}) {
  const admin = adminClient()
  const filtroTipo = searchParams.tipo ?? 'todos'

  let query = admin
    .from('profiles')
    .select(`
      id, nombre, tipo_actor, nivel, puntos_disponibles, created_at,
      distri:distribuidoras(razon_social),
      marca:marcas(razon_social)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filtroTipo !== 'todos') {
    query = query.eq('tipo_actor', filtroTipo)
  }

  const { data: profiles } = await query

  // Distribuidoras y marcas para el modal de nuevo usuario
  const [{ data: distribuidoras }, { data: marcas }] = await Promise.all([
    admin.from('distribuidoras').select('id, razon_social').order('razon_social'),
    admin.from('marcas').select('id, razon_social').order('razon_social'),
  ])

  // Obtener emails de auth
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailMap: Record<string, string> = {}
  authUsers.forEach(u => { emailMap[u.id] = u.email ?? '' })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lista = ((profiles ?? []) as any[]).map(p => ({
    ...p,
    email: emailMap[p.id] ?? '',
    distri_nombre: Array.isArray(p.distri) ? p.distri[0]?.razon_social : p.distri?.razon_social,
    marca_nombre:  Array.isArray(p.marca)  ? p.marca[0]?.razon_social  : p.marca?.razon_social,
  }))

  const TIPOS: Array<{ value: string; label: string }> = [
    { value: 'todos',         label: `Todos (${lista.length})` },
    { value: 'gondolero',     label: 'Gondoleros' },
    { value: 'distribuidora', label: 'Distribuidoras' },
    { value: 'marca',         label: 'Marcas' },
    { value: 'admin',         label: 'Admins' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">{lista.length} usuarios</p>
        </div>
        <NuevoUsuarioModal
          distribuidoras={(distribuidoras ?? []) as { id: string; razon_social: string }[]}
          marcas={(marcas ?? []) as { id: string; razon_social: string }[]}
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {TIPOS.map(t => (
          <a
            key={t.value}
            href={`/admin/usuarios${t.value !== 'todos' ? `?tipo=${t.value}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtroTipo === t.value
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Email', 'Tipo', 'Nivel', 'Vinculado a', 'Registro', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {u.nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[u.tipo_actor as TipoActor] ?? 'bg-gray-100 text-gray-500'}`}>
                      {u.tipo_actor}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.nivel && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${NIVEL_COLOR[u.nivel] ?? 'bg-gray-100 text-gray-500'}`}>
                        {u.nivel}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.distri_nombre ?? u.marca_nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(u.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <CambiarRolBtn userId={u.id} tipoActual={u.tipo_actor} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin usuarios</p>
          )}
        </div>
      </div>
    </div>
  )
}
