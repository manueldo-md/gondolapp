/**
 * components/campanas/CoberturaSeguimiento.tsx
 * El dashboard de cobertura de las campañas de seguimiento.
 *
 * Componente Server, montado por ResultadosView y por lo tanto visible en los
 * cuatro paneles: distribuidora, repositora, marca y admin. Quién lo ve es una
 * pregunta que el proyecto ya resolvió — cada `resultados/page.tsx` tiene su
 * propio control de acceso.
 *
 * ── SOLO EN SEGUIMIENTO ─────────────────────────────────────────────────────
 * En una campaña puntual no se renderiza nada: no hay frecuencia que medir, y
 * una tabla de cobertura con una sola visita esperada por comercio sería ruido.
 *
 * ── LA MARCA NO VE QUIÉN ────────────────────────────────────────────────────
 * `verAgente` viene del tema del panel y es `false` para marca. No es cosmética:
 * la marca ve el DATO, no la identidad del gondolero. Ver CLAUDE.md §18,
 * "Privacidad y anonimato en el ecosistema". El resto de la fila se muestra
 * igual — la cobertura es lo que compró.
 */

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import {
  calcularCobertura, calcularHistorico, etiquetaUltimaVisita,
  type EstadoCobertura, type VisitaMision,
} from '@/lib/cobertura-seguimiento'
import { rutaEvidencia } from '@/lib/linea-comercio'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "21 al 27 de septiembre". Sin `Date`: son días `'YYYY-MM-DD'` sin zona. */
function rangoSemana(lunes: string, domingo: string): string {
  const [, mL, dL] = lunes.split('-').map(Number)
  const [, mD, dD] = domingo.split('-').map(Number)
  return mL === mD
    ? `${dL} al ${dD} de ${MESES[mD - 1]}`
    : `${dL} de ${MESES[mL - 1]} al ${dD} de ${MESES[mD - 1]}`
}

const ESTILO: Record<EstadoCobertura, { chip: string; texto: string; Icono: typeof CheckCircle2 }> = {
  al_dia:   { chip: 'bg-green-50 text-green-700 border-green-200', texto: 'al día',   Icono: CheckCircle2 },
  va_bien:  { chip: 'bg-gray-50 text-gray-500 border-gray-200',    texto: 'va bien',  Icono: Clock },
  atrasado: { chip: 'bg-rose-50 text-rose-700 border-rose-200',    texto: 'atrasado', Icono: AlertTriangle },
}

export interface CoberturaSeguimientoProps {
  misiones: VisitaMision[]
  nombresComercio: Map<string, string>
  aliasGondolero: Map<string, string>
  visitasPorSemana: number
  fechaInicio?: string | null
  /** Del tema del panel. `false` en marca. */
  verAgente: boolean
  /** Clases de la barra, para que combine con el panel. */
  colorBarra: string
  /**
   * Con qué armar el link a la evidencia de cada comercio, o nada.
   *
   * Los CUATRO paneles montan esta tabla y solo dos tienen la pantalla de
   * evidencia, así que `rutaEvidencia` devuelve null en admin y repositora y
   * el nombre queda como texto. Un link que lleva a un 404 es peor que ninguno.
   */
  evidencia?: { panel: string; alcance?: string | null; campanaId?: string | null } | null
}

export function CoberturaSeguimiento({
  misiones, nombresComercio, aliasGondolero,
  visitasPorSemana, fechaInicio, verAgente, colorBarra, evidencia,
}: CoberturaSeguimientoProps) {
  if (!visitasPorSemana || visitasPorSemana <= 0) return null

  const c = calcularCobertura({ misiones, nombresComercio, visitasPorSemana, fechaInicio })
  if (c.comercios.length === 0) return null

  // `rutaEvidencia` devuelve null en admin y repositora, así que ahí el nombre
  // queda como texto: esas pantallas no existen para esos paneles.
  const hrefDe = (comercioId: string) =>
    evidencia
      ? rutaEvidencia({ ...evidencia, comercioId })
      : null

  const historico = new Map(
    calcularHistorico({ misiones, nombresComercio, visitasPorSemana, fechaInicio, semanas: 8 })
      .map(h => [h.comercioId, h.semanas]),
  )

  const pct = c.metaSemana > 0 ? Math.round((c.visitasHechas / c.metaSemana) * 100) : 0
  // Dónde cae lo esperado HOY sobre la barra de la semana completa. Es lo que
  // convierte la barra en un semáforo sin necesidad de un segundo número.
  const marcaHoy = c.metaSemana > 0 ? Math.min(100, (c.esperadasHoy / c.metaSemana) * 100) : 0
  const atrasados = c.comercios.filter(x => x.estado === 'atrasado').length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">

      {/* ── Cabecera de la semana ──────────────────────────────────────────── */}
      <div className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1 mb-1">
        <h3 className="text-sm font-bold text-gray-900">
          Cobertura · semana del {rangoSemana(c.semana.lunes, c.semana.domingo)}
        </h3>
        <span className="text-xs text-gray-400">
          {visitasPorSemana} {visitasPorSemana === 1 ? 'visita' : 'visitas'} por semana · {c.comercios.length} comercios
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-2xl font-bold tabular-nums text-gray-900">{c.visitasHechas}</span>
        {/* La meta de la SEMANA COMPLETA va al lado del número, no en lugar de
            él: si solo se mostrara lo esperado a hoy, un lunes diría "0 de 0" y
            parecería que la meta bajó. */}
        <span className="text-sm text-gray-400">de {c.metaSemana} visitas de la semana</span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-gray-500">{pct}%</span>
      </div>

      {/* Barra con la marca del prorrateo */}
      <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className={`h-full ${colorBarra} rounded-full transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
        {marcaHoy > 0 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" style={{ left: `${marcaHoy}%` }} />
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {c.esperadasHoy > 0
          ? <>Esperadas a esta altura de la semana: <span className="font-semibold text-gray-500 tabular-nums">{c.esperadasHoy}</span></>
          : 'La semana recién empieza: todavía no hay visitas esperadas.'}
        {c.enCurso && ' · la semana sigue abierta'}
      </p>

      {/* ── El universo, dicho de frente ───────────────────────────────────────
          Un porcentaje de cobertura sobre un universo que se define solo con los
          comercios visitados es un número que miente sin equivocarse. Todavía no
          existe asignación de comercios, así que esto no se puede resolver — se
          declara. */}
      <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 mb-3 leading-relaxed">
        Los comercios de esta campaña son los que tuvieron al menos una visita.
        Todavía no hay asignación previa, así que un comercio que nadie visitó nunca no aparece acá.
      </p>

      {/* ── Tabla por comercio ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium pb-2">Comercio</th>
              <th className="text-center font-medium pb-2 whitespace-nowrap">Esta semana</th>
              <th className="text-left font-medium pb-2 pl-3 whitespace-nowrap">Últimas 8 semanas</th>
              <th className="text-right font-medium pb-2 whitespace-nowrap">Última visita</th>
            </tr>
          </thead>
          <tbody>
            {c.comercios.map(x => {
              const e = ESTILO[x.estado]
              const quienes = verAgente
                ? x.gondoleroIds.map(g => aliasGondolero.get(g)).filter(Boolean)
                : []
              return (
                <tr key={x.comercioId} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="py-2.5 pr-2">
                    {/* El nombre lleva a la evidencia de ese comercio. Esta
                        tabla dice CUÁNTAS veces se fue y la otra pantalla dice
                        CÓMO quedó la góndola: es la pregunta que sigue después
                        de ver un comercio en rojo. */}
                    {hrefDe(x.comercioId)
                      ? (
                        <a
                          href={hrefDe(x.comercioId) as string}
                          className="text-gray-800 leading-tight hover:text-gondo-amber-600 hover:underline"
                          title={`Ver la evolución de ${x.nombre}`}
                        >
                          {x.nombre}
                        </a>
                      )
                      : <p className="text-gray-800 leading-tight">{x.nombre}</p>}
                    {/* El gondolero va acá, en el detalle de la fila, y no como
                        columna: un comercio puede tener dos personas distintas
                        en la misma semana, así que "el gondolero del comercio"
                        no existe. */}
                    {quienes.length > 0 && (
                      <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{quienes.join(', ')}</p>
                    )}
                  </td>
                  <td className="py-2.5 text-center whitespace-nowrap">
                    <span className="tabular-nums text-gray-700">{x.visitas}</span>
                    <span className="text-gray-300"> / {visitasPorSemana}</span>
                    <span className={`ml-2 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${e.chip}`}>
                      <e.Icono size={10} />{e.texto}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3">
                    <TiraHistorica semanas={historico.get(x.comercioId) ?? []} meta={visitasPorSemana} />
                  </td>
                  <td className="py-2.5 text-right text-gray-500 whitespace-nowrap">
                    {etiquetaUltimaVisita(x.ultimaVisita, x.diasSinVisita)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {atrasados > 0 && (
        <p className="text-xs text-rose-600 mt-3 font-medium">
          {atrasados === 1
            ? '1 comercio está por debajo de lo esperado para esta altura de la semana.'
            : `${atrasados} comercios están por debajo de lo esperado para esta altura de la semana.`}
        </p>
      )}
    </div>
  )
}

// ── Tira histórica ───────────────────────────────────────────────────────────

/**
 * Las últimas 8 semanas, de la más vieja a la más nueva.
 *
 * Un número de la semana no muestra el patrón, y el patrón es la inteligencia:
 * *"se cubrió bien en marzo y se abandonó en abril"* es lo que una distribuidora
 * mira para decidir si renueva.
 *
 * **Cuatro estados visuales y no dos.** Una semana EN CURSO con 1 de 2 no
 * incumplió —le quedan días— y una anterior al arranque de la campaña no es una
 * falla sino un vacío. Pintar las cuatro igual mostraría rojo donde no hubo
 * nada que fallar.
 */
function TiraHistorica({
  semanas, meta,
}: {
  semanas: { lunes: string; visitas: number; cumplio: boolean; enCurso: boolean; antesDeEmpezar: boolean }[]
  meta: number
}) {
  if (semanas.length === 0) return null
  return (
    <div className="flex items-end gap-[3px]" aria-hidden={false}>
      {semanas.map(s => {
        const titulo = s.antesDeEmpezar
          ? `Semana del ${s.lunes}: la campaña no había empezado`
          : `Semana del ${s.lunes}: ${s.visitas} de ${meta}${s.enCurso ? ' (en curso)' : ''}`
        const clase = s.antesDeEmpezar ? 'bg-gray-100'
          : s.enCurso                  ? 'bg-amber-300'
          : s.cumplio                  ? 'bg-green-400'
          : s.visitas > 0              ? 'bg-amber-200'
          : 'bg-rose-300'
        // La altura muestra cuánto se hizo; el color, si alcanzó. Un mínimo de
        // 25% para que una semana en cero siga siendo visible: un hueco no se
        // distingue de "no hay datos".
        const alto = s.antesDeEmpezar ? 25 : Math.max(25, Math.min(100, (s.visitas / Math.max(1, meta)) * 100))
        return (
          <span key={s.lunes} title={titulo} className="w-2 h-5 flex items-end">
            <span className={`w-full rounded-sm ${clase}`} style={{ height: `${alto}%` }} />
          </span>
        )
      })}
    </div>
  )
}
