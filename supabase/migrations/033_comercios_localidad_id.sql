-- ============================================================
-- 033 — Garantiza columna localidad_id en comercios
-- Idempotente: usa IF NOT EXISTS. Necesario si la migración 032
-- no se aplicó en producción o la columna fue omitida.
-- ============================================================

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS localidad_id integer REFERENCES localidades(id);
