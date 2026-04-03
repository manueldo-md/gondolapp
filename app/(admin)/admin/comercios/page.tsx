import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Store, MapPin, CheckCircle2, AlertCircle, Camera } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoComercio } from '@/types'
import { ValidarToggleBtn } from './validar-toggle-btn'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TIPO_COLOR: Record<TipoComercio, string> = {
  autoservicio: 'bg-blue-100 text-blue-700',
  almacen:      'bg-purple-100 text-purple-700',
  kiosco:       'bg-pink-100 text-pink-700',
  mayorista:    'bg-gondo-indigo-50 text-gondo-indigo-600',
  otro:         'bg-gray-100 text-gray-600',
}

const TIPO_LABEL: Record<TipoComercio, string> = {
  autoservicio: 'Autoservicio',
  almacen:      'Almacén',
  kiosco:       'Kiosco',
  mayorista:    'Mayorista',
  otro:         'Otro',
}

export default async function ComerciosAdminPage({
  searchParams,
}: {
  searchParams: { validado?: string }
}) {
  const admin = adminClient()
  const filtroValidado = searchParams.validado ?? 'todos'

  let query = admin
    .from('comercios')
    .select(`
      id, nombre, direccion, tipo, validado, created_at,
      registrado_por, foto_fachada_url,
      registrador:profiles!registrado_por(nombre, tipo_actor)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filtroValidado === 'validado') query = query.eq('validado', true)
  if (filtroValidado === 'sin_validar') query = query.eq('validado', false)

  const { data: comerciosRaw } = await query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comercios = ((comerciosRaw ?? []) as any[]).map(c => ({
    ...c,
    registrador_nombre: Array.isArray(c.registrador) ? c.registrador[0]?.nombre : c.registrador?.nombre,
    registrador_tipo:   Array.isArray(c.registrador) ? c.registrador[0]?.tipo_actor : c.registrador?.tipo_actor,
  }))

  // Generar signed URLs para fotos de fachada
  const fachadasSignedMap: Record<string, string> = {}
  const conFachada = comercios.filter((c: { foto_fachada_url: string | null }) => c.foto_fachada_url)
  if (conFachada.length > 0) {
    await Promise.all(
      conFachada.map(async (c: { id: string; foto_fachada_url: string }) => {
        const { data } = await admin.storage
          .from('fotos-fachada')
          .createSignedUrl(c.foto_fachada_url, 3600)
        if (data?.signedUrl) fachadasSignedMap[c.id] = data.signedUrl
      })
    )
  }

  const validados  = comercios.filter(c => c.validado).length
  const sinValidar = comercios.length - validados

  const FILTROS = [
    { value: 'todos',      label: `Todos (${comercios.length})` },
    { value: 'validado',   label: `Validados (${validados})` },
    { value: 'sin_validar',label: `Sin validar (${sinValidar})` },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Comercios</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {comercios.length} comercios · {validados} validados · {sinValidar} sin validar
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <a
            key={f.value}
            href={`/admin/comercios${f.value !== 'todos' ? `?validado=${f.value}` : ''}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtroValidado === f.value
                ? 'bg-[#1E1B4B] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Comercio', 'Tipo', 'Registrado por', 'Registro', 'Estado'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {comercios.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      {/* Thumbnail de fachada */}
                      {fachadasSignedMap[c.id] ? (
                        <a
                          href={fachadasSignedMap[c.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 mt-0.5"
                          title="Ver foto de fachada"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={fachadasSignedMap[c.id]}
                            alt={`Fachada de ${c.nombre}`}
                            className="w-9 h-9 rounded-lg object-cover border border-gray-200 hover:border-[#1E1B4B] transition-colors"
                          />
                        </a>
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Camera size={13} className="text-gray-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">{c.nombre}</p>
                        {c.direccion && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={10} className="text-gray-400 shrink-0" />
                            <p className="text-[11px] text-gray-400 truncate max-w-[160px]">{c.direccion}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo as TipoComercio] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPO_LABEL[c.tipo as TipoComercio] ?? c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {c.registrador_nombre ?? '—'}
                    {c.registrador_tipo && (
                      <span className="block text-[10px] text-gray-400">{c.registrador_tipo}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                    {tiempoRelativo(c.created_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      {c.validado ? (
                        <div className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 size={14} />
                          <span className="text-xs font-medium">Validado</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-500">
                          <AlertCircle size={14} />
                          <span className="text-xs font-medium">Sin validar</span>
                        </div>
                      )}
                      <ValidarToggleBtn comercioId={c.id} validado={c.validado} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {comercios.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-12">Sin comercios</p>
          )}
        </div>
      </div>
    </div>
  )
}
