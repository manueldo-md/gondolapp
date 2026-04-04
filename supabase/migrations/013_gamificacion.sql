-- ── Tablas de gamificación ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS logros (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  clave text UNIQUE NOT NULL,
  nombre text NOT NULL,
  descripcion text NOT NULL,
  emoji text NOT NULL,
  frases text[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gondolero_logros (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gondolero_id uuid NOT NULL REFERENCES profiles ON DELETE CASCADE,
  logro_clave text NOT NULL REFERENCES logros(clave),
  desbloqueado_at timestamptz DEFAULT now(),
  frase_mostrada text,
  UNIQUE (gondolero_id, logro_clave)
);

ALTER TABLE logros ENABLE ROW LEVEL SECURITY;
ALTER TABLE gondolero_logros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logros_select" ON logros
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "gondolero_logros_select" ON gondolero_logros
  FOR SELECT USING (
    gondolero_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND tipo_actor = 'admin'
    )
  );

CREATE POLICY "gondolero_logros_insert" ON gondolero_logros
  FOR INSERT WITH CHECK (true);

-- ── Catálogo de logros ────────────────────────────────────────────────────────

INSERT INTO logros (clave, nombre, descripcion, emoji, frases) VALUES

('primera_foto', 'Primera foto aprobada',
 'Tu primera foto fue aprobada', '🎯',
 ARRAY[
   'Gooollll, arrancaste ganando!',
   'Prendiste el fuego, en breve ponemos el asado!',
   'Arrancó la máquina!',
   'Gooollll, nace una estrella?',
   'Messi empezó así también.'
 ]),

('racha_7_dias', 'Racha imparable',
 '6 días consecutivos con actividad', '🔥',
 ARRAY[
   'Seis al hilo! Ni el City de Guardiola se animó a tanto.',
   'Manito arriba! 👋 Metiste 6 de 6. Estás para jugar en primera.',
   '6 de 6. Ya sos el capitán indiscutido del equipo.',
   '6 días de racha! mamaaaaaa, cómo estamos eh!',
   'Consulta: Vos sos el clon de Messi?'
 ]),

('velocista', 'Velocista',
 '10 fotos en un mismo día', '🚀',
 ARRAY[
   'Si vos serías correcaminos, el coyote no te agarra.',
   '10 fotos... ¿Qué desayunaste hoy? ¿Nafta de avión?',
   'Usain Bolt debería tenerte miedo.',
   'Si esto fuera F1, serías Verstappen.',
   '10 cumplidas. Buenaaaaa, hijo del viento!',
   'Usain Bolt te pediría consejos.',
   'Scaloni te tiene en la mira!',
   '10 fotos en un día. Te estás yendo de vacaciones?'
 ]),

('explorador', 'Gran explorador',
 '10 comercios distintos visitados', '🗺️',
 ARRAY[
   'Me asusta cuántos comercios quedarán para el resto!',
   '10 Comercios... Avisame y te paso los míos también, crack.',
   'Si te ven de la AFA te citan a la selección.',
   'Si seguís así te van a llamar de Google Maps.'
 ]),

('perfeccion', '100% de aprobación',
 'Todas tus fotos aprobadas en una campaña', '💯',
 ARRAY[
   'Más efectividad que reiniciar el wifi.',
   'Más aprobaciones que helado de dulce de leche.',
   'Ni el VAR te podría anular una.',
   'Tenés más aprobación que un asado de domingo.',
   'Más aplicaciones que WD-40.',
   'Más efectividad que el sana sana colita de rana.'
 ]),

('podio', 'Top 3 del mes',
 'Quedaste entre los 3 mejores gondoleros del mes', '⭐',
 ARRAY[
   'Verstappen y Hamilton te siguen de atrás.',
   'Estás para ir a probar al Gálvez.',
   'Colapinto se pone nervioso.',
   'Top 3! Podio y champagne!'
 ]),

('primera_campana', 'Primera campaña completada',
 'Completaste tu primera campaña', '🏅',
 ARRAY[
   'Vamooooo, primera adentro!',
   'Arrancanding! te veo futuro!',
   'Excelente, estás en carrera.',
   'Así arrancó Phil Jackson...',
   'Jordan empezó así también...'
 ]),

('decacampeon', '10 campañas completadas',
 'Completaste 10 campañas', '🏆',
 ARRAY[
   'Ya tenés más títulos que el Rey de Copas!',
   'Dejá algo para el resto, máquina!',
   'A este ritmo te jubilás en breve!',
   'Ni el Bianchi de Boca pudo tanto.',
   'Ya tenés más anillos que los Bulls de Jordan.',
   'Phil Jackson te pediría consejos.'
 ])

ON CONFLICT (clave) DO NOTHING;
