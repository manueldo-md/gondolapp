export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-white text-center">
      <div className="text-6xl mb-6">✈️</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-3">Sin conexión</h1>
      <p className="text-gray-500 text-sm max-w-xs mb-8">
        Abrí la app cuando tengas internet para cargar las campañas.
        Si ya tenés campañas activas, podés capturar fotos igual.
      </p>
      <a
        href="/gondolero/captura"
        className="w-full max-w-xs py-4 bg-gondo-verde-400 text-white font-bold rounded-2xl text-center block"
      >
        📷 Ir a capturar
      </a>
    </div>
  )
}
