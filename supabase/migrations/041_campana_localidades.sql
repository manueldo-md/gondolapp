-- 041 — Tabla campana_localidades
-- Vincula campañas con localidades del sistema geográfico nuevo (032).
-- La tabla localidades ya existe; faltaba este junction table.

CREATE TABLE IF NOT EXISTS campana_localidades (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id   uuid    NOT NULL REFERENCES campanas(id) ON DELETE CASCADE,
  localidad_id integer NOT NULL REFERENCES localidades(id),
  created_at   timestamptz DEFAULT now(),
  UNIQUE(campana_id, localidad_id)
);

CREATE INDEX IF NOT EXISTS idx_campana_localidades_campana   ON campana_localidades(campana_id);
CREATE INDEX IF NOT EXISTS idx_campana_localidades_localidad ON campana_localidades(localidad_id);

ALTER TABLE campana_localidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON campana_localidades FOR ALL USING (true);
