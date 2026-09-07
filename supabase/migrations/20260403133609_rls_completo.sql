-- =============================================================================
-- GondolApp — Migración 006: RLS completo (idempotente)
-- Completa las políticas faltantes detectadas en auditoría de abril 2026.
-- Ejecutar en Supabase Dashboard → SQL Editor
-- Script idempotente: se puede ejecutar múltiples veces sin errores.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: TABLAS CON RLS HABILITADO PERO SIN NINGUNA POLÍTICA
-- Estas tablas bloqueaban TODAS las queries via browser/server client regular.
-- =============================================================================

-- ── GONDOLERO_ZONAS ───────────────────────────────────────────────────────────
-- Necesario para que la página de campañas filtre por zona del gondolero.

DROP POLICY IF EXISTS "gondolero_zonas_select" ON gondolero_zonas;
CREATE POLICY "gondolero_zonas_select"
  ON gondolero_zonas FOR SELECT
  USING (
    gondolero_id = auth.uid() OR
    get_tipo_actor() = 'admin'
  );

DROP POLICY IF EXISTS "gondolero_zonas_insert" ON gondolero_zonas;
CREATE POLICY "gondolero_zonas_insert"
  ON gondolero_zonas FOR INSERT
  WITH CHECK (gondolero_id = auth.uid());

DROP POLICY IF EXISTS "gondolero_zonas_delete" ON gondolero_zonas;
CREATE POLICY "gondolero_zonas_delete"
  ON gondolero_zonas FOR DELETE
  USING (gondolero_id = auth.uid());

-- ── CAMPANA_ZONAS ─────────────────────────────────────────────────────────────
-- Necesario para que el filtro de campañas por zona funcione correctamente.
-- Cualquier usuario autenticado puede leer zonas de campañas (no es info sensible).
-- INSERT/DELETE solo via service_role (server actions con admin client).

DROP POLICY IF EXISTS "campana_zonas_select" ON campana_zonas;
CREATE POLICY "campana_zonas_select"
  ON campana_zonas FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ── BLOQUES_FOTO ──────────────────────────────────────────────────────────────
-- Necesario para que el flujo de captura obtenga los bloques de foto de la campaña.
-- El JS browser client hace la query anidada en la página de captura.

DROP POLICY IF EXISTS "bloques_foto_select" ON bloques_foto;
CREATE POLICY "bloques_foto_select"
  ON bloques_foto FOR SELECT
  USING (
    -- Gondolero: puede ver bloques de campañas activas
    (get_tipo_actor() IN ('gondolero', 'fixer') AND
      EXISTS (
        SELECT 1 FROM campanas c
        WHERE c.id = bloques_foto.campana_id
        AND c.estado = 'activa'
      )
    ) OR
    -- Distri: puede ver bloques de sus campañas
    (get_tipo_actor() = 'distribuidora' AND
      EXISTS (
        SELECT 1 FROM campanas c
        WHERE c.id = bloques_foto.campana_id
        AND c.distri_id = get_distri_id()
      )
    ) OR
    -- Marca: puede ver bloques de sus campañas
    (get_tipo_actor() = 'marca' AND
      EXISTS (
        SELECT 1 FROM campanas c
        WHERE c.id = bloques_foto.campana_id
        AND c.marca_id = get_marca_id()
      )
    ) OR
    get_tipo_actor() = 'admin'
  );

-- INSERT/UPDATE/DELETE de bloques via service_role únicamente (crearCampana action).

-- ── MOVIMIENTOS_TOKENS ────────────────────────────────────────────────────────
-- Necesario para que las páginas "Cuenta" de distri y marca muestren el historial.

DROP POLICY IF EXISTS "movimientos_tokens_select_distri" ON movimientos_tokens;
CREATE POLICY "movimientos_tokens_select_distri"
  ON movimientos_tokens FOR SELECT
  USING (
    (actor_tipo = 'distribuidora' AND
      actor_id = get_distri_id() AND
      get_tipo_actor() = 'distribuidora') OR
    (actor_tipo = 'marca' AND
      actor_id = get_marca_id() AND
      get_tipo_actor() = 'marca') OR
    get_tipo_actor() = 'admin'
  );

-- INSERT via service_role únicamente (server actions con admin client).

-- =============================================================================
-- SECCIÓN 2: POLÍTICAS INCOMPLETAS EN TABLAS EXISTENTES
-- =============================================================================

-- ── PROFILES: distri y marca ven sus gondoleros ───────────────────────────────
-- La política existente solo permite ver el propio perfil o si es admin.
-- Distri necesita ver los perfiles de sus gondoleros (página /distribuidora/gondoleros).
-- Marca también necesita ver gondoleros participantes en sus campañas.

DROP POLICY IF EXISTS "profiles_select_distri" ON profiles;
CREATE POLICY "profiles_select_distri"
  ON profiles FOR SELECT
  USING (
    get_tipo_actor() = 'distribuidora' AND
    distri_id = get_distri_id()
  );

DROP POLICY IF EXISTS "profiles_select_marca" ON profiles;
CREATE POLICY "profiles_select_marca"
  ON profiles FOR SELECT
  USING (
    get_tipo_actor() = 'marca' AND
    EXISTS (
      SELECT 1 FROM participaciones p
      JOIN campanas c ON c.id = p.campana_id
      WHERE p.gondolero_id = profiles.id
      AND c.marca_id = get_marca_id()
    )
  );

-- ── DISTRIBUIDORAS: gondoleros pueden ver las validadas ───────────────────────
-- El formulario de registro muestra un dropdown de distribuidoras validadas.
-- Sin esta policy el dropdown está vacío y el gondolero no puede registrarse.

DROP POLICY IF EXISTS "distribuidoras_select_gondolero" ON distribuidoras;
CREATE POLICY "distribuidoras_select_gondolero"
  ON distribuidoras FOR SELECT
  USING (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    validada = true
  );

-- ── DISTRIBUIDORAS: la propia distri puede actualizarse ──────────────────────

DROP POLICY IF EXISTS "distribuidoras_update_own" ON distribuidoras;
CREATE POLICY "distribuidoras_update_own"
  ON distribuidoras FOR UPDATE
  USING (
    id = get_distri_id() AND
    get_tipo_actor() = 'distribuidora'
  );

-- ── MARCAS: la propia marca puede actualizarse ────────────────────────────────

DROP POLICY IF EXISTS "marcas_update_own" ON marcas;
CREATE POLICY "marcas_update_own"
  ON marcas FOR UPDATE
  USING (
    id = get_marca_id() AND
    get_tipo_actor() = 'marca'
  );

-- ── COMERCIOS: distri y admin pueden actualizar (validación) ──────────────────

DROP POLICY IF EXISTS "comercios_update_distri_admin" ON comercios;
CREATE POLICY "comercios_update_distri_admin"
  ON comercios FOR UPDATE
  USING (
    get_tipo_actor() = 'admin' OR
    (get_tipo_actor() = 'distribuidora' AND
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = comercios.registrado_por
        AND p.distri_id = get_distri_id()
      )
    )
  );

-- ── NOTIFICACIONES: gondolero puede marcar las suyas como leídas ─────────────

DROP POLICY IF EXISTS "notificaciones_update_leida" ON notificaciones;
CREATE POLICY "notificaciones_update_leida"
  ON notificaciones FOR UPDATE
  USING (gondolero_id = auth.uid())
  WITH CHECK (gondolero_id = auth.uid());

-- ── CAMPAÑAS: distri puede insertar y actualizar campañas internas ────────────

DROP POLICY IF EXISTS "campanas_insert_distri" ON campanas;
CREATE POLICY "campanas_insert_distri"
  ON campanas FOR INSERT
  WITH CHECK (
    get_tipo_actor() = 'distribuidora' AND
    distri_id = get_distri_id()
  );

DROP POLICY IF EXISTS "campanas_update_distri" ON campanas;
CREATE POLICY "campanas_update_distri"
  ON campanas FOR UPDATE
  USING (
    get_tipo_actor() = 'distribuidora' AND
    distri_id = get_distri_id()
  );

DROP POLICY IF EXISTS "campanas_update_marca" ON campanas;
CREATE POLICY "campanas_update_marca"
  ON campanas FOR UPDATE
  USING (
    get_tipo_actor() = 'marca' AND
    marca_id = get_marca_id()
  );

-- ── PARTICIPACIONES: admin y gondolero pueden actualizar ──────────────────────

DROP POLICY IF EXISTS "participaciones_update_admin" ON participaciones;
CREATE POLICY "participaciones_update_admin"
  ON participaciones FOR UPDATE
  USING (get_tipo_actor() = 'admin');

DROP POLICY IF EXISTS "participaciones_update_gondolero" ON participaciones;
CREATE POLICY "participaciones_update_gondolero"
  ON participaciones FOR UPDATE
  USING (
    get_tipo_actor() IN ('gondolero', 'fixer') AND
    gondolero_id = auth.uid()
  );

-- =============================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- Ejecutar estas queries para confirmar que las policies se aplicaron:
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
-- =============================================================================
