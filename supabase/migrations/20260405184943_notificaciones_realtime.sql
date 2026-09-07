-- Habilitar Supabase Realtime para la tabla notificaciones.
-- Esto permite que los clientes se suscriban a INSERT/UPDATE/DELETE
-- en tiempo real sin polling.
--
-- Si la publicación supabase_realtime no existe todavía, crearla primero.
-- En proyectos Supabase normales ya existe, solo agregar la tabla.
--
-- CORREGIDO 7/9/2026 — el ALTER PUBLICATION pelado falla de dos maneras:
--   - 42710 si la tabla ya es miembro de la publicación (o sea, no es
--     re-ejecutable, y varias migraciones del set tampoco lo son)
--   - 42704 si la publicación no existe, que es el caso que el comentario
--     de arriba anticipaba pero no manejaba
-- El bloque cubre las dos: crea la publicación si falta y agrega la tabla
-- solo si todavía no está.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
  END IF;
END $$;
