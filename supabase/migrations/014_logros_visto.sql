-- Marcar si el gondolero ya vio el logro desbloqueado (para el badge en nav)
ALTER TABLE gondolero_logros ADD COLUMN IF NOT EXISTS visto boolean DEFAULT false;

-- Política para que el gondolero pueda marcar sus propios logros como vistos
CREATE POLICY "gondolero_logros_update" ON gondolero_logros
  FOR UPDATE USING (gondolero_id = auth.uid());
