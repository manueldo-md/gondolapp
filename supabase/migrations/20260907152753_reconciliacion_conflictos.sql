-- =============================================================================
-- 053 — Reconciliación de los conflictos internos entre migraciones
-- =============================================================================
-- QUÉ CUBRE: los casos donde dos migraciones definen el mismo objeto de forma
-- distinta. Como la segunda siempre usa CREATE TABLE IF NOT EXISTS, la que
-- manda es la PRIMERA y la segunda queda en no-op — con lo cual la base fresca
-- se queda con la forma vieja, distinta de producción.
--
-- Ver docs/AUDITORIA-2026-09.md secciones 2.4 y 2.5.
--
-- Todo va guardado: sobre producción (que ya tiene la forma correcta) esta
-- migración no hace nada. Solo actúa sobre una base construida desde cero.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. distri_repo_relaciones — 039 gana sobre 040
-- ─────────────────────────────────────────────────────────────────────────────
-- La 039 la crea con CHECK ('activa','inactiva') y sin updated_at.
-- La 040 la redefine con 'terminada' y updated_at, pero su CREATE TABLE
-- IF NOT EXISTS no hace nada. Sin esto, el flujo de fin de relación falla con
-- constraint violation y los UPDATE de updated_at lanzan "column does not exist".

ALTER TABLE distri_repo_relaciones
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE distri_repo_relaciones
  DROP CONSTRAINT IF EXISTS distri_repo_relaciones_estado_check;
ALTER TABLE distri_repo_relaciones
  ADD CONSTRAINT distri_repo_relaciones_estado_check
  CHECK (estado IN ('activa', 'inactiva', 'terminada'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. distri_repo_tokens — alinear con la DB real
-- ─────────────────────────────────────────────────────────────────────────────
-- La 040 la declara con token sin DEFAULT, distri_id NOT NULL sin cascade y
-- expira_at NOT NULL sin DEFAULT. En producción los tres son distintos: el
-- token se autogenera, distri_id es nullable con ON DELETE CASCADE y expira_at
-- tiene default de 7 días. Sin el cascade, borrar una distribuidora deja
-- tokens huérfanos en vez de eliminarlos.

ALTER TABLE distri_repo_tokens
  ALTER COLUMN token SET DEFAULT encode(gen_random_bytes(32), 'hex');

ALTER TABLE distri_repo_tokens ALTER COLUMN distri_id DROP NOT NULL;

ALTER TABLE distri_repo_tokens ALTER COLUMN expira_at DROP NOT NULL;
ALTER TABLE distri_repo_tokens
  ALTER COLUMN expira_at SET DEFAULT (now() + interval '7 days');

ALTER TABLE distri_repo_tokens
  DROP CONSTRAINT IF EXISTS distri_repo_tokens_distri_id_fkey;
ALTER TABLE distri_repo_tokens
  ADD CONSTRAINT distri_repo_tokens_distri_id_fkey
  FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) ON DELETE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. campana_localidades — 032 gana sobre 041
-- ─────────────────────────────────────────────────────────────────────────────
-- La 032 la crea con PK compuesta (campana_id, localidad_id) y SIN columna id.
-- La 041 la quiere con id uuid como PK + UNIQUE(campana_id, localidad_id), que
-- es lo que hay en producción, pero su CREATE TABLE IF NOT EXISTS no corre.
-- Consecuencia concreta: las queries que hacen .select('id') sobre esta tabla
-- devuelven null.
--
-- Se hace con ALTERs y no con DROP/CREATE para no perder filas en ningún
-- escenario. Todo el bloque solo corre si falta la columna id.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'campana_localidades'
      AND column_name  = 'id'
  ) THEN
    -- Nueva PK
    ALTER TABLE campana_localidades
      ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE campana_localidades DROP CONSTRAINT campana_localidades_pkey;
    ALTER TABLE campana_localidades ADD CONSTRAINT campana_localidades_pkey
      PRIMARY KEY (id);

    -- El par pasa de PK a UNIQUE
    ALTER TABLE campana_localidades
      ADD CONSTRAINT campana_localidades_campana_id_localidad_id_key
      UNIQUE (campana_id, localidad_id);

    -- En producción las dos columnas son nullable
    ALTER TABLE campana_localidades ALTER COLUMN campana_id   DROP NOT NULL;
    ALTER TABLE campana_localidades ALTER COLUMN localidad_id DROP NOT NULL;

    -- La 032 puso ON DELETE CASCADE en localidad_id; producción no lo tiene
    ALTER TABLE campana_localidades
      DROP CONSTRAINT IF EXISTS campana_localidades_localidad_id_fkey;
    ALTER TABLE campana_localidades
      ADD CONSTRAINT campana_localidades_localidad_id_fkey
      FOREIGN KEY (localidad_id) REFERENCES localidades(id);
  END IF;
END $$;

-- Política: producción tiene solo service_role_all. La 032 dejó además una de
-- lectura pública que hay que sacar.
DROP POLICY IF EXISTS "Lectura pública de campana_localidades" ON campana_localidades;
DROP POLICY IF EXISTS "service_role_all" ON campana_localidades;
CREATE POLICY "service_role_all" ON campana_localidades FOR ALL USING (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. gondolero_localidades — alinear con la DB real
-- ─────────────────────────────────────────────────────────────────────────────
-- La 032 la crea con una columna created_at que producción no tiene, y con dos
-- políticas por gondolero. En producción la única política es service_role_all.

ALTER TABLE gondolero_localidades DROP COLUMN IF EXISTS created_at;

DROP POLICY IF EXISTS "Gondolero ve sus propias localidades"        ON gondolero_localidades;
DROP POLICY IF EXISTS "Gondolero actualiza sus propias localidades" ON gondolero_localidades;
DROP POLICY IF EXISTS "service_role_all"                            ON gondolero_localidades;
CREATE POLICY "service_role_all" ON gondolero_localidades FOR ALL USING (true);
