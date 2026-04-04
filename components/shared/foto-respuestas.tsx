export interface RespuestaItem {
  pregunta: string
  tipo: string
  valor: unknown
}

function formatearValor(tipo: string, valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  if (tipo === 'binaria') return valor ? 'Sí' : 'No'
  if (Array.isArray(valor)) return valor.join(', ')
  return String(valor)
}

export function FotoRespuestas({ respuestas }: { respuestas: RespuestaItem[] }) {
  if (!respuestas || respuestas.length === 0) return null

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
        Respuestas del formulario
      </p>
      <div className="space-y-1">
        {respuestas.map((r, i) => (
          <div key={i} className="text-xs">
            <span className="text-gray-500 font-medium">{r.pregunta}: </span>
            <span className="text-gray-800">{formatearValor(r.tipo, r.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
