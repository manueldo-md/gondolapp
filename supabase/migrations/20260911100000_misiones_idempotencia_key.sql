-- Migración: agregar idempotencia_key a misiones
--
-- Propósito: garantizar que registrarMision sea idempotente cuando la app
-- reintenta el envío de una misión guardada offline.
--
-- Flujo:
--   1. El cliente genera un UUID (crypto.randomUUID()) al guardar la misión
--      en IDB, antes del primer intento de envío.
--   2. Ese UUID viaja como idempotencia_key en cada intento de registrarMision.
--   3. El server action hace INSERT ... ON CONFLICT (idempotencia_key) DO NOTHING.
--   4. Si hubo conflicto (reintento), busca la fila existente y devuelve sus datos.
--   5. El cliente recibe éxito en ambos casos y borra la entry de IDB.
--
-- Por qué nullable:
--   Las misiones existentes no tienen key y se conservan sin cambios.
--   UNIQUE sobre columna nullable en Postgres permite múltiples NULL — cada NULL
--   se considera distinto, así que las filas existentes no chocan entre sí.
--   Solo las filas con valor no-NULL participan en la restricción de unicidad.

ALTER TABLE misiones
  ADD COLUMN idempotencia_key uuid NULL;

CREATE UNIQUE INDEX misiones_idempotencia_key_idx
  ON misiones (idempotencia_key)
  WHERE idempotencia_key IS NOT NULL;

-- Índice parcial (WHERE IS NOT NULL): más eficiente que un UNIQUE constraint
-- incondicional y semánticamente correcto — solo indexa filas que participan
-- en la restricción.
