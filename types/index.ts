// ── TIPOS GLOBALES DEL DOMINIO DE GONDOLAPP ──────────────────────────────────

// Umbral de nitidez para blur detection (varianza del Laplaciano)
export const BLUR_THRESHOLD = 800

export type TipoActor = 'gondolero' | 'fixer' | 'distribuidora' | 'marca' | 'admin'

export type NivelGondolero = 'casual' | 'activo' | 'pro'

export type TipoCampana =
  | 'relevamiento'
  | 'precio'
  | 'cobertura'
  | 'pop'
  | 'mapa'
  | 'comercios'
  | 'interna'

export type EstadoCampana =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'activa'
  | 'pausada'
  | 'cerrada'
  | 'cancelada'
  | 'pendiente_cambios'

export type EstadoFoto =
  | 'pendiente'
  | 'aprobada'
  | 'rechazada'
  | 'en_revision'

export type DeclaracionFoto =
  | 'producto_presente'
  | 'producto_no_encontrado'
  | 'solo_competencia'

export type TipoComercio =
  | 'autoservicio'
  | 'almacen'
  | 'kiosco'
  | 'mayorista'
  | 'dietetica'
  | 'otro'

export type TipoPremio =
  | 'nafta_ypf'
  | 'giftcard_ml'
  | 'credito_celular'
  | 'transferencia'

export type EstadoCanje =
  | 'pendiente'
  | 'procesado'
  | 'entregado'
  | 'fallido'

export type FinanciadaPor = 'marca' | 'distri' | 'gondolapp'

export type TipoContenidoBloque = 'propios' | 'competencia' | 'ambos' | 'ninguno'

// ── INTERFACES DE DOMINIO ─────────────────────────────────────────────────────

export interface Profile {
  id: string
  tipo_actor: TipoActor
  nombre: string | null
  alias: string | null
  celular: string | null
  nivel: NivelGondolero
  puntos_disponibles: number
  puntos_totales_ganados: number
  distri_id: string | null
  marca_id: string | null
  monotributo_verificado: boolean
  fotos_aprobadas: number
  tasa_aprobacion: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Distribuidora {
  id: string
  razon_social: string
  cuit: string | null
  tokens_disponibles: number
  validada: boolean
  created_at: string
}

export interface Marca {
  id: string
  razon_social: string
  cuit: string | null
  tokens_disponibles: number
  fondo_resguardo: number
  validada: boolean
  created_at: string
}

export interface Zona {
  id: string
  nombre: string
  tipo: 'ciudad' | 'provincia' | 'region'
  lat: number | null
  lng: number | null
}

export interface Comercio {
  id: string
  nombre: string
  direccion: string | null
  lat: number
  lng: number
  tipo: TipoComercio
  foto_fachada_url: string | null
  validado: boolean
  zona_id: string | null
  registrado_por: string | null
  created_at: string
}

export interface Campana {
  id: string
  nombre: string
  tipo: TipoCampana
  marca_id: string | null
  distri_id: string | null
  financiada_por: FinanciadaPor
  estado: EstadoCampana
  fecha_inicio: string | null
  fecha_fin: string | null
  fecha_limite_inscripcion: string | null
  objetivo_comercios: number | null
  max_comercios_por_gondolero: number
  min_comercios_para_cobrar: number
  tope_total_comercios: number | null
  es_abierta: boolean
  puntos_por_foto: number
  instruccion: string | null
  tokens_creacion: number
  presupuesto_tokens: number
  fondo_resguardo_tokens: number
  comercios_relevados: number
  fotos_recibidas: number
  created_at: string
}

export interface BloqueFoto {
  id: string
  campana_id: string
  orden: number
  instruccion: string
  tipo_contenido: TipoContenidoBloque
}

export interface Participacion {
  id: string
  campana_id: string
  gondolero_id: string
  estado: 'activa' | 'completada' | 'abandonada'
  comercios_completados: number
  puntos_acumulados: number
  joined_at: string
}

export interface Foto {
  id: string
  campana_id: string
  bloque_id: string
  gondolero_id: string
  comercio_id: string
  url: string
  storage_path: string
  lat: number
  lng: number
  timestamp_dispositivo: string | null
  device_id: string | null
  declaracion: DeclaracionFoto
  precio_detectado: number | null
  precio_confirmado: number | null
  estado: EstadoFoto
  motivo_rechazo: string | null
  puntos_otorgados: number
  ia_confianza: number | null
  ia_procesada: boolean
  es_antes: boolean
  par_foto_id: string | null
  blur_score: number | null
  created_at: string
}

export interface Canje {
  id: string
  gondolero_id: string
  premio: TipoPremio
  puntos: number
  estado: EstadoCanje
  codigo_entregado: string | null
  procesado_por: string | null
  created_at: string
  procesado_at: string | null
}
