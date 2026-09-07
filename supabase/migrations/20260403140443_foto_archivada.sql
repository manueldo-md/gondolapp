-- =============================================================================
-- GondolApp — Migración 007: Agregar estado 'archivada' a la tabla fotos
-- Ejecutar en Supabase Dashboard → SQL Editor
-- =============================================================================

-- Eliminar el CHECK constraint existente y reemplazarlo con uno que incluya 'archivada'
ALTER TABLE fotos
  DROP CONSTRAINT IF EXISTS fotos_estado_check;

ALTER TABLE fotos
  ADD CONSTRAINT fotos_estado_check
  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'en_revision', 'archivada'));

-- Política RLS para fotos archivadas: solo admin puede verlas
-- (las fotos archivadas no son visibles para gondoleros, distris ni marcas por defecto)
-- Las queries normales deben filtrar explícitamente: .neq('estado', 'archivada')
-- El admin client (service_role) bypasea RLS y puede ver todo.

-- Verificación:
-- SELECT column_name, check_clause
-- FROM information_schema.check_constraints
-- JOIN information_schema.constraint_column_usage USING (constraint_name)
-- WHERE table_name = 'fotos' AND column_name = 'estado';
