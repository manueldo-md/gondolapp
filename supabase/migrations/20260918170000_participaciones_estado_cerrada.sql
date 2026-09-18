-- ─────────────────────────────────────────────────────────────────────────────
-- `participaciones.estado` acepta 'cerrada'
--
-- ⚠️  CORRER ANTES DE DEPLOYAR el código que la escribe, o toda desvinculación
--     falla con un error de CHECK. Es el orden inverso al del DROP de columnas:
--     acá la base tiene que ir PRIMERO porque el código nuevo escribe un valor
--     que hoy la base rechaza.
--
-- ── QUÉ SIGNIFICA 'cerrada' ─────────────────────────────────────────────────
-- La participación terminó porque **se cerró la vinculación** entre el gondolero
-- y la distribuidora, no por algo que hiciera el gondolero.
--
-- Los tres estados que había no alcanzaban, y usar cualquiera de ellos mentía:
--
--   · 'completada'  → afirma que terminó el trabajo. No lo terminó.
--   · 'abandonada'  → le echa la culpa a él. Lo desvincularon.
--   · 'activa'      → lo deja colgado en una campaña donde ya no puede entrar,
--                     que es exactamente lo que pasaba hasta hoy.
--
-- ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
-- Del Walled Garden: un gondolero pertenece a UNA distribuidora a la vez, y para
-- cambiar tiene que desvincularse primero. Sin cerrar las participaciones, ese
-- camino dejaba al gondolero relevando para la distri vieja mientras trabajaba
-- para la nueva — el índice único de vínculo habría sido una formalidad.
--
-- Verificado el 18/9/2026: en dev hay 28 'activa' y 16 'completada'; en prod 22
-- y 9. Ninguna fila cambia de valor con esta migración, solo se amplía el CHECK.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE participaciones DROP CONSTRAINT IF EXISTS participaciones_estado_check;

ALTER TABLE participaciones ADD CONSTRAINT participaciones_estado_check
  CHECK (estado = ANY (ARRAY['activa'::text, 'completada'::text, 'abandonada'::text, 'cerrada'::text]));

COMMENT ON COLUMN participaciones.estado IS
  'activa | completada (llegó al máximo) | abandonada (se bajó él) | '
  'cerrada (se cerró la vinculación con la distribuidora — no es decisión suya). '
  'Ver lib/cerrar-vinculacion.ts.';

-- Verificación — tiene que aceptar el valor nuevo:
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'participaciones_estado_check';
