-- NOTA (reconciliación): sobre una base fresca este CREATE TABLE IF NOT EXISTS
-- NO corre, porque la 20260406151509_zonas_geograficas.sql ya creó campana_localidades
-- con otra forma (PK compuesta, sin columna id). La forma que declara este
-- archivo es la correcta y la que hay en producción; quien la impone sobre una
-- base fresca es la 20260907152753_reconciliacion_conflictos.sql.

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
