-- =============================================================================
-- Migration 037: Alias y código de vinculación para fixers existentes
-- EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR
-- =============================================================================

-- Generar codigo_gondolero para fixers que aún no tienen uno
UPDATE profiles
SET codigo_gondolero =
  'FIXR-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0')
WHERE tipo_actor = 'fixer'
  AND codigo_gondolero IS NULL;

-- Nota: los alias de fixers sin alias se asignan desde el panel admin
-- usando el botón "Asignar alias pendientes" en /admin/usuarios
-- (el botón ya fue extendido para incluir tipo_actor = 'fixer')

-- Verificar resultado:
-- SELECT alias, nombre, codigo_gondolero FROM profiles WHERE tipo_actor = 'fixer';
