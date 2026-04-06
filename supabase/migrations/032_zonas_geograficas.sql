-- ============================================================
-- 032 — Sistema de zonas geográficas de Argentina
-- Provincia → Departamento → Localidad (tres niveles)
-- Coexiste con el sistema anterior de zonas (UUID) — no modifica
-- las tablas zonas, gondolero_zonas ni campana_zonas existentes.
-- ============================================================

-- ── Provincias ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provincias (
  id        serial PRIMARY KEY,
  nombre    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── Departamentos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departamentos (
  id           serial PRIMARY KEY,
  nombre       text NOT NULL,
  provincia_id integer NOT NULL REFERENCES provincias(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_departamentos_provincia ON departamentos(provincia_id);

-- ── Localidades ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS localidades (
  id               serial PRIMARY KEY,
  nombre           text NOT NULL,
  departamento_id  integer NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_localidades_departamento ON localidades(departamento_id);

-- ── Gondolero ↔ Localidades ──────────────────────────────────
CREATE TABLE IF NOT EXISTS gondolero_localidades (
  gondolero_id  uuid    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  localidad_id  integer NOT NULL REFERENCES localidades(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (gondolero_id, localidad_id)
);

CREATE INDEX IF NOT EXISTS idx_gondolero_localidades_gondolero ON gondolero_localidades(gondolero_id);
CREATE INDEX IF NOT EXISTS idx_gondolero_localidades_localidad ON gondolero_localidades(localidad_id);

-- ── Campaña ↔ Localidades ────────────────────────────────────
CREATE TABLE IF NOT EXISTS campana_localidades (
  campana_id    uuid    NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  localidad_id  integer NOT NULL REFERENCES localidades(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (campana_id, localidad_id)
);

CREATE INDEX IF NOT EXISTS idx_campana_localidades_campana  ON campana_localidades(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_localidades_localidad ON campana_localidades(localidad_id);

-- ── Comercios: columna de localidad (nueva) ──────────────────
ALTER TABLE comercios ADD COLUMN IF NOT EXISTS localidad_id integer REFERENCES localidades(id);

-- ── RLS — provincias, departamentos, localidades (lectura pública) ──
ALTER TABLE provincias    ENABLE ROW LEVEL SECURITY;
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE localidades   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de provincias"    ON provincias    FOR SELECT USING (true);
CREATE POLICY "Lectura pública de departamentos" ON departamentos FOR SELECT USING (true);
CREATE POLICY "Lectura pública de localidades"   ON localidades   FOR SELECT USING (true);

-- ── RLS — gondolero_localidades ──────────────────────────────
ALTER TABLE gondolero_localidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gondolero ve sus propias localidades"
  ON gondolero_localidades FOR SELECT
  USING (gondolero_id = auth.uid());

CREATE POLICY "Gondolero actualiza sus propias localidades"
  ON gondolero_localidades FOR ALL
  USING (gondolero_id = auth.uid());

-- ── RLS — campana_localidades ────────────────────────────────
ALTER TABLE campana_localidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de campana_localidades"
  ON campana_localidades FOR SELECT USING (true);
