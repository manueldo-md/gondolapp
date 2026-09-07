-- Tabla de relaciones marca ↔ distribuidora
CREATE TABLE IF NOT EXISTS marca_distri_relaciones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  marca_id uuid NOT NULL REFERENCES marcas ON DELETE CASCADE,
  distri_id uuid NOT NULL REFERENCES distribuidoras ON DELETE CASCADE,
  estado text DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'activa', 'pausada', 'terminada')),
  iniciado_por text CHECK (iniciado_por IN ('marca', 'distri')),
  acepto_tyc_marca boolean DEFAULT false,
  acepto_tyc_distri boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (marca_id, distri_id)
);

-- Tabla de tokens de invitación marca ↔ distribuidora
CREATE TABLE IF NOT EXISTS marca_distri_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  token text UNIQUE NOT NULL,
  iniciado_por text NOT NULL CHECK (iniciado_por IN ('marca', 'distri')),
  marca_id uuid REFERENCES marcas ON DELETE CASCADE,
  distri_id uuid REFERENCES distribuidoras ON DELETE CASCADE,
  usado boolean DEFAULT false,
  expira_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE marca_distri_relaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE marca_distri_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas para marca_distri_relaciones
CREATE POLICY "marca_ve_sus_relaciones" ON marca_distri_relaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND marca_id = marca_distri_relaciones.marca_id)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND distri_id = marca_distri_relaciones.distri_id)
  );

CREATE POLICY "admin_gestiona_relaciones" ON marca_distri_relaciones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin')
  );

-- Políticas para marca_distri_tokens
CREATE POLICY "admin_gestiona_tokens_marca_distri" ON marca_distri_tokens
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin')
  );

CREATE POLICY "token_publico_lectura" ON marca_distri_tokens
  FOR SELECT USING (true);
