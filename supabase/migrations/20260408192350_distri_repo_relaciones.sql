-- NOTA (reconciliación): esta migración quedó SUPERSEDED por la
-- 20260409161503_distri_repo.sql, que define distri_repo_relaciones con el CHECK que
-- incluye 'terminada' y con updated_at. Como la 040 usa CREATE TABLE IF NOT
-- EXISTS, sobre una base fresca gana ESTA definición (más restrictiva) y la
-- 040 queda en no-op. La forma final la corrige la
-- 20260907152753_reconciliacion_conflictos.sql. No borrar este archivo: producción ya lo
-- tiene aplicado.

-- Relación explícita distribuidora ↔ repositora
CREATE TABLE IF NOT EXISTS distri_repo_relaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distri_id uuid REFERENCES distribuidoras(id),
  repositora_id uuid REFERENCES repositoras(id),
  estado text DEFAULT 'activa' CHECK (estado IN ('activa','inactiva')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(distri_id, repositora_id)
);
ALTER TABLE distri_repo_relaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON distri_repo_relaciones FOR ALL USING (true);
