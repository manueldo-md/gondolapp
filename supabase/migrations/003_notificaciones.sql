-- Tabla de notificaciones in-app para gondoleros
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gondolero_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('foto_aprobada', 'foto_rechazada', 'nivel_subido')),
  titulo        text NOT NULL,
  mensaje       text,
  leida         boolean NOT NULL DEFAULT false,
  campana_id    uuid REFERENCES public.campanas(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índice para queries frecuentes (unread count por gondolero)
CREATE INDEX IF NOT EXISTS notificaciones_gondolero_leida_idx
  ON public.notificaciones (gondolero_id, leida);

-- RLS
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- Gondolero solo ve sus propias notificaciones
CREATE POLICY "gondolero_ver_sus_notificaciones"
  ON public.notificaciones
  FOR SELECT
  USING (gondolero_id = auth.uid());

-- Solo el service role puede insertar y actualizar (via server actions con admin client)
-- No se necesita policy para INSERT/UPDATE ya que usamos service_role key
