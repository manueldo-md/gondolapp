-- =============================================================================
-- GondolApp — Migración inicial
-- Archivo: supabase/migrations/001_initial_schema.sql
-- Ejecutar en orden en el editor SQL de Supabase
-- =============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- Para cálculos geoespaciales en V2

-- =============================================================================
-- TABLAS BASE
-- =============================================================================

-- Zonas geográficas
CREATE TABLE zonas (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('ciudad', 'provincia', 'region')),
  lat         decimal(10,8),
  lng         decimal(11,8),
  created_at  timestamptz DEFAULT now()
);

-- Distribuidoras
CREATE TABLE distribuidoras (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  razon_social        text NOT NULL,
  cuit                text UNIQUE,
  tokens_disponibles  integer DEFAULT 0 CHECK (tokens_disponibles >= 0),
  validada            boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Marcas
CREATE TABLE marcas (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  razon_social        text NOT NULL,
  cuit                text UNIQUE,
  tokens_disponibles  integer DEFAULT 0 CHECK (tokens_disponibles >= 0),
  fondo_resguardo     integer DEFAULT 0 CHECK (fondo_resguardo >= 0),
  validada            boolean DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Perfiles — extiende auth.users de Supabase
CREATE TABLE profiles (
  id                      uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  tipo_actor              text NOT NULL CHECK (tipo_actor IN (
                            'gondolero', 'fixer', 'distribuidora', 'marca', 'admin'
                          )),
  nombre                  text,
  alias                   text,             -- "Agustín R." para gondoleros
  celular                 text,
  nivel                   text DEFAULT 'casual' CHECK (nivel IN ('casual', 'activo', 'pro')),
  puntos_disponibles      integer DEFAULT 0 CHECK (puntos_disponibles >= 0),
  puntos_totales_ganados  integer DEFAULT 0,
  distri_id               uuid REFERENCES distribuidoras,
  marca_id                uuid REFERENCES marcas,
  monotributo_verificado  boolean DEFAULT false,
  fotos_aprobadas         integer DEFAULT 0,
  tasa_aprobacion         decimal(5,2) DEFAULT 100.00,
  activo                  boolean DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Zonas del gondolero (relación muchos a muchos)
CREATE TABLE gondolero_zonas (
  gondolero_id  uuid REFERENCES profiles ON DELETE CASCADE,
  zona_id       uuid REFERENCES zonas ON DELETE CASCADE,
  PRIMARY KEY (gondolero_id, zona_id)
);

-- =============================================================================
-- COMERCIOS
-- =============================================================================

CREATE TABLE comercios (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre          text NOT NULL,
  direccion       text,
  lat             decimal(10,8) NOT NULL,
  lng             decimal(11,8) NOT NULL,
  tipo            text DEFAULT 'almacen' CHECK (tipo IN (
                    'autoservicio', 'almacen', 'kiosco', 'mayorista', 'otro'
                  )),
  foto_fachada_url text,
  validado        boolean DEFAULT false,
  zona_id         uuid REFERENCES zonas,
  registrado_por  uuid REFERENCES profiles,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Índice para búsquedas geoespaciales
CREATE INDEX idx_comercios_lat_lng ON comercios (lat, lng);

-- =============================================================================
-- CAMPAÑAS
-- =============================================================================

CREATE TABLE campanas (
  id                            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre                        text NOT NULL,
  tipo                          text NOT NULL CHECK (tipo IN (
                                  'relevamiento', 'precio', 'cobertura',
                                  'pop', 'mapa', 'comercios', 'interna'
                                )),
  marca_id                      uuid REFERENCES marcas,
  distri_id                     uuid REFERENCES distribuidoras,
  financiada_por                text DEFAULT 'marca' CHECK (financiada_por IN (
                                  'marca', 'distri', 'gondolapp'
                                )),
  estado                        text DEFAULT 'borrador' CHECK (estado IN (
                                  'borrador', 'pendiente_aprobacion', 'activa',
                                  'pausada', 'cerrada', 'cancelada'
                                )),
  fecha_inicio                  date,
  fecha_fin                     date,
  fecha_limite_inscripcion      date,
  objetivo_comercios            integer,
  max_comercios_por_gondolero   integer DEFAULT 20,
  min_comercios_para_cobrar     integer DEFAULT 3,
  tope_total_comercios          integer,
  es_abierta                    boolean DEFAULT false,
  puntos_por_foto               integer DEFAULT 0,
  instruccion                   text,
  tokens_creacion               integer DEFAULT 15,
  presupuesto_tokens            integer DEFAULT 0,
  fondo_resguardo_tokens        integer DEFAULT 0,
  comercios_relevados           integer DEFAULT 0,
  fotos_recibidas               integer DEFAULT 0,
  created_at                    timestamptz DEFAULT now(),
  updated_at                    timestamptz DEFAULT now()
);

-- Bloques de foto por campaña (instrucciones de captura específicas)
CREATE TABLE bloques_foto (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      uuid NOT NULL REFERENCES campanas ON DELETE CASCADE,
  orden           integer NOT NULL DEFAULT 1,
  instruccion     text NOT NULL,
  tipo_contenido  text DEFAULT 'propios' CHECK (tipo_contenido IN (
                    'propios', 'competencia', 'ambos'
                  ))
);

-- Zonas de la campaña
CREATE TABLE campana_zonas (
  campana_id  uuid REFERENCES campanas ON DELETE CASCADE,
  zona_id     uuid REFERENCES zonas ON DELETE CASCADE,
  PRIMARY KEY (campana_id, zona_id)
);

-- Participaciones de gondoleros en campañas
CREATE TABLE participaciones (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id            uuid NOT NULL REFERENCES campanas ON DELETE CASCADE,
  gondolero_id          uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  estado                text DEFAULT 'activa' CHECK (estado IN (
                          'activa', 'completada', 'abandonada'
                        )),
  comercios_completados integer DEFAULT 0,
  puntos_acumulados     integer DEFAULT 0,
  joined_at             timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (campana_id, gondolero_id)
);

-- =============================================================================
-- FOTOS
-- =============================================================================

CREATE TABLE fotos (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id            uuid NOT NULL REFERENCES campanas,
  bloque_id             uuid NOT NULL REFERENCES bloques_foto,
  gondolero_id          uuid NOT NULL REFERENCES profiles,
  comercio_id           uuid NOT NULL REFERENCES comercios,
  url                   text NOT NULL,
  storage_path          text NOT NULL,   -- path en Supabase Storage
  lat                   decimal(10,8) NOT NULL,
  lng                   decimal(11,8) NOT NULL,
  timestamp_dispositivo timestamptz,
  device_id             text,
  declaracion           text NOT NULL CHECK (declaracion IN (
                          'producto_presente', 'producto_no_encontrado',
                          'solo_competencia'
                        )),
  precio_detectado      decimal(10,2),
  precio_confirmado     decimal(10,2),
  estado                text DEFAULT 'pendiente' CHECK (estado IN (
                          'pendiente', 'aprobada', 'rechazada', 'en_revision'
                        )),
  motivo_rechazo        text,
  puntos_otorgados      integer DEFAULT 0,
  ia_confianza          decimal(5,4),
  ia_procesada          boolean DEFAULT false,
  es_antes              boolean DEFAULT false,    -- Para fixers
  par_foto_id           uuid REFERENCES fotos,   -- Para fixers: referencia al par
  blur_score            decimal(10,4),            -- Varianza de Laplaciano
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX idx_fotos_campana ON fotos (campana_id);
CREATE INDEX idx_fotos_gondolero ON fotos (gondolero_id);
CREATE INDEX idx_fotos_estado ON fotos (estado);
CREATE INDEX idx_fotos_comercio ON fotos (comercio_id);

-- =============================================================================
-- ECONOMÍA
-- =============================================================================

-- Movimientos de puntos de gondoleros
CREATE TABLE movimientos_puntos (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gondolero_id  uuid NOT NULL REFERENCES profiles,
  tipo          text NOT NULL CHECK (tipo IN ('credito', 'debito')),
  monto         integer NOT NULL CHECK (monto > 0),
  concepto      text NOT NULL,
  campana_id    uuid REFERENCES campanas,
  foto_id       uuid REFERENCES fotos,
  created_at    timestamptz DEFAULT now()
);

-- Canjes de gondoleros
CREATE TABLE canjes (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gondolero_id      uuid NOT NULL REFERENCES profiles,
  premio            text NOT NULL CHECK (premio IN (
                      'nafta_ypf', 'giftcard_ml', 'credito_celular', 'transferencia'
                    )),
  puntos            integer NOT NULL CHECK (puntos > 0),
  estado            text DEFAULT 'pendiente' CHECK (estado IN (
                      'pendiente', 'procesado', 'entregado', 'fallido'
                    )),
  codigo_entregado  text,
  procesado_por     uuid REFERENCES profiles,   -- admin que lo procesó
  created_at        timestamptz DEFAULT now(),
  procesado_at      timestamptz
);

-- Movimientos de tokens (marcas y distribuidoras)
CREATE TABLE movimientos_tokens (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    uuid NOT NULL,                -- ID de la marca o distri
  actor_tipo  text NOT NULL CHECK (actor_tipo IN ('marca', 'distribuidora')),
  tipo        text NOT NULL CHECK (tipo IN (
                'compra', 'consumo', 'bloqueo', 'liberacion', 'devolucion'
              )),
  monto       integer NOT NULL,
  concepto    text NOT NULL,
  campana_id  uuid REFERENCES campanas,
  created_at  timestamptz DEFAULT now()
);

-- =============================================================================
-- MENSAJERÍA
-- =============================================================================

CREATE TABLE mensajes_campana (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campana_id      uuid NOT NULL REFERENCES campanas ON DELETE CASCADE,
  remitente_id    uuid NOT NULL REFERENCES profiles,
  remitente_tipo  text NOT NULL CHECK (remitente_tipo IN ('marca', 'distribuidora')),
  tipo            text NOT NULL CHECK (tipo IN ('broadcast', 'pregunta', 'respuesta')),
  contenido       text NOT NULL,
  publicado       boolean DEFAULT false,       -- Para Q&A: si se publicó para todos
  pregunta_id     uuid REFERENCES mensajes_campana,
  created_at      timestamptz DEFAULT now()
);

-- =============================================================================
-- TRIGGERS — actualizar updated_at automáticamente
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_distribuidoras
  BEFORE UPDATE ON distribuidoras
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_marcas
  BEFORE UPDATE ON marcas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_comercios
  BEFORE UPDATE ON comercios
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_campanas
  BEFORE UPDATE ON campanas
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_fotos
  BEFORE UPDATE ON fotos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TRIGGER — crear perfil automáticamente al registrarse
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tipo_actor, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'tipo_actor', 'gondolero'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================================
-- TRIGGER — actualizar puntos del gondolero al insertar movimiento
-- =============================================================================

CREATE OR REPLACE FUNCTION update_gondolero_puntos()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'credito' THEN
    UPDATE profiles
    SET
      puntos_disponibles = puntos_disponibles + NEW.monto,
      puntos_totales_ganados = puntos_totales_ganados + NEW.monto
    WHERE id = NEW.gondolero_id;
  ELSIF NEW.tipo = 'debito' THEN
    UPDATE profiles
    SET puntos_disponibles = GREATEST(0, puntos_disponibles - NEW.monto)
    WHERE id = NEW.gondolero_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_movimiento_puntos
  AFTER INSERT ON movimientos_puntos
  FOR EACH ROW EXECUTE FUNCTION update_gondolero_puntos();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribuidoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
ALTER TABLE zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercios ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloques_foto ENABLE ROW LEVEL SECURITY;
ALTER TABLE campana_zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE participaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_puntos ENABLE ROW LEVEL SECURITY;
ALTER TABLE canjes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes_campana ENABLE ROW LEVEL SECURITY;
ALTER TABLE gondolero_zonas ENABLE ROW LEVEL SECURITY;

-- ── HELPER: obtener tipo de actor del usuario actual ──────────────────────
CREATE OR REPLACE FUNCTION get_tipo_actor()
RETURNS text AS $$
  SELECT tipo_actor FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_distri_id()
RETURNS uuid AS $$
  SELECT distri_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_marca_id()
RETURNS uuid AS $$
  SELECT marca_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── PROFILES ──────────────────────────────────────────────────────────────
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR
    get_tipo_actor() = 'admin'
  );

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ── ZONAS ─────────────────────────────────────────────────────────────────
CREATE POLICY "zonas_select" ON zonas
  FOR SELECT USING (true);

CREATE POLICY "zonas_admin_all" ON zonas
  FOR ALL USING (get_tipo_actor() = 'admin');

-- ── DISTRIBUIDORAS ────────────────────────────────────────────────────────
CREATE POLICY "distribuidoras_select_own" ON distribuidoras
  FOR SELECT USING (
    id = get_distri_id() OR
    get_tipo_actor() = 'admin'
  );

-- ── MARCAS ────────────────────────────────────────────────────────────────
CREATE POLICY "marcas_select_own" ON marcas
  FOR SELECT USING (
    id = get_marca_id() OR
    get_tipo_actor() = 'admin'
  );

-- ── COMERCIOS ─────────────────────────────────────────────────────────────
CREATE POLICY "comercios_select" ON comercios
  FOR SELECT USING (
    get_tipo_actor() IN ('gondolero', 'fixer', 'admin') OR
    get_tipo_actor() = 'distribuidora'
  );

CREATE POLICY "comercios_insert" ON comercios
  FOR INSERT WITH CHECK (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    registrado_por = auth.uid()
  );

-- ── CAMPAÑAS ──────────────────────────────────────────────────────────────
CREATE POLICY "campanas_select_gondolero" ON campanas
  FOR SELECT USING (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    estado = 'activa'
  );

CREATE POLICY "campanas_select_distri" ON campanas
  FOR SELECT USING (
    get_tipo_actor() = 'distribuidora' AND
    distri_id = get_distri_id()
  );

CREATE POLICY "campanas_select_marca" ON campanas
  FOR SELECT USING (
    get_tipo_actor() = 'marca' AND
    marca_id = get_marca_id()
  );

CREATE POLICY "campanas_admin" ON campanas
  FOR ALL USING (get_tipo_actor() = 'admin');

CREATE POLICY "campanas_insert_marca" ON campanas
  FOR INSERT WITH CHECK (
    get_tipo_actor() = 'marca' AND
    marca_id = get_marca_id()
  );

-- ── FOTOS ─────────────────────────────────────────────────────────────────
CREATE POLICY "fotos_select_gondolero" ON fotos
  FOR SELECT USING (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    gondolero_id = auth.uid()
  );

CREATE POLICY "fotos_insert_gondolero" ON fotos
  FOR INSERT WITH CHECK (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    gondolero_id = auth.uid()
  );

CREATE POLICY "fotos_select_distri" ON fotos
  FOR SELECT USING (
    get_tipo_actor() = 'distribuidora' AND
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = fotos.campana_id
      AND c.distri_id = get_distri_id()
    )
  );

CREATE POLICY "fotos_select_marca" ON fotos
  FOR SELECT USING (
    get_tipo_actor() = 'marca' AND
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = fotos.campana_id
      AND c.marca_id = get_marca_id()
    )
  );

CREATE POLICY "fotos_update_distri_marca" ON fotos
  FOR UPDATE USING (
    (get_tipo_actor() = 'distribuidora' AND
      EXISTS (
        SELECT 1 FROM campanas c
        WHERE c.id = fotos.campana_id
        AND c.distri_id = get_distri_id()
      )
    ) OR
    (get_tipo_actor() = 'marca' AND
      EXISTS (
        SELECT 1 FROM campanas c
        WHERE c.id = fotos.campana_id
        AND c.marca_id = get_marca_id()
      )
    ) OR
    get_tipo_actor() = 'admin'
  );

CREATE POLICY "fotos_admin" ON fotos
  FOR ALL USING (get_tipo_actor() = 'admin');

-- ── PARTICIPACIONES ───────────────────────────────────────────────────────
CREATE POLICY "participaciones_select" ON participaciones
  FOR SELECT USING (
    gondolero_id = auth.uid() OR
    get_tipo_actor() IN ('distribuidora', 'marca', 'admin')
  );

CREATE POLICY "participaciones_insert" ON participaciones
  FOR INSERT WITH CHECK (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    gondolero_id = auth.uid()
  );

-- ── PUNTOS Y CANJES ───────────────────────────────────────────────────────
CREATE POLICY "movimientos_puntos_select" ON movimientos_puntos
  FOR SELECT USING (
    gondolero_id = auth.uid() OR
    get_tipo_actor() = 'admin'
  );

CREATE POLICY "canjes_select" ON canjes
  FOR SELECT USING (
    gondolero_id = auth.uid() OR
    get_tipo_actor() = 'admin'
  );

CREATE POLICY "canjes_insert" ON canjes
  FOR INSERT WITH CHECK (
    gondolero_id = auth.uid()
  );

CREATE POLICY "canjes_update_admin" ON canjes
  FOR UPDATE USING (get_tipo_actor() = 'admin');

-- ── MENSAJERÍA ────────────────────────────────────────────────────────────
CREATE POLICY "mensajes_select" ON mensajes_campana
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM participaciones p
      WHERE p.campana_id = mensajes_campana.campana_id
      AND p.gondolero_id = auth.uid()
    ) OR
    (get_tipo_actor() = 'marca' AND
      EXISTS (SELECT 1 FROM campanas c WHERE c.id = campana_id AND c.marca_id = get_marca_id())
    ) OR
    (get_tipo_actor() = 'distribuidora' AND
      EXISTS (SELECT 1 FROM campanas c WHERE c.id = campana_id AND c.distri_id = get_distri_id())
    ) OR
    get_tipo_actor() = 'admin'
  );

-- =============================================================================
-- DATOS INICIALES — Zonas del piloto
-- =============================================================================

INSERT INTO zonas (nombre, tipo, lat, lng) VALUES
  ('Entre Ríos', 'provincia', -31.7746, -60.4957),
  ('Concordia', 'ciudad', -31.3933, -58.0209),
  ('Colón', 'ciudad', -32.2257, -58.1445),
  ('Concepción del Uruguay', 'ciudad', -32.4841, -58.2371),
  ('Gualeguaychú', 'ciudad', -33.0134, -59.0310),
  ('Paraná', 'ciudad', -31.7333, -60.5333),
  ('Santa Fe', 'provincia', -31.6333, -60.7000),
  ('Santa Fe capital', 'ciudad', -31.6333, -60.7000);

-- =============================================================================
-- FIN DE LA MIGRACIÓN INICIAL
-- =============================================================================
