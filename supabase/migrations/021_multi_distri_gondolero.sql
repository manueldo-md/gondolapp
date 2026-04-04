-- ============================================================
-- MIGRACIÓN: Gondolero → múltiples distribuidoras simultáneas
-- EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR
-- ============================================================

-- Paso 1: Migrar distri_id actuales a gondolero_distri_solicitudes
-- Esto garantiza que todos los gondoleros actualmente vinculados
-- tengan un registro aprobado en la tabla de solicitudes.
INSERT INTO gondolero_distri_solicitudes (gondolero_id, distri_id, estado, iniciado_por)
SELECT id, distri_id, 'aprobada', 'gondolero'
FROM profiles
WHERE tipo_actor = 'gondolero'
  AND distri_id IS NOT NULL
ON CONFLICT (gondolero_id, distri_id) DO UPDATE
  SET estado = 'aprobada';

-- Paso 2: profiles.distri_id se mantiene por compatibilidad como
-- "distribuidora principal" del gondolero (la primera o preferida).
-- No se elimina el campo todavía.

-- Verificar el resultado:
-- SELECT p.alias, p.distri_id, s.estado
-- FROM profiles p
-- JOIN gondolero_distri_solicitudes s ON s.gondolero_id = p.id
-- WHERE p.tipo_actor = 'gondolero'
-- ORDER BY p.alias;
