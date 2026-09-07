-- Habilitar Supabase Realtime para la tabla notificaciones.
-- Esto permite que los clientes se suscriban a INSERT/UPDATE/DELETE
-- en tiempo real sin polling.
--
-- Si la publicación supabase_realtime no existe todavía, crearla primero.
-- En proyectos Supabase normales ya existe, solo agregar la tabla.
ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
