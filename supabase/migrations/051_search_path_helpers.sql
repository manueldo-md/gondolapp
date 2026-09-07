-- =============================================================================
-- 051 — search_path fijo en los helpers SECURITY DEFINER de RLS
-- =============================================================================
-- QUÉ CUBRE: get_tipo_actor(), get_distri_id() y get_marca_id().
--
-- POR QUÉ FALTABA: cambio ejecutado a mano el 7/9/2026, documentado al inicio
-- de docs/schema-real-2026-09.md.
--
-- POR QUÉ IMPORTA: las tres son SECURITY DEFINER y toda la RLS del sistema
-- depende de ellas. Sin search_path fijo, un rol que pueda crear objetos en un
-- esquema que aparezca antes en el search_path puede shadowear las tablas que
-- la función consulta y hacer que devuelva lo que quiera — con los privilegios
-- del owner de la función.
--
-- Se usa ALTER FUNCTION y no CREATE OR REPLACE a propósito: solo cambia el
-- atributo, no toca el cuerpo. Las definiciones viven en la 001 y la 006.
-- =============================================================================

ALTER FUNCTION public.get_tipo_actor() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_distri_id()  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_marca_id()   SET search_path = public, pg_temp;
