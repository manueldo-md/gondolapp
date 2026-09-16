-- fecha_fin: obligatoria en campañas puntuales, prohibida en las de seguimiento
--
-- LA REGLA (16/9/2026): una campaña puntual sin fecha de fin no existe — si no
-- tiene fin, es continua, y eso es una campaña de seguimiento. Ordena las dos
-- modalidades igual que las otras dos restricciones que ya pusimos:
--
--   tope_total_comercios   → solo puntual   (campanas_tope_solo_puntual)
--   visitas_por_semana     → solo seguimiento (campanas_frecuencia_solo_seguimiento)
--   fecha_fin              → solo puntual, y obligatoria  ← esta
--
-- POR QUÉ AHORA: sin fecha_fin una campaña puntual no vence nunca, así que el
-- gate que rechaza misiones de campañas vencidas no dispararía jamás para ella.
-- Las campañas sin fecha serían exactamente las que siguen aceptando misiones
-- para siempre — el problema que el gate viene a cerrar.
--
-- ── LA EXCEPCIÓN DE BORRADOR, QUE NO ES OPCIONAL ────────────────────────────
-- Un borrador se guarda con datos incompletos mientras el creador arma la
-- campaña. Sin exceptuarlo, guardar un borrador antes de completar la fecha
-- falla, y el editor se vuelve inusable.
--
-- ── VALIDA TODO, SIN NOT VALID ──────────────────────────────────────────────
-- Había 10 campañas activas en dev y 5 en producción sin fecha_fin, todas
-- puntuales. Se resolvieron a mano antes de esta migración (2026-12-31), así que
-- el constraint entra validando también lo existente.
--
-- Se consideró NOT VALID para no tocarlas, y se descartó por una razón concreta:
-- una campaña puntual sin fecha_fin NO VENCE NUNCA, así que el gate de
-- vencimiento de registrarMision no dispararía jamás para ella. Dejarlas afuera
-- del constraint habría dejado justamente a las 15 campañas que originaron todo
-- esto aceptando misiones para siempre.
--
-- Si el ALTER falla, es que quedó alguna sin fecha:
--   SELECT id, nombre, modalidad, estado FROM campanas
--   WHERE estado <> 'borrador'
--     AND ((modalidad = 'puntual' AND fecha_fin IS NULL)
--       OR (modalidad = 'seguimiento' AND fecha_fin IS NOT NULL));

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_fecha_fin_por_modalidad;
ALTER TABLE campanas ADD CONSTRAINT campanas_fecha_fin_por_modalidad
  CHECK (
    estado = 'borrador'
    OR (modalidad = 'puntual'     AND fecha_fin IS NOT NULL)
    OR (modalidad = 'seguimiento' AND fecha_fin IS NULL)
  );

COMMENT ON COLUMN campanas.fecha_fin IS
  'Último día en que la campaña acepta misiones. Obligatoria en modalidad puntual, nula en seguimiento (que no termina). El gate está en registrarMision; el estado NO se cierra solo — "vencida" se deriva al leer, ver lib/campana-vigencia.ts.';
