-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: los vínculos que solo existían en profiles.distri_id
--
-- ── POR QUÉ ──────────────────────────────────────────────────────────────────
-- La fuente de verdad de "este gondolero trabaja para esta distri" es
-- gondolero_distri_solicitudes (y fixer_distri_solicitudes para los fixers).
-- profiles.distri_id quedó como una segunda copia, y hay dos caminos de alta
-- que escriben la columna SIN crear la solicitud:
--
--   · el alta manual desde /admin/usuarios
--   · handle_new_user(), cuando el signup trae distri_id en el metadata
--
-- Mientras las pantallas leían la columna, esos perfiles se veían igual. En
-- cuanto las lecturas pasan a la tabla —que es el próximo paso— desaparecen del
-- panel de su distribuidora sin que nadie borre nada. Esta migración va ANTES,
-- por eso: no es limpieza, es prerequisito.
--
-- ── POR QUÉ 'distri' EN iniciado_por ─────────────────────────────────────────
-- El CHECK solo admite ('gondolero','distri') y ('fixer','distri'); no existe
-- 'admin'. Y es el valor correcto de todos modos: estos vínculos nacieron de un
-- alta que hizo la distribuidora (o el admin en su nombre), nunca de una
-- solicitud que mandó el gondolero.
--
-- ── POR QUÉ created_at = profiles.created_at ─────────────────────────────────
-- Ninguno de estos perfiles tiene misiones, participaciones ni fotos, así que
-- no hay trabajo del cual deducir cuándo empezó el vínculo. La fecha de alta
-- del perfil es el único hecho real disponible. now() diría que se vincularon
-- hoy, que es falso.
--
-- ── LO QUE NO TOCA ───────────────────────────────────────────────────────────
-- · profiles: no se escribe una sola fila. La columna queda como está.
-- · tipo_actor = 'distribuidora': ahí profiles.distri_id significa otra cosa
--   —qué distribuidora ES este usuario— y de eso dependen get_distri_id() y 18
--   políticas RLS. El WHERE lo excluye explícitamente.
--
-- Idempotente: ON CONFLICT DO NOTHING contra el UNIQUE (actor, distri).
-- Medido el 18/9/2026 — PROD: 4 perfiles (2 gondoleros + 2 fixers). DEV: 0.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Gondoleros ───────────────────────────────────────────────────────────────
INSERT INTO gondolero_distri_solicitudes
  (gondolero_id, distri_id, estado, iniciado_por, created_at, updated_at)
SELECT p.id, p.distri_id, 'aprobada', 'distri', p.created_at, now()
FROM profiles p
WHERE p.tipo_actor = 'gondolero'
  AND p.distri_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM distribuidoras d WHERE d.id = p.distri_id)
ON CONFLICT (gondolero_id, distri_id) DO NOTHING;

-- ── Fixers ───────────────────────────────────────────────────────────────────
-- Tabla aparte y hoy vacía en las dos bases: para los fixers la columna es el
-- ÚNICO registro que existe del vínculo.
INSERT INTO fixer_distri_solicitudes
  (fixer_id, distri_id, estado, iniciado_por, created_at, updated_at)
SELECT p.id, p.distri_id, 'aprobada', 'distri', p.created_at, now()
FROM profiles p
WHERE p.tipo_actor = 'fixer'
  AND p.distri_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM distribuidoras d WHERE d.id = p.distri_id)
ON CONFLICT (fixer_id, distri_id) DO NOTHING;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Si queda alguno sin vínculo aprobado es porque YA tenía una fila para esa
-- distri en otro estado ('terminada', 'rechazada', 'pendiente'). Eso no se pisa
-- acá: una desvinculación deliberada no se revierte con un backfill. Aborta y
-- se mira a mano.
DO $$
DECLARE
  _faltan int;
  _detalle text;
BEGIN
  SELECT count(*), string_agg(p.alias || ' (' || p.tipo_actor || ')', ', ')
    INTO _faltan, _detalle
  FROM profiles p
  WHERE p.tipo_actor IN ('gondolero', 'fixer')
    AND p.distri_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM gondolero_distri_solicitudes s
      WHERE s.gondolero_id = p.id AND s.distri_id = p.distri_id AND s.estado = 'aprobada')
    AND NOT EXISTS (
      SELECT 1 FROM fixer_distri_solicitudes s
      WHERE s.fixer_id = p.id AND s.distri_id = p.distri_id AND s.estado = 'aprobada');

  IF _faltan > 0 THEN
    RAISE EXCEPTION
      '[backfill] % perfiles siguen sin vínculo aprobado: %. Tienen una fila previa en otro estado — revisar antes de migrar las lecturas.',
      _faltan, _detalle;
  END IF;

  RAISE NOTICE '[backfill] ok: ningún gondolero ni fixer con distri_id quedó sin vínculo aprobado.';
END $$;

COMMIT;
