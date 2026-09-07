-- Generar codigo_gondolero para todos los gondoleros que aún no tienen uno
-- EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR

UPDATE profiles
SET codigo_gondolero =
  UPPER(SUBSTRING(COALESCE(alias, nombre, 'GOND'), 1, 4)) ||
  '-' || LPAD(FLOOR(RANDOM() * 9999)::text, 4, '0')
WHERE tipo_actor = 'gondolero'
  AND codigo_gondolero IS NULL;

-- Verificar resultado:
-- SELECT alias, nombre, codigo_gondolero FROM profiles WHERE tipo_actor = 'gondolero' ORDER BY alias;
