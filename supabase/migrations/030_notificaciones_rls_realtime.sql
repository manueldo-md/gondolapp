-- Fix: RLS bloqueaba Supabase Realtime para usuarios autenticados.
-- La tabla ya tenía RLS habilitado pero solo existía una política para
-- gondoleros (gondolero_ver_sus_notificaciones) y una general amplia
-- (actor_ver_sus_notificaciones con subquery) que puede ser lenta.
-- Reemplazamos por políticas simples y directas que Realtime pueda evaluar.

-- Eliminar políticas anteriores si existen (pueden tener nombres distintos)
DROP POLICY IF EXISTS "gondolero_ver_sus_notificaciones"    ON notificaciones;
DROP POLICY IF EXISTS "actor_ver_sus_notificaciones"        ON notificaciones;

-- Política para actores (marca, distribuidora) — filtra por actor_id
CREATE POLICY "actor_ve_sus_notificaciones"
  ON notificaciones
  FOR SELECT
  USING (actor_id = auth.uid());

-- Política para gondoleros — filtra por gondolero_id (backward compat)
CREATE POLICY "gondolero_ve_sus_notificaciones"
  ON notificaciones
  FOR SELECT
  USING (gondolero_id = auth.uid());

-- Política para admin — ve todas las notificaciones de tipo admin
-- (actor_tipo = 'admin' no tiene actor_id, es broadcast)
CREATE POLICY "admin_ve_notificaciones_admin"
  ON notificaciones
  FOR SELECT
  USING (
    actor_tipo = 'admin'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.tipo_actor = 'admin'
    )
  );
