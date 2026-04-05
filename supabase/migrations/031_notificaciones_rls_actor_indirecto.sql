-- Fix: política RLS actor_ve_sus_notificaciones usaba actor_id = auth.uid()
-- pero actor_id contiene el ID de la entidad (distri_id o marca_id),
-- no el ID del usuario logueado. La comparación nunca matcheaba.
--
-- La solución es resolver el ID de entidad del usuario a través de profiles.

DROP POLICY IF EXISTS "actor_ve_sus_notificaciones" ON notificaciones;

CREATE POLICY "actor_ve_sus_notificaciones"
  ON notificaciones
  FOR SELECT
  USING (
    -- Caso directo (gondolero actúa como entidad — raro pero posible)
    actor_id = auth.uid()
    -- Caso distribuidora: el usuario tiene distri_id en su profile
    OR actor_id IN (
      SELECT distri_id FROM profiles
      WHERE id = auth.uid() AND distri_id IS NOT NULL
    )
    -- Caso marca: el usuario tiene marca_id en su profile
    OR actor_id IN (
      SELECT marca_id FROM profiles
      WHERE id = auth.uid() AND marca_id IS NOT NULL
    )
  );
