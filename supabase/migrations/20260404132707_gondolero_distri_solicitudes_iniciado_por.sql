-- Agregar columna iniciado_por para distinguir quién inició la vinculación
ALTER TABLE gondolero_distri_solicitudes
  ADD COLUMN IF NOT EXISTS iniciado_por text DEFAULT 'gondolero';

-- Marcar registros existentes creados por la distri como 'distri' si los hay
-- (no tenemos forma de saberlo retroactivamente, quedan como 'gondolero' por defecto)
