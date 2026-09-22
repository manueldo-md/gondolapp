-- ─────────────────────────────────────────────────────────────────────────────
-- DROP de tres columnas que el código ya no lee ni escribe
--
--   bloques_foto.tipo_contenido
--   bloques_foto.solicitar_precio
--   bloque_campos.solicitar_precio
--
-- El código dejó de usarlas en ca44f62 y c76e30c, verificados en producción el
-- 22/9/2026: la campaña de altas nace con su bloque, los editores ya no muestran
-- ninguno de los dos controles, y el badge de precio sale de la pregunta
-- tipificada. Este es el paso que va DESPUÉS de esa verificación, igual que con
-- `profiles.nivel` y `profiles.fotos_aprobadas`.
--
-- ── fotos.precio_confirmado NO SE TOCA ───────────────────────────────────────
-- Esa columna sigue recibiendo escrituras: la cola offline guarda `precio` por
-- bloque en IndexedDB y `cola-sync-offline.tsx` lo lee, así que una misión
-- encolada ANTES del deploy todavía lo manda. Espera al TTL de 7 días de la
-- cola. Al 22/9/2026 tiene 0 filas con valor en las dos bases, pero cero no es
-- lo mismo que imposible.
--
-- ── POR QUÉ SE VAN ───────────────────────────────────────────────────────────
-- `tipo_contenido` (propios/competencia/ambos) quedó redundante con la
-- tipificación por pregunta, y podía contradecirla: cada pregunta dice qué mide
-- y un segundo nivel en el bloque decía otra cosa. Nunca decidió nada — las
-- únicas comparaciones en el repo eran el `checked` de su propio radio button.
--
-- `solicitar_precio` eran DOS columnas con el mismo nombre en dos tablas, y por
-- eso la casilla nunca funcionó: el editor escribía la de `bloques_foto` y el
-- input de la captura miraba la de `bloque_campos`, que no escribía nadie.
--
-- ── DE DÓNDE SALIÓ EL BUG DE 'ninguno', QUE VALE PARA EL PRÓXIMO DROP ────────
-- El CHECK de `tipo_contenido` acepta hoy tres valores. El dump previo al
-- `DROP SCHEMA public CASCADE` de septiembre dice que aceptaba CUATRO:
--
--   pre-incidente : ('propios','competencia','ambos','ninguno')
--   base viva     : ('propios','competencia','ambos')
--
-- La reconstrucción desde las migraciones perdió `'ninguno'`, porque la
-- migración inicial solo tiene tres. El código se siguió escribiendo contra la
-- base de antes: `BLOQUE_ALTAS` forzaba `'ninguno'`, los INSERT rebotaban, y
-- como nadie chequeaba el error la campaña de altas se creaba sin bloque.
--
-- Es la tercera diferencia confirmada entre el dump y la base viva. Anotada en
-- CLAUDE.md junto a `localidades.provincia_id`.
--
-- ── LO VERIFICADO ANTES DE ESCRIBIR ESTO ─────────────────────────────────────
-- Grep de las tres columnas sobre el repo ENTERO —no solo app/ y lib/— después
-- de todos los cambios. Apareció lo que el grep anterior no cubría y hubo que
-- apagarlo primero: 7 escrituras en `scripts/seed-demo-completo.ts`, una en
-- `supabase/seed.sql` y la interfaz `BloqueFoto` de `types/index.ts`. El seed es
-- el que repuebla un ambiente desde cero, así que dropear sin eso habría roto
-- el procedimiento de restauración de producción.
--
-- Y contra las dos bases: ninguna vista, ningún índice y ninguna policy RLS
-- dependen de las tres columnas. La única constraint es el CHECK de
-- `tipo_contenido`, que `DROP COLUMN` se lleva solo.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE bloques_foto  DROP COLUMN IF EXISTS tipo_contenido;
ALTER TABLE bloques_foto  DROP COLUMN IF EXISTS solicitar_precio;
ALTER TABLE bloque_campos DROP COLUMN IF EXISTS solicitar_precio;

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- Corre después del COMMIT y no escribe nada.
DO $verif$
DECLARE
  _quedan int;
  _precio int;
BEGIN
  SELECT count(*) INTO _quedan
  FROM information_schema.columns
  WHERE (table_name = 'bloques_foto'  AND column_name IN ('tipo_contenido', 'solicitar_precio'))
     OR (table_name = 'bloque_campos' AND column_name = 'solicitar_precio');

  IF _quedan <> 0 THEN
    RAISE WARNING '[drop] quedaron % de las 3 columnas', _quedan;
  END IF;

  -- La que NO se dropea. Si esto avisa, se fue algo que no debía.
  SELECT count(*) INTO _precio
  FROM information_schema.columns
  WHERE table_name = 'fotos' AND column_name = 'precio_confirmado';

  IF _precio <> 1 THEN
    RAISE WARNING '[drop] fotos.precio_confirmado tendría que seguir existiendo y no está';
  END IF;

  RAISE NOTICE '[drop] OK — 3 columnas menos, fotos.precio_confirmado intacta';
END
$verif$;
