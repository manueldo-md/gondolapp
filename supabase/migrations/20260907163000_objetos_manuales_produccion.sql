-- =============================================================================
-- Objetos que existen en producción y no estaban en ninguna migración
-- =============================================================================
-- Grupo A de la comparación del 7/9/2026 entre la base reconstruida desde las
-- migraciones y docs/schema-real-2026-09-pre-incidente.md. Todo esto se creó a mano en el
-- SQL Editor de Supabase entre marzo y abril de 2026 y nunca se versionó.
--
-- De los 35 ítems del grupo A:
--   - 7 eran el mismo objeto con otro nombre. Se corrigieron en la migración
--     de origen, no acá: alertas_ignoradas (constraint + índice),
--     public_read_provincias / _departamentos / _localidades, relaciones_admin
--     y tokens_marca_distri_public.
--   - 8 se descartaron deliberadamente (ver más abajo).
--   - 20 son los de este archivo.
--
-- DESCARTADOS a propósito — NO reproducir, están en producción pero no deben
-- perpetuarse:
--   - notificaciones.foto_id y su FK: columna muerta. Los tres inserts de
--     lib/notificaciones.ts nunca la escriben y nada la lee.
--   - configuracion_select (SELECT para cualquier autenticado): lib/config.ts
--     lee con service_role, que bypassea RLS, así que la app no la necesita.
--     Reproducirla sería versionar una fuga del walled garden.
--   - notificaciones_select: qual idéntico a gondolero_ve_sus_notificaciones.
--   - fixer_ve_sus_participaciones: contenida en participaciones_select, que
--     ya es (gondolero_id = auth.uid()) OR ...
--   - localidades.provincia_id, su FK e idx_localidades_provincia: el código
--     navega localidad → departamento → provincia. Verificado en producción:
--     944 localidades, las 944 con departamento_id y solo 2 con provincia_id.
--     Es un atajo que nunca se usó y que puede divergir del camino canónico.
--
-- Todo el archivo es idempotente y sobre producción es un no-op.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- comercios — columnas del alta de comercio y del flujo de validación
-- ─────────────────────────────────────────────────────────────────────────────
-- Las cuatro las usa el código: el admin escribe `estado` al aprobar o
-- rechazar, la captura escribe `telefono` y `encargado`, y la vista de
-- comercios pendientes lee `campana_id`.

ALTER TABLE comercios
  ADD COLUMN IF NOT EXISTS estado     text DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS telefono   text,
  ADD COLUMN IF NOT EXISTS encargado  text,
  ADD COLUMN IF NOT EXISTS campana_id uuid;

ALTER TABLE comercios DROP CONSTRAINT IF EXISTS comercios_estado_check;
ALTER TABLE comercios ADD CONSTRAINT comercios_estado_check
  CHECK (estado IN ('activo', 'pendiente_validacion', 'rechazado'));

ALTER TABLE comercios DROP CONSTRAINT IF EXISTS comercios_campana_id_fkey;
ALTER TABLE comercios ADD CONSTRAINT comercios_campana_id_fkey
  FOREIGN KEY (campana_id) REFERENCES campanas(id);


-- ─────────────────────────────────────────────────────────────────────────────
-- gondolero_distri_solicitudes.iniciado_por — CHECK faltante
-- ─────────────────────────────────────────────────────────────────────────────
-- La migración que agrega la columna la declara sin CHECK. Producción sí lo
-- tiene.

ALTER TABLE gondolero_distri_solicitudes
  DROP CONSTRAINT IF EXISTS gondolero_distri_solicitudes_iniciado_por_check;
ALTER TABLE gondolero_distri_solicitudes
  ADD CONSTRAINT gondolero_distri_solicitudes_iniciado_por_check
  CHECK (iniciado_por IN ('gondolero', 'distri'));


-- ─────────────────────────────────────────────────────────────────────────────
-- Geografía — UNIQUE por nombre
-- ─────────────────────────────────────────────────────────────────────────────
-- Integridad real: evitan provincias, departamentos y localidades duplicadas.
-- Sin esto, dos corridas del seed de zonas duplican el catálogo entero.
-- Los índices que los respaldan salen solos con la constraint.

ALTER TABLE provincias DROP CONSTRAINT IF EXISTS provincias_nombre_key;
ALTER TABLE provincias ADD CONSTRAINT provincias_nombre_key UNIQUE (nombre);

ALTER TABLE departamentos DROP CONSTRAINT IF EXISTS departamentos_nombre_provincia_id_key;
ALTER TABLE departamentos ADD CONSTRAINT departamentos_nombre_provincia_id_key
  UNIQUE (nombre, provincia_id);

ALTER TABLE localidades DROP CONSTRAINT IF EXISTS localidades_nombre_departamento_id_key;
ALTER TABLE localidades ADD CONSTRAINT localidades_nombre_departamento_id_key
  UNIQUE (nombre, departamento_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- configuracion — columna id y clave única
-- ─────────────────────────────────────────────────────────────────────────────
-- OJO, DECISIÓN TOMADA ACÁ: además de agregar `id`, esto mueve la PRIMARY KEY
-- de `clave` a `id`, que es la forma de producción.
--
-- El motivo: `configuracion.id` es un ítem del grupo A, pero agregarla suelta
-- deja la tabla incoherente — quedaría una columna id sin rol, con la PK en
-- `clave` y un UNIQUE redundante encima de `clave`, o sea dos índices sobre la
-- misma columna. La columna solo tiene sentido como PK, así que se hace
-- completo. Efecto lateral: resuelve de paso dos ítems del grupo C
-- (configuracion_pkey, constraint e índice).
--
-- No rompe nada en el código: el upsert usa onConflict: 'clave', que necesita
-- un UNIQUE sobre `clave` — lo hay en las dos formas — y ninguna query lee
-- `id`. Verificado que ninguna FK apunta a configuracion, así que mover la PK
-- no tiene dependientes.

ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT uuid_generate_v4();

ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_pkey;
ALTER TABLE configuracion ADD CONSTRAINT configuracion_pkey PRIMARY KEY (id);

ALTER TABLE configuracion DROP CONSTRAINT IF EXISTS configuracion_clave_key;
ALTER TABLE configuracion ADD CONSTRAINT configuracion_clave_key UNIQUE (clave);

-- `clave` era la PK, así que su NOT NULL venía implícito. Se fija explícito
-- para no depender de si Postgres lo conserva al soltar la PK — en producción
-- la columna es NOT NULL.
ALTER TABLE configuracion ALTER COLUMN clave SET NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- Policies que solo existían en producción
-- ─────────────────────────────────────────────────────────────────────────────
-- Se replican tal cual están en producción. Varias usan subquery sobre
-- profiles en vez de los helpers get_distri_id() / get_marca_id(), que es más
-- lento y menos consistente con el resto del sistema — pero unificar eso es
-- trabajo de la fase de RLS, no de esta migración, cuyo objetivo es que la
-- base reconstruida coincida con producción.

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracion_admin" ON configuracion;
CREATE POLICY "configuracion_admin" ON configuracion
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.tipo_actor = 'admin')
  );

DROP POLICY IF EXISTS "relaciones_distri" ON marca_distri_relaciones;
CREATE POLICY "relaciones_distri" ON marca_distri_relaciones
  FOR ALL USING (
    distri_id = (SELECT profiles.distri_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "relaciones_marca" ON marca_distri_relaciones;
CREATE POLICY "relaciones_marca" ON marca_distri_relaciones
  FOR ALL USING (
    marca_id = (SELECT profiles.marca_id FROM profiles WHERE profiles.id = auth.uid())
  );

DROP POLICY IF EXISTS "tokens_marca_distri_insert" ON marca_distri_tokens;
CREATE POLICY "tokens_marca_distri_insert" ON marca_distri_tokens
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
