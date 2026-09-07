-- Agrega 'foto' como tipo válido en bloque_campos.
-- La tabla fue creada directamente en Supabase sin migration, por eso
-- no hay un archivo previo que declare el constraint original.
-- Esta migration asegura que 'foto' está en la lista de tipos permitidos.

-- 1. Eliminar el constraint existente (nombre puede variar; probamos ambos)
ALTER TABLE bloque_campos DROP CONSTRAINT IF EXISTS bloque_campos_tipo_check;
ALTER TABLE bloque_campos DROP CONSTRAINT IF EXISTS bloque_campos_tipo_fkey;

-- 2. Agregar el constraint correcto con 'foto' incluido
ALTER TABLE bloque_campos
  ADD CONSTRAINT bloque_campos_tipo_check
  CHECK (tipo IN (
    'seleccion_multiple',
    'seleccion_unica',
    'binaria',
    'numero',
    'texto',
    'foto'
  ));
