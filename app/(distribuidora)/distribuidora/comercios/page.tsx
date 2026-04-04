import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Store, MapPin, CheckCircle2, Clock, AlertCircle, Camera } from 'lucide-react'
import { tiempoRelativo } from '@/lib/utils'
import type { TipoComercio } from '@/types'
import { ValidarBtn } from './validar-btn'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ComercioRow {
  id: string
  nombre: string
  direccion: string | null
  tipo: TipoComercio
  validado: boolean
  registrado_por: string | null
  created_at: string
  foto_fachada_url: string | null
}

interface ComercioConStats extends ComercioRow {
  ultimaVisita: string | null
  puedeValidar: boolean
  fachadaSignedUrl: string | null
}

// ── Helpers visuales ──────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoComercio, string> = {
  autoservicio: 'Autoservicio',
  almacen:      'Almacén',
  kiosco:       'Kiosco',
  mayorista:    'Mayorista',
  dietetica:    'Dietética',
  otro:         'Otro',
}

const TIPO_COLOR: Record<TipoComercio, string> = {
  autoservicio: 'bg-blue-100 text-blue-700',
  almacen:      'bg-purple-100 text-purple-700',
  kiosco:       'bg-pink-100 text-pink-700',
  mayorista:    'bg-gondo-indigo-50 text-gondo-indigo-600',
  dietetica:    'bg-green-100 text-green-700',
  otro:         'bg-gray-100 text-gray-600',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default async function ComerciosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Obtener distri_id del usuario para filtrar comercios de sus gondoleros
  const { data: profile } = await admin
    .from('profiles')
    .select('distri_id')
    .eq('id', user.id)
    .single()

  const distriId = profile?.distri_id ?? null

  // IDs de gondoleros de esta distribuidora
  let gondoleroIds: string[] = []
  if (distriId) {
    const { data: gondolerosData } = await admin
      .from('profiles')
      .select('id')
      .eq('distri_id', distriId)
      .eq('tipo_actor', 'gondolero')
    gondoleroIds = (gondolerosData ?? []).map((g: { id: string }) => g.id)
  }

  // Todos los comercios validados y sin validar
  const { data: comerciosData, error } = await admin
    .from('comercios')
    .select('id, nombre, direccion, tipo, validado, registrado_por, created_at, foto_fachada_url')
    .order('nombre', { ascending: true })
    .limit(200)

  if (error) console.error('Error fetching comercios:', error.message)

  const comercios = (comerciosData as ComercioRow[] | null) ?? []

  // Última visita por comercio (foto más reciente)
  const ids = comercios.map(c => c.id)
  let ultimaVisitaMap: Record<string, string> = {}

  if (ids.length > 0) {
    const { data: fotosData } = await admin
      .from('fotos')
      .select('comercio_id, created_at')
      .in('comercio_id', ids)
      .order('created_at', { ascending: false })

    ultimaVisitaMap = (fotosData ?? []).reduce<Record<string, string>>(
      (acc, f) => {
        if (!acc[f.comercio_id]) acc[f.comercio_id] = f.created_at
        return acc
      },
      {}
    )
  }

  // Generar signed URLs para fotos de fachada
  const fachadasSignedMap: Record<string, string> = {}
  const conFachada = comercios.filter(c => c.foto_fachada_url)
  if (conFachada.length > 0) {
    await Promise.all(
      conFachada.map(async (c) => {
        const path = c.foto_fachada_url!
        // Las fachadas subidas por gondoleros van al bucket 'fotos-gondola' bajo ruta 'fachadas/'
        const bucket = path.startsWith('fachadas/') ? 'fotos-gondola' : 'fotos-fachada'
        const { data } = await admin.storage.from(bucket).createSignedUrl(path, 3600)
        if (data?.signedUrl) fachadasSignedMap[c.id] = data.signedUrl
      })
    )
  }

  const lista: ComercioConStats[] = comercios.map(c => ({
    ...c,
    ultimaVisita:     ultimaVisitaMap[c.id] ?? null,
    puedeValidar:     !c.validado && (!c.registrado_por || gondoleroIds.includes(c.registrado_por)),
    fachadaSignedUrl: fachadasSignedMap[c.id] ?? null,
  }))

  const validados   = lista.filter(c => c.validado).length
  const sinValidar  = lista.length - validados

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Comercios</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {lista.length} comercio{lista.length !== 1 ? 's' : ''} ·{' '}
            {validados} validado{validados !== 1 ? 's' : ''} ·{' '}
            {sinValidar} sin validar
          </p>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <Store size={28} className="text-gray-300" />
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">Sin comercios registrados</h3>
          <p className="text-sm text-gray-400">
            Los comercios aparecen cuando los gondoleros los registran en campo.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Comercio
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Tipo
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Última visita
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wide">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  {/* Nombre + dirección + thumbnail fachada */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {/* Thumbnail de fachada */}
                      {c.fachadaSignedUrl ? (
                        <a
                          href={c.fachadaSignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 mt-0.5"
                          title="Ver foto de fachada"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.fachadaSignedUrl}
                            alt={`Fachada de ${c.nombre}`}
                            className="w-10 h-10 rounded-lg object-cover border border-gray-200 hover:border-gondo-verde-400 transition-colors"
                          />
                        </a>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                          <Camera size={14} className="text-gray-300" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{c.nombre}</p>
                        {c.direccion && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={11} className="text-gray-400 shrink-0" />
                            <p className="text-xs text-gray-400 truncate">{c.direccion}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-3.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPO_COLOR[c.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TIPO_LABEL[c.tipo] ?? c.tipo}
                    </span>
                  </td>

                  {/* Última visita */}
                  <td className="px-4 py-3.5">
                    {c.ultimaVisita ? (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Clock size={13} className="text-gray-400 shrink-0" />
                        <span className="text-xs">{tiempoRelativo(c.ultimaVisita)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Sin visitas</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-3.5 text-center">
                    {c.validado ? (
                      <div className="flex items-center justify-center gap-1 text-green-600">
                        <CheckCircle2 size={14} />
                        <span className="text-xs font-medium">Validado</span>
                      </div>
                    ) : c.puedeValidar ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="flex items-center gap-1 text-amber-500">
                          <AlertCircle size={12} />
                          <span className="text-[11px] font-medium">Sin validar</span>
                        </div>
                        <ValidarBtn comercioId={c.id} />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-amber-500">
                        <AlertCircle size={14} />
                        <span className="text-xs font-medium">Sin validar</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
