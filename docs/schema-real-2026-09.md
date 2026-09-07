# Schema real de Supabase — septiembre 2026

> **Fuente de verdad sobre la base de datos.** Las migraciones en
> `supabase/migrations/` están desincronizadas: varias tablas y columnas se
> crearon manualmente en el SQL Editor de Supabase entre marzo y abril de 2026 y
> nunca se versionaron. Este dump se tomó el **7 de septiembre de 2026**
> directamente de la DB de producción.
> Ante cualquier discrepancia entre este archivo y `supabase/migrations/`, **este
> archivo manda**.

## Cambios aplicados DESPUÉS de tomar este dump

Los siguientes tres cambios se ejecutaron el 7 de septiembre de 2026, después de
generar los dumps de abajo. **No están reflejados en las secciones 2 y 5.**

```sql
-- 1. Bug de desvinculación: faltaba el estado 'terminada'
ALTER TABLE gondolero_distri_solicitudes DROP CONSTRAINT gondolero_distri_solicitudes_estado_check;
ALTER TABLE gondolero_distri_solicitudes ADD CONSTRAINT gondolero_distri_solicitudes_estado_check
  CHECK (estado IN ('pendiente','aprobada','rechazada','terminada'));

ALTER TABLE fixer_repo_solicitudes DROP CONSTRAINT fixer_repo_solicitudes_estado_check;
ALTER TABLE fixer_repo_solicitudes ADD CONSTRAINT fixer_repo_solicitudes_estado_check
  CHECK (estado IN ('pendiente','aprobada','rechazada','terminada'));

-- 2. search_path fijo en los helpers SECURITY DEFINER de RLS
ALTER FUNCTION public.get_tipo_actor() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_distri_id()  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_marca_id()   SET search_path = public, pg_temp;
```

```
-- 3. Registro público CERRADO en el dashboard de Supabase
--    (Authentication → Sign In / Providers → "Allow new users to sign up" → OFF)
--    Motivo: handle_new_user() copia tipo_actor desde raw_user_meta_data sin
--    validar, así que con la anon key cualquiera podía registrarse como admin.
--    El alta desde el panel admin usa auth.admin.createUser() con service_role
--    y NO se ve afectada — verificado el 7/9/2026 creando un gondolero de prueba.
```

## Cómo se generó

```sql
-- 1. Tablas y columnas
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 2. Constraints
SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

-- 3. Políticas RLS
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 4. Índices
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' ORDER BY tablename;

-- 5. Funciones y triggers
SELECT p.proname, pg_get_functiondef(p.oid) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  AND p.proname IN ('get_tipo_actor','get_distri_id','get_marca_id',
                    'handle_updated_at','on_movimiento_puntos','avg_precio_confirmado');

SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table;
```

---

## 1. Tablas y columnas

| table_name | column_name | data_type | is_nullable | column_default |
| --- | --- | --- | --- | --- |
| alertas_ignoradas | id | uuid | NO | uuid_generate_v4() |
| alertas_ignoradas | distri_id | uuid | NO | null |
| alertas_ignoradas | tipo | text | NO | null |
| alertas_ignoradas | referencia_id | uuid | NO | null |
| alertas_ignoradas | ignorada_hasta | timestamp with time zone | NO | null |
| alertas_ignoradas | created_at | timestamp with time zone | YES | now() |
| bloque_campos | id | uuid | NO | uuid_generate_v4() |
| bloque_campos | bloque_id | uuid | NO | null |
| bloque_campos | tipo | text | NO | null |
| bloque_campos | pregunta | text | NO | null |
| bloque_campos | opciones | ARRAY | YES | null |
| bloque_campos | obligatorio | boolean | YES | false |
| bloque_campos | orden | integer | YES | 1 |
| bloque_campos | created_at | timestamp with time zone | YES | now() |
| bloques_foto | id | uuid | NO | uuid_generate_v4() |
| bloques_foto | campana_id | uuid | NO | null |
| bloques_foto | orden | integer | NO | 1 |
| bloques_foto | instruccion | text | NO | null |
| bloques_foto | tipo_contenido | text | YES | 'propios'::text |
| bloques_foto | solicitar_precio | boolean | YES | false |
| campana_localidades | id | uuid | NO | gen_random_uuid() |
| campana_localidades | campana_id | uuid | YES | null |
| campana_localidades | localidad_id | integer | YES | null |
| campana_localidades | created_at | timestamp with time zone | YES | now() |
| campana_tokens | id | uuid | NO | gen_random_uuid() |
| campana_tokens | token | text | NO | encode(gen_random_bytes(24), 'hex'::text) |
| campana_tokens | campana_id | uuid | YES | null |
| campana_tokens | distri_id | uuid | YES | null |
| campana_tokens | usado | boolean | YES | false |
| campana_tokens | expira_at | timestamp with time zone | YES | (now() + '7 days'::interval) |
| campana_tokens | created_at | timestamp with time zone | YES | now() |
| campana_tokens | repositora_id | uuid | YES | null |
| campana_zonas | campana_id | uuid | NO | null |
| campana_zonas | zona_id | uuid | NO | null |
| campanas | id | uuid | NO | uuid_generate_v4() |
| campanas | nombre | text | NO | null |
| campanas | tipo | text | NO | null |
| campanas | marca_id | uuid | YES | null |
| campanas | distri_id | uuid | YES | null |
| campanas | financiada_por | text | YES | 'marca'::text |
| campanas | estado | text | YES | 'borrador'::text |
| campanas | fecha_inicio | date | YES | null |
| campanas | fecha_fin | date | YES | null |
| campanas | fecha_limite_inscripcion | date | YES | null |
| campanas | objetivo_comercios | integer | YES | null |
| campanas | max_comercios_por_gondolero | integer | YES | 20 |
| campanas | min_comercios_para_cobrar | integer | YES | 3 |
| campanas | tope_total_comercios | integer | YES | null |
| campanas | es_abierta | boolean | YES | false |
| campanas | puntos_por_foto | integer | YES | 0 |
| campanas | instruccion | text | YES | null |
| campanas | tokens_creacion | integer | YES | 15 |
| campanas | presupuesto_tokens | integer | YES | 0 |
| campanas | fondo_resguardo_tokens | integer | YES | 0 |
| campanas | comercios_relevados | integer | YES | 0 |
| campanas | fotos_recibidas | integer | YES | 0 |
| campanas | created_at | timestamp with time zone | YES | now() |
| campanas | updated_at | timestamp with time zone | YES | now() |
| campanas | nivel_minimo | text | YES | 'casual'::text |
| campanas | via_ejecucion | text | YES | 'distribuidora'::text |
| campanas | motivo_rechazo | text | YES | null |
| campanas | draft_descripcion | text | YES | null |
| campanas | draft_zonas | jsonb | YES | null |
| campanas | draft_bounty | numeric | YES | null |
| campanas | draft_bloques | jsonb | YES | null |
| campanas | tiene_draft | boolean | YES | false |
| campanas | actor_campana | text | YES | 'gondolero'::text |
| campanas | repositora_id | uuid | YES | null |
| campanas | puntos_por_mision | integer | YES | 0 |
| canjes | id | uuid | NO | uuid_generate_v4() |
| canjes | gondolero_id | uuid | NO | null |
| canjes | premio | text | NO | null |
| canjes | puntos | integer | NO | null |
| canjes | estado | text | YES | 'pendiente'::text |
| canjes | codigo_entregado | text | YES | null |
| canjes | procesado_por | uuid | YES | null |
| canjes | created_at | timestamp with time zone | YES | now() |
| canjes | procesado_at | timestamp with time zone | YES | null |
| comercios | id | uuid | NO | uuid_generate_v4() |
| comercios | nombre | text | NO | null |
| comercios | direccion | text | YES | null |
| comercios | lat | numeric | NO | null |
| comercios | lng | numeric | NO | null |
| comercios | tipo | text | YES | 'almacen'::text |
| comercios | foto_fachada_url | text | YES | null |
| comercios | validado | boolean | YES | false |
| comercios | zona_id | uuid | YES | null |
| comercios | registrado_por | uuid | YES | null |
| comercios | created_at | timestamp with time zone | YES | now() |
| comercios | updated_at | timestamp with time zone | YES | now() |
| comercios | estado | text | YES | 'activo'::text |
| comercios | telefono | text | YES | null |
| comercios | encargado | text | YES | null |
| comercios | campana_id | uuid | YES | null |
| comercios | localidad_id | integer | YES | null |
| comercios_checks | id | uuid | NO | gen_random_uuid() |
| comercios_checks | comercio_id | uuid | YES | null |
| comercios_checks | gondolero_id | uuid | YES | null |
| comercios_checks | distri_id | uuid | YES | null |
| comercios_checks | latitud | numeric | YES | null |
| comercios_checks | longitud | numeric | YES | null |
| comercios_checks | created_at | timestamp with time zone | YES | now() |
| configuracion | id | uuid | NO | uuid_generate_v4() |
| configuracion | clave | text | NO | null |
| configuracion | valor | text | NO | null |
| configuracion | tipo | text | NO | null |
| configuracion | descripcion | text | NO | null |
| configuracion | seccion | text | NO | null |
| configuracion | updated_at | timestamp with time zone | YES | now() |
| configuracion | updated_by | uuid | YES | null |
| departamentos | id | integer | NO | nextval('departamentos_id_seq'::regclass) |
| departamentos | nombre | text | NO | null |
| departamentos | provincia_id | integer | YES | null |
| distri_repo_relaciones | id | uuid | NO | gen_random_uuid() |
| distri_repo_relaciones | distri_id | uuid | YES | null |
| distri_repo_relaciones | repositora_id | uuid | YES | null |
| distri_repo_relaciones | estado | text | YES | 'activa'::text |
| distri_repo_relaciones | created_at | timestamp with time zone | YES | now() |
| distri_repo_relaciones | updated_at | timestamp with time zone | YES | now() |
| distri_repo_tokens | id | uuid | NO | gen_random_uuid() |
| distri_repo_tokens | token | text | NO | encode(gen_random_bytes(32), 'hex'::text) |
| distri_repo_tokens | distri_id | uuid | YES | null |
| distri_repo_tokens | usado | boolean | YES | false |
| distri_repo_tokens | expira_at | timestamp with time zone | YES | (now() + '7 days'::interval) |
| distri_repo_tokens | created_at | timestamp with time zone | YES | now() |
| distribuidoras | id | uuid | NO | uuid_generate_v4() |
| distribuidoras | razon_social | text | NO | null |
| distribuidoras | cuit | text | YES | null |
| distribuidoras | tokens_disponibles | integer | YES | 0 |
| distribuidoras | validada | boolean | YES | false |
| distribuidoras | created_at | timestamp with time zone | YES | now() |
| distribuidoras | updated_at | timestamp with time zone | YES | now() |
| errores_reportados | id | uuid | NO | uuid_generate_v4() |
| errores_reportados | usuario_id | uuid | YES | null |
| errores_reportados | tipo_actor | text | YES | null |
| errores_reportados | url | text | NO | null |
| errores_reportados | descripcion | text | YES | null |
| errores_reportados | error_tecnico | text | YES | null |
| errores_reportados | contexto | jsonb | YES | null |
| errores_reportados | estado | text | YES | 'nuevo'::text |
| errores_reportados | created_at | timestamp with time zone | YES | now() |
| fixer_distri_solicitudes | id | uuid | NO | gen_random_uuid() |
| fixer_distri_solicitudes | fixer_id | uuid | YES | null |
| fixer_distri_solicitudes | distri_id | uuid | YES | null |
| fixer_distri_solicitudes | estado | text | YES | 'pendiente'::text |
| fixer_distri_solicitudes | iniciado_por | text | YES | 'distri'::text |
| fixer_distri_solicitudes | created_at | timestamp with time zone | YES | now() |
| fixer_distri_solicitudes | updated_at | timestamp with time zone | YES | now() |
| fixer_invitacion_tokens | id | uuid | NO | gen_random_uuid() |
| fixer_invitacion_tokens | token | text | NO | null |
| fixer_invitacion_tokens | tipo | text | NO | null |
| fixer_invitacion_tokens | actor_id | uuid | NO | null |
| fixer_invitacion_tokens | usado | boolean | YES | false |
| fixer_invitacion_tokens | expira_at | timestamp with time zone | NO | null |
| fixer_invitacion_tokens | created_at | timestamp with time zone | YES | now() |
| fixer_repo_solicitudes | id | uuid | NO | gen_random_uuid() |
| fixer_repo_solicitudes | fixer_id | uuid | YES | null |
| fixer_repo_solicitudes | repositora_id | uuid | YES | null |
| fixer_repo_solicitudes | estado | text | YES | 'pendiente'::text |
| fixer_repo_solicitudes | created_at | timestamp with time zone | YES | now() |
| fixer_repo_solicitudes | updated_at | timestamp with time zone | YES | now() |
| foto_respuestas | id | uuid | NO | uuid_generate_v4() |
| foto_respuestas | foto_id | uuid | NO | null |
| foto_respuestas | campo_id | uuid | NO | null |
| foto_respuestas | valor | jsonb | NO | null |
| foto_respuestas | created_at | timestamp with time zone | YES | now() |
| fotos | id | uuid | NO | uuid_generate_v4() |
| fotos | campana_id | uuid | NO | null |
| fotos | bloque_id | uuid | NO | null |
| fotos | gondolero_id | uuid | NO | null |
| fotos | comercio_id | uuid | NO | null |
| fotos | url | text | NO | null |
| fotos | storage_path | text | NO | null |
| fotos | lat | numeric | NO | null |
| fotos | lng | numeric | NO | null |
| fotos | timestamp_dispositivo | timestamp with time zone | YES | null |
| fotos | device_id | text | YES | null |
| fotos | declaracion | text | YES | null |
| fotos | precio_detectado | numeric | YES | null |
| fotos | precio_confirmado | numeric | YES | null |
| fotos | estado | text | YES | 'pendiente'::text |
| fotos | motivo_rechazo | text | YES | null |
| fotos | puntos_otorgados | integer | YES | 0 |
| fotos | ia_confianza | numeric | YES | null |
| fotos | ia_procesada | boolean | YES | false |
| fotos | es_antes | boolean | YES | false |
| fotos | par_foto_id | uuid | YES | null |
| fotos | blur_score | numeric | YES | null |
| fotos | created_at | timestamp with time zone | YES | now() |
| fotos | updated_at | timestamp with time zone | YES | now() |
| fotos | bounty_estado | text | YES | 'acreditado'::text |
| fotos | mision_id | uuid | YES | null |
| geography_columns | f_table_catalog | name | YES | null |
| geography_columns | f_table_schema | name | YES | null |
| geography_columns | f_table_name | name | YES | null |
| geography_columns | f_geography_column | name | YES | null |
| geography_columns | coord_dimension | integer | YES | null |
| geography_columns | srid | integer | YES | null |
| geography_columns | type | text | YES | null |
| geometry_columns | f_table_catalog | character varying | YES | null |
| geometry_columns | f_table_schema | name | YES | null |
| geometry_columns | f_table_name | name | YES | null |
| geometry_columns | f_geometry_column | name | YES | null |
| geometry_columns | coord_dimension | integer | YES | null |
| geometry_columns | srid | integer | YES | null |
| geometry_columns | type | character varying | YES | null |
| gondolero_distri_solicitudes | id | uuid | NO | uuid_generate_v4() |
| gondolero_distri_solicitudes | gondolero_id | uuid | NO | null |
| gondolero_distri_solicitudes | distri_id | uuid | NO | null |
| gondolero_distri_solicitudes | estado | text | YES | 'pendiente'::text |
| gondolero_distri_solicitudes | mensaje | text | YES | null |
| gondolero_distri_solicitudes | created_at | timestamp with time zone | YES | now() |
| gondolero_distri_solicitudes | updated_at | timestamp with time zone | YES | now() |
| gondolero_distri_solicitudes | iniciado_por | text | YES | 'gondolero'::text |
| gondolero_localidades | gondolero_id | uuid | NO | null |
| gondolero_localidades | localidad_id | integer | NO | null |
| gondolero_logros | id | uuid | NO | uuid_generate_v4() |
| gondolero_logros | gondolero_id | uuid | NO | null |
| gondolero_logros | logro_clave | text | NO | null |
| gondolero_logros | desbloqueado_at | timestamp with time zone | YES | now() |
| gondolero_logros | frase_mostrada | text | YES | null |
| gondolero_logros | visto | boolean | YES | false |
| gondolero_zonas | gondolero_id | uuid | NO | null |
| gondolero_zonas | zona_id | uuid | NO | null |
| localidades | id | integer | NO | nextval('localidades_id_seq'::regclass) |
| localidades | nombre | text | NO | null |
| localidades | departamento_id | integer | YES | null |
| localidades | provincia_id | integer | YES | null |
| logros | id | uuid | NO | uuid_generate_v4() |
| logros | clave | text | NO | null |
| logros | nombre | text | NO | null |
| logros | descripcion | text | NO | null |
| logros | emoji | text | NO | null |
| logros | frases | ARRAY | NO | null |
| logros | created_at | timestamp with time zone | YES | now() |
| marca_distri_relaciones | id | uuid | NO | uuid_generate_v4() |
| marca_distri_relaciones | marca_id | uuid | NO | null |
| marca_distri_relaciones | distri_id | uuid | NO | null |
| marca_distri_relaciones | estado | text | YES | 'pendiente'::text |
| marca_distri_relaciones | iniciado_por | text | YES | null |
| marca_distri_relaciones | acepto_tyc_marca | boolean | YES | false |
| marca_distri_relaciones | acepto_tyc_distri | boolean | YES | false |
| marca_distri_relaciones | created_at | timestamp with time zone | YES | now() |
| marca_distri_relaciones | updated_at | timestamp with time zone | YES | now() |
| marca_distri_relaciones | fecha_fin | timestamp with time zone | YES | null |
| marca_distri_relaciones | fecha_reinicio | timestamp with time zone | YES | null |
| marca_distri_tokens | id | uuid | NO | uuid_generate_v4() |
| marca_distri_tokens | token | text | NO | null |
| marca_distri_tokens | marca_id | uuid | YES | null |
| marca_distri_tokens | distri_id | uuid | YES | null |
| marca_distri_tokens | usado | boolean | YES | false |
| marca_distri_tokens | expira_at | timestamp with time zone | NO | null |
| marca_distri_tokens | created_at | timestamp with time zone | YES | now() |
| marca_distri_tokens | iniciado_por | text | YES | null |
| marca_repo_relaciones | id | uuid | NO | gen_random_uuid() |
| marca_repo_relaciones | marca_id | uuid | YES | null |
| marca_repo_relaciones | repositora_id | uuid | YES | null |
| marca_repo_relaciones | estado | text | YES | 'activa'::text |
| marca_repo_relaciones | created_at | timestamp with time zone | YES | now() |
| marca_repo_relaciones | fecha_fin | timestamp with time zone | YES | null |
| marca_repo_relaciones | updated_at | timestamp with time zone | YES | now() |
| marca_repo_tokens | id | uuid | NO | gen_random_uuid() |
| marca_repo_tokens | token | text | NO | null |
| marca_repo_tokens | marca_id | uuid | NO | null |
| marca_repo_tokens | usado | boolean | YES | false |
| marca_repo_tokens | expira_at | timestamp with time zone | NO | null |
| marca_repo_tokens | created_at | timestamp with time zone | YES | now() |
| marcas | id | uuid | NO | uuid_generate_v4() |
| marcas | razon_social | text | NO | null |
| marcas | cuit | text | YES | null |
| marcas | tokens_disponibles | integer | YES | 0 |
| marcas | fondo_resguardo | integer | YES | 0 |
| marcas | validada | boolean | YES | false |
| marcas | created_at | timestamp with time zone | YES | now() |
| marcas | updated_at | timestamp with time zone | YES | now() |
| mensajes_campana | id | uuid | NO | uuid_generate_v4() |
| mensajes_campana | campana_id | uuid | NO | null |
| mensajes_campana | remitente_id | uuid | NO | null |
| mensajes_campana | remitente_tipo | text | NO | null |
| mensajes_campana | tipo | text | NO | null |
| mensajes_campana | contenido | text | NO | null |
| mensajes_campana | publicado | boolean | YES | false |
| mensajes_campana | pregunta_id | uuid | YES | null |
| mensajes_campana | created_at | timestamp with time zone | YES | now() |
| mision_respuestas | id | uuid | NO | gen_random_uuid() |
| mision_respuestas | mision_id | uuid | NO | null |
| mision_respuestas | campo_id | uuid | NO | null |
| mision_respuestas | valor | jsonb | YES | null |
| mision_respuestas | created_at | timestamp with time zone | YES | now() |
| misiones | id | uuid | NO | gen_random_uuid() |
| misiones | campana_id | uuid | YES | null |
| misiones | comercio_id | uuid | YES | null |
| misiones | gondolero_id | uuid | YES | null |
| misiones | estado | text | YES | 'pendiente'::text |
| misiones | puntos_total | numeric | YES | 0 |
| misiones | bounty_estado | text | YES | 'retenido'::text |
| misiones | created_at | timestamp with time zone | YES | now() |
| misiones | updated_at | timestamp with time zone | YES | now() |
| movimientos_puntos | id | uuid | NO | uuid_generate_v4() |
| movimientos_puntos | gondolero_id | uuid | NO | null |
| movimientos_puntos | tipo | text | NO | null |
| movimientos_puntos | monto | integer | NO | null |
| movimientos_puntos | concepto | text | NO | null |
| movimientos_puntos | campana_id | uuid | YES | null |
| movimientos_puntos | foto_id | uuid | YES | null |
| movimientos_puntos | created_at | timestamp with time zone | YES | now() |
| movimientos_tokens | id | uuid | NO | uuid_generate_v4() |
| movimientos_tokens | actor_id | uuid | NO | null |
| movimientos_tokens | actor_tipo | text | NO | null |
| movimientos_tokens | tipo | text | NO | null |
| movimientos_tokens | monto | integer | NO | null |
| movimientos_tokens | concepto | text | NO | null |
| movimientos_tokens | campana_id | uuid | YES | null |
| movimientos_tokens | created_at | timestamp with time zone | YES | now() |
| notificaciones | id | uuid | NO | uuid_generate_v4() |
| notificaciones | gondolero_id | uuid | YES | null |
| notificaciones | tipo | text | NO | null |
| notificaciones | titulo | text | NO | null |
| notificaciones | mensaje | text | NO | null |
| notificaciones | leida | boolean | YES | false |
| notificaciones | foto_id | uuid | YES | null |
| notificaciones | campana_id | uuid | YES | null |
| notificaciones | created_at | timestamp with time zone | YES | now() |
| notificaciones | actor_id | uuid | YES | null |
| notificaciones | actor_tipo | text | YES | null |
| notificaciones | link_destino | text | YES | null |
| participaciones | id | uuid | NO | uuid_generate_v4() |
| participaciones | campana_id | uuid | NO | null |
| participaciones | gondolero_id | uuid | NO | null |
| participaciones | estado | text | YES | 'activa'::text |
| participaciones | comercios_completados | integer | YES | 0 |
| participaciones | puntos_acumulados | integer | YES | 0 |
| participaciones | joined_at | timestamp with time zone | YES | now() |
| participaciones | updated_at | timestamp with time zone | YES | now() |
| profiles | id | uuid | NO | null |
| profiles | tipo_actor | text | NO | null |
| profiles | nombre | text | YES | null |
| profiles | alias | text | YES | null |
| profiles | celular | text | YES | null |
| profiles | nivel | text | YES | 'casual'::text |
| profiles | puntos_disponibles | integer | YES | 0 |
| profiles | puntos_totales_ganados | integer | YES | 0 |
| profiles | distri_id | uuid | YES | null |
| profiles | marca_id | uuid | YES | null |
| profiles | monotributo_verificado | boolean | YES | false |
| profiles | fotos_aprobadas | integer | YES | 0 |
| profiles | tasa_aprobacion | numeric | YES | 100.00 |
| profiles | activo | boolean | YES | true |
| profiles | created_at | timestamp with time zone | YES | now() |
| profiles | updated_at | timestamp with time zone | YES | now() |
| profiles | codigo_gondolero | text | YES | null |
| profiles | repositora_id | uuid | YES | null |
| provincias | id | integer | NO | nextval('provincias_id_seq'::regclass) |
| provincias | nombre | text | NO | null |
| relacion_reinicio_solicitudes | id | uuid | NO | uuid_generate_v4() |
| relacion_reinicio_solicitudes | relacion_id | uuid | NO | null |
| relacion_reinicio_solicitudes | solicitado_por | text | NO | null |
| relacion_reinicio_solicitudes | estado | text | NO | 'pendiente'::text |
| relacion_reinicio_solicitudes | acepto_tyc | boolean | YES | false |
| relacion_reinicio_solicitudes | created_at | timestamp with time zone | YES | now() |
| relacion_reinicio_solicitudes | updated_at | timestamp with time zone | YES | now() |
| repositoras | id | uuid | NO | gen_random_uuid() |
| repositoras | razon_social | text | NO | null |
| repositoras | cuit | text | YES | null |
| repositoras | validada | boolean | YES | false |
| repositoras | created_at | timestamp with time zone | YES | now() |
| repositoras | updated_at | timestamp with time zone | YES | now() |
| spatial_ref_sys | srid | integer | NO | null |
| spatial_ref_sys | auth_name | character varying | YES | null |
| spatial_ref_sys | auth_srid | integer | YES | null |
| spatial_ref_sys | srtext | character varying | YES | null |
| spatial_ref_sys | proj4text | character varying | YES | null |
| vinculacion_tokens | id | uuid | NO | uuid_generate_v4() |
| vinculacion_tokens | token | text | NO | null |
| vinculacion_tokens | distri_id | uuid | NO | null |
| vinculacion_tokens | tipo | text | YES | 'distri_invita'::text |
| vinculacion_tokens | usado | boolean | YES | false |
| vinculacion_tokens | gondolero_id | uuid | YES | null |
| vinculacion_tokens | expira_at | timestamp with time zone | NO | null |
| vinculacion_tokens | created_at | timestamp with time zone | YES | now() |
| zonas | id | uuid | NO | uuid_generate_v4() |
| zonas | nombre | text | NO | null |
| zonas | tipo | text | NO | null |
| zonas | lat | numeric | YES | null |
| zonas | lng | numeric | YES | null |
| zonas | created_at | timestamp with time zone | YES | now() |

---

## 2. Constraints

> Recordá: los CHECK de `gondolero_distri_solicitudes.estado` y
> `fixer_repo_solicitudes.estado` YA fueron actualizados para incluir
> `'terminada'` después de tomar este dump.

| tabla | conname | definicion |
| --- | --- | --- |
| alertas_ignoradas | alertas_ignoradas_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| alertas_ignoradas | alertas_ignoradas_pkey | PRIMARY KEY (id) |
| alertas_ignoradas | alertas_ignoradas_tipo_check | CHECK ((tipo = ANY (ARRAY['quiebre_stock'::text, 'sin_visita'::text, 'campana_riesgo'::text, 'gondolero_inactivo'::text]))) |
| alertas_ignoradas | alertas_ignoradas_unique | UNIQUE (distri_id, tipo, referencia_id) |
| bloque_campos | bloque_campos_bloque_id_fkey | FOREIGN KEY (bloque_id) REFERENCES bloques_foto(id) ON DELETE CASCADE |
| bloque_campos | bloque_campos_pkey | PRIMARY KEY (id) |
| bloque_campos | bloque_campos_tipo_check | CHECK ((tipo = ANY (ARRAY['seleccion_multiple'::text, 'seleccion_unica'::text, 'binaria'::text, 'numero'::text, 'texto'::text, 'foto'::text]))) |
| bloques_foto | bloques_foto_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| bloques_foto | bloques_foto_pkey | PRIMARY KEY (id) |
| bloques_foto | bloques_foto_tipo_contenido_check | CHECK ((tipo_contenido = ANY (ARRAY['propios'::text, 'competencia'::text, 'ambos'::text, 'ninguno'::text]))) |
| campana_localidades | campana_localidades_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| campana_localidades | campana_localidades_campana_id_localidad_id_key | UNIQUE (campana_id, localidad_id) |
| campana_localidades | campana_localidades_localidad_id_fkey | FOREIGN KEY (localidad_id) REFERENCES localidades(id) |
| campana_localidades | campana_localidades_pkey | PRIMARY KEY (id) |
| campana_tokens | campana_tokens_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| campana_tokens | campana_tokens_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| campana_tokens | campana_tokens_pkey | PRIMARY KEY (id) |
| campana_tokens | campana_tokens_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) ON DELETE CASCADE |
| campana_tokens | campana_tokens_token_key | UNIQUE (token) |
| campana_zonas | campana_zonas_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| campana_zonas | campana_zonas_pkey | PRIMARY KEY (campana_id, zona_id) |
| campana_zonas | campana_zonas_zona_id_fkey | FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE CASCADE |
| campanas | campanas_actor_campana_check | CHECK ((actor_campana = ANY (ARRAY['gondolero'::text, 'fixer'::text]))) |
| campanas | campanas_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| campanas | campanas_estado_check | CHECK ((estado = ANY (ARRAY['borrador'::text, 'pendiente_aprobacion'::text, 'activa'::text, 'pausada'::text, 'cerrada'::text, 'pendiente_cambios'::text]))) |
| campanas | campanas_financiada_por_check | CHECK ((financiada_por = ANY (ARRAY['marca'::text, 'distri'::text, 'gondolapp'::text, 'repositora'::text]))) |
| campanas | campanas_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) |
| campanas | campanas_nivel_minimo_check | CHECK ((nivel_minimo = ANY (ARRAY['casual'::text, 'activo'::text, 'pro'::text]))) |
| campanas | campanas_pkey | PRIMARY KEY (id) |
| campanas | campanas_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) |
| campanas | campanas_tipo_check | CHECK ((tipo = ANY (ARRAY['relevamiento'::text, 'precio'::text, 'cobertura'::text, 'pop'::text, 'mapa'::text, 'comercios'::text, 'interna'::text]))) |
| campanas | campanas_via_ejecucion_check | CHECK ((via_ejecucion = ANY (ARRAY['distribuidora'::text, 'gondolapp'::text, 'repositora'::text]))) |
| canjes | canjes_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'procesado'::text, 'entregado'::text, 'fallido'::text]))) |
| canjes | canjes_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| canjes | canjes_pkey | PRIMARY KEY (id) |
| canjes | canjes_premio_check | CHECK ((premio = ANY (ARRAY['nafta_ypf'::text, 'giftcard_ml'::text, 'credito_celular'::text, 'transferencia'::text]))) |
| canjes | canjes_procesado_por_fkey | FOREIGN KEY (procesado_por) REFERENCES profiles(id) |
| canjes | canjes_puntos_check | CHECK ((puntos > 0)) |
| comercios | comercios_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| comercios | comercios_estado_check | CHECK ((estado = ANY (ARRAY['activo'::text, 'pendiente_validacion'::text, 'rechazado'::text]))) |
| comercios | comercios_localidad_id_fkey | FOREIGN KEY (localidad_id) REFERENCES localidades(id) |
| comercios | comercios_pkey | PRIMARY KEY (id) |
| comercios | comercios_registrado_por_fkey | FOREIGN KEY (registrado_por) REFERENCES profiles(id) |
| comercios | comercios_tipo_check | CHECK ((tipo = ANY (ARRAY['almacen'::text, 'kiosco'::text, 'autoservicio'::text, 'dietetica'::text, 'mayorista'::text, 'otro'::text]))) |
| comercios | comercios_zona_id_fkey | FOREIGN KEY (zona_id) REFERENCES zonas(id) |
| comercios_checks | comercios_checks_comercio_id_fkey | FOREIGN KEY (comercio_id) REFERENCES comercios(id) ON DELETE CASCADE |
| comercios_checks | comercios_checks_comercio_id_gondolero_id_key | UNIQUE (comercio_id, gondolero_id) |
| comercios_checks | comercios_checks_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| comercios_checks | comercios_checks_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| comercios_checks | comercios_checks_pkey | PRIMARY KEY (id) |
| configuracion | configuracion_clave_key | UNIQUE (clave) |
| configuracion | configuracion_pkey | PRIMARY KEY (id) |
| configuracion | configuracion_seccion_check | CHECK ((seccion = ANY (ARRAY['fotos'::text, 'gps'::text, 'economia'::text, 'niveles'::text, 'operacion'::text]))) |
| configuracion | configuracion_tipo_check | CHECK ((tipo = ANY (ARRAY['numero'::text, 'booleano'::text, 'texto'::text]))) |
| configuracion | configuracion_updated_by_fkey | FOREIGN KEY (updated_by) REFERENCES profiles(id) |
| departamentos | departamentos_nombre_provincia_id_key | UNIQUE (nombre, provincia_id) |
| departamentos | departamentos_pkey | PRIMARY KEY (id) |
| departamentos | departamentos_provincia_id_fkey | FOREIGN KEY (provincia_id) REFERENCES provincias(id) |
| distri_repo_relaciones | distri_repo_relaciones_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| distri_repo_relaciones | distri_repo_relaciones_distri_id_repositora_id_key | UNIQUE (distri_id, repositora_id) |
| distri_repo_relaciones | distri_repo_relaciones_estado_check | CHECK ((estado = ANY (ARRAY['activa'::text, 'inactiva'::text, 'terminada'::text]))) |
| distri_repo_relaciones | distri_repo_relaciones_pkey | PRIMARY KEY (id) |
| distri_repo_relaciones | distri_repo_relaciones_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) |
| distri_repo_tokens | distri_repo_tokens_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) ON DELETE CASCADE |
| distri_repo_tokens | distri_repo_tokens_pkey | PRIMARY KEY (id) |
| distri_repo_tokens | distri_repo_tokens_token_key | UNIQUE (token) |
| distribuidoras | distribuidoras_cuit_key | UNIQUE (cuit) |
| distribuidoras | distribuidoras_pkey | PRIMARY KEY (id) |
| distribuidoras | distribuidoras_tokens_disponibles_check | CHECK ((tokens_disponibles >= 0)) |
| errores_reportados | errores_reportados_estado_check | CHECK ((estado = ANY (ARRAY['nuevo'::text, 'revisado'::text, 'resuelto'::text, 'descartado'::text]))) |
| errores_reportados | errores_reportados_pkey | PRIMARY KEY (id) |
| errores_reportados | errores_reportados_usuario_id_fkey | FOREIGN KEY (usuario_id) REFERENCES profiles(id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'terminada'::text]))) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_fixer_id_distri_id_key | UNIQUE (fixer_id, distri_id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_fixer_id_fkey | FOREIGN KEY (fixer_id) REFERENCES profiles(id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_iniciado_por_check | CHECK ((iniciado_por = ANY (ARRAY['fixer'::text, 'distri'::text]))) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_pkey | PRIMARY KEY (id) |
| fixer_invitacion_tokens | fixer_invitacion_tokens_pkey | PRIMARY KEY (id) |
| fixer_invitacion_tokens | fixer_invitacion_tokens_tipo_check | CHECK ((tipo = ANY (ARRAY['distri'::text, 'repositora'::text]))) |
| fixer_invitacion_tokens | fixer_invitacion_tokens_token_key | UNIQUE (token) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text]))) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_fixer_id_fkey | FOREIGN KEY (fixer_id) REFERENCES profiles(id) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_fixer_id_repositora_id_key | UNIQUE (fixer_id, repositora_id) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_pkey | PRIMARY KEY (id) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) |
| foto_respuestas | foto_respuestas_campo_id_fkey | FOREIGN KEY (campo_id) REFERENCES bloque_campos(id) ON DELETE CASCADE |
| foto_respuestas | foto_respuestas_foto_id_campo_id_key | UNIQUE (foto_id, campo_id) |
| foto_respuestas | foto_respuestas_foto_id_fkey | FOREIGN KEY (foto_id) REFERENCES fotos(id) ON DELETE CASCADE |
| foto_respuestas | foto_respuestas_pkey | PRIMARY KEY (id) |
| fotos | fotos_bloque_id_fkey | FOREIGN KEY (bloque_id) REFERENCES bloques_foto(id) |
| fotos | fotos_bounty_estado_check | CHECK ((bounty_estado = ANY (ARRAY['acreditado'::text, 'retenido'::text, 'anulado'::text]))) |
| fotos | fotos_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| fotos | fotos_comercio_id_fkey | FOREIGN KEY (comercio_id) REFERENCES comercios(id) |
| fotos | fotos_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'en_revision'::text, 'archivada'::text]))) |
| fotos | fotos_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| fotos | fotos_mision_id_fkey | FOREIGN KEY (mision_id) REFERENCES misiones(id) |
| fotos | fotos_par_foto_id_fkey | FOREIGN KEY (par_foto_id) REFERENCES fotos(id) |
| fotos | fotos_pkey | PRIMARY KEY (id) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) ON DELETE CASCADE |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text]))) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_gondolero_id_distri_id_key | UNIQUE (gondolero_id, distri_id) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_iniciado_por_check | CHECK ((iniciado_por = ANY (ARRAY['gondolero'::text, 'distri'::text]))) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_pkey | PRIMARY KEY (id) |
| gondolero_localidades | gondolero_localidades_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| gondolero_localidades | gondolero_localidades_localidad_id_fkey | FOREIGN KEY (localidad_id) REFERENCES localidades(id) ON DELETE CASCADE |
| gondolero_localidades | gondolero_localidades_pkey | PRIMARY KEY (gondolero_id, localidad_id) |
| gondolero_logros | gondolero_logros_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| gondolero_logros | gondolero_logros_gondolero_id_logro_clave_key | UNIQUE (gondolero_id, logro_clave) |
| gondolero_logros | gondolero_logros_logro_clave_fkey | FOREIGN KEY (logro_clave) REFERENCES logros(clave) |
| gondolero_logros | gondolero_logros_pkey | PRIMARY KEY (id) |
| gondolero_zonas | gondolero_zonas_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| gondolero_zonas | gondolero_zonas_pkey | PRIMARY KEY (gondolero_id, zona_id) |
| gondolero_zonas | gondolero_zonas_zona_id_fkey | FOREIGN KEY (zona_id) REFERENCES zonas(id) ON DELETE CASCADE |
| localidades | localidades_departamento_id_fkey | FOREIGN KEY (departamento_id) REFERENCES departamentos(id) |
| localidades | localidades_nombre_departamento_id_key | UNIQUE (nombre, departamento_id) |
| localidades | localidades_pkey | PRIMARY KEY (id) |
| localidades | localidades_provincia_id_fkey | FOREIGN KEY (provincia_id) REFERENCES provincias(id) |
| logros | logros_clave_key | UNIQUE (clave) |
| logros | logros_pkey | PRIMARY KEY (id) |
| marca_distri_relaciones | marca_distri_relaciones_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) ON DELETE CASCADE |
| marca_distri_relaciones | marca_distri_relaciones_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'activa'::text, 'pausada'::text, 'terminada'::text]))) |
| marca_distri_relaciones | marca_distri_relaciones_iniciado_por_check | CHECK ((iniciado_por = ANY (ARRAY['marca'::text, 'distri'::text]))) |
| marca_distri_relaciones | marca_distri_relaciones_marca_id_distri_id_key | UNIQUE (marca_id, distri_id) |
| marca_distri_relaciones | marca_distri_relaciones_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) ON DELETE CASCADE |
| marca_distri_relaciones | marca_distri_relaciones_pkey | PRIMARY KEY (id) |
| marca_distri_tokens | marca_distri_tokens_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| marca_distri_tokens | marca_distri_tokens_iniciado_por_check | CHECK ((iniciado_por = ANY (ARRAY['marca'::text, 'distri'::text]))) |
| marca_distri_tokens | marca_distri_tokens_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) |
| marca_distri_tokens | marca_distri_tokens_pkey | PRIMARY KEY (id) |
| marca_distri_tokens | marca_distri_tokens_token_key | UNIQUE (token) |
| marca_repo_relaciones | marca_repo_relaciones_estado_check | CHECK ((estado = ANY (ARRAY['activa'::text, 'inactiva'::text, 'terminada'::text]))) |
| marca_repo_relaciones | marca_repo_relaciones_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) |
| marca_repo_relaciones | marca_repo_relaciones_marca_id_repositora_id_key | UNIQUE (marca_id, repositora_id) |
| marca_repo_relaciones | marca_repo_relaciones_pkey | PRIMARY KEY (id) |
| marca_repo_relaciones | marca_repo_relaciones_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) |
| marca_repo_tokens | marca_repo_tokens_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) |
| marca_repo_tokens | marca_repo_tokens_pkey | PRIMARY KEY (id) |
| marca_repo_tokens | marca_repo_tokens_token_key | UNIQUE (token) |
| marcas | marcas_cuit_key | UNIQUE (cuit) |
| marcas | marcas_fondo_resguardo_check | CHECK ((fondo_resguardo >= 0)) |
| marcas | marcas_pkey | PRIMARY KEY (id) |
| marcas | marcas_tokens_disponibles_check | CHECK ((tokens_disponibles >= 0)) |
| mensajes_campana | mensajes_campana_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| mensajes_campana | mensajes_campana_pkey | PRIMARY KEY (id) |
| mensajes_campana | mensajes_campana_pregunta_id_fkey | FOREIGN KEY (pregunta_id) REFERENCES mensajes_campana(id) |
| mensajes_campana | mensajes_campana_remitente_id_fkey | FOREIGN KEY (remitente_id) REFERENCES profiles(id) |
| mensajes_campana | mensajes_campana_remitente_tipo_check | CHECK ((remitente_tipo = ANY (ARRAY['marca'::text, 'distribuidora'::text]))) |
| mensajes_campana | mensajes_campana_tipo_check | CHECK ((tipo = ANY (ARRAY['broadcast'::text, 'pregunta'::text, 'respuesta'::text]))) |
| mision_respuestas | mision_respuestas_mision_id_fkey | FOREIGN KEY (mision_id) REFERENCES misiones(id) ON DELETE CASCADE |
| mision_respuestas | mision_respuestas_pkey | PRIMARY KEY (id) |
| misiones | misiones_bounty_estado_check | CHECK ((bounty_estado = ANY (ARRAY['acreditado'::text, 'retenido'::text, 'anulado'::text]))) |
| misiones | misiones_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| misiones | misiones_comercio_id_fkey | FOREIGN KEY (comercio_id) REFERENCES comercios(id) |
| misiones | misiones_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'parcial'::text]))) |
| misiones | misiones_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| misiones | misiones_pkey | PRIMARY KEY (id) |
| movimientos_puntos | movimientos_puntos_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| movimientos_puntos | movimientos_puntos_foto_id_fkey | FOREIGN KEY (foto_id) REFERENCES fotos(id) |
| movimientos_puntos | movimientos_puntos_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| movimientos_puntos | movimientos_puntos_monto_check | CHECK ((monto > 0)) |
| movimientos_puntos | movimientos_puntos_pkey | PRIMARY KEY (id) |
| movimientos_puntos | movimientos_puntos_tipo_check | CHECK ((tipo = ANY (ARRAY['credito'::text, 'debito'::text]))) |
| movimientos_tokens | movimientos_tokens_actor_tipo_check | CHECK ((actor_tipo = ANY (ARRAY['marca'::text, 'distribuidora'::text]))) |
| movimientos_tokens | movimientos_tokens_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| movimientos_tokens | movimientos_tokens_pkey | PRIMARY KEY (id) |
| movimientos_tokens | movimientos_tokens_tipo_check | CHECK ((tipo = ANY (ARRAY['compra'::text, 'consumo'::text, 'bloqueo'::text, 'liberacion'::text, 'devolucion'::text]))) |
| notificaciones | notificaciones_actor_tipo_check | CHECK ((actor_tipo = ANY (ARRAY['gondolero'::text, 'marca'::text, 'distribuidora'::text, 'admin'::text]))) |
| notificaciones | notificaciones_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) |
| notificaciones | notificaciones_foto_id_fkey | FOREIGN KEY (foto_id) REFERENCES fotos(id) |
| notificaciones | notificaciones_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| notificaciones | notificaciones_pkey | PRIMARY KEY (id) |
| notificaciones | notificaciones_tipo_check | CHECK ((tipo = ANY (ARRAY['foto_aprobada', 'foto_rechazada', 'nivel_subido', 'mision_aprobada', 'puntos_acreditados', 'nueva_campana_disponible', 'comercio_validado', 'campana_aprobada', 'campana_rechazada', 'nueva_mision_recibida', 'campana_por_vencer', 'nueva_distribuidora_vinculada', 'distribuidora_termino_relacion', 'campana_marca_pendiente', 'gondolero_solicitud_vinculacion', 'gondolero_completo_mision', 'comercio_pendiente_validacion', 'marca_solicitud_reinicio_relacion', 'campana_por_vencer_distri', 'admin_campana_pendiente', 'admin_comercio_pendiente', 'admin_error_reportado', 'solicitud_aprobada', 'solicitud_rechazada', 'desvinculacion_distri', 'cambios_solicitados']::text[])) |
| participaciones | participaciones_campana_id_fkey | FOREIGN KEY (campana_id) REFERENCES campanas(id) ON DELETE CASCADE |
| participaciones | participaciones_campana_id_gondolero_id_key | UNIQUE (campana_id, gondolero_id) |
| participaciones | participaciones_estado_check | CHECK ((estado = ANY (ARRAY['activa'::text, 'completada'::text, 'abandonada'::text]))) |
| participaciones | participaciones_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) ON DELETE CASCADE |
| participaciones | participaciones_pkey | PRIMARY KEY (id) |
| profiles | profiles_codigo_gondolero_key | UNIQUE (codigo_gondolero) |
| profiles | profiles_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| profiles | profiles_id_fkey | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE |
| profiles | profiles_marca_id_fkey | FOREIGN KEY (marca_id) REFERENCES marcas(id) |
| profiles | profiles_nivel_check | CHECK ((nivel = ANY (ARRAY['casual'::text, 'activo'::text, 'pro'::text]))) |
| profiles | profiles_pkey | PRIMARY KEY (id) |
| profiles | profiles_puntos_disponibles_check | CHECK ((puntos_disponibles >= 0)) |
| profiles | profiles_repositora_id_fkey | FOREIGN KEY (repositora_id) REFERENCES repositoras(id) |
| profiles | profiles_tipo_actor_check | CHECK ((tipo_actor = ANY (ARRAY['gondolero'::text, 'fixer'::text, 'distribuidora'::text, 'marca'::text, 'admin'::text, 'repositora'::text]))) |
| provincias | provincias_nombre_key | UNIQUE (nombre) |
| provincias | provincias_pkey | PRIMARY KEY (id) |
| relacion_reinicio_solicitudes | relacion_reinicio_solicitudes_estado_check | CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text]))) |
| relacion_reinicio_solicitudes | relacion_reinicio_solicitudes_pkey | PRIMARY KEY (id) |
| relacion_reinicio_solicitudes | relacion_reinicio_solicitudes_relacion_id_fkey | FOREIGN KEY (relacion_id) REFERENCES marca_distri_relaciones(id) ON DELETE CASCADE |
| relacion_reinicio_solicitudes | relacion_reinicio_solicitudes_solicitado_por_check | CHECK ((solicitado_por = ANY (ARRAY['marca'::text, 'distri'::text]))) |
| repositoras | repositoras_pkey | PRIMARY KEY (id) |
| spatial_ref_sys | spatial_ref_sys_pkey | PRIMARY KEY (srid) |
| spatial_ref_sys | spatial_ref_sys_srid_check | CHECK (((srid > 0) AND (srid <= 998999))) |
| vinculacion_tokens | vinculacion_tokens_distri_id_fkey | FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) |
| vinculacion_tokens | vinculacion_tokens_gondolero_id_fkey | FOREIGN KEY (gondolero_id) REFERENCES profiles(id) |
| vinculacion_tokens | vinculacion_tokens_pkey | PRIMARY KEY (id) |
| vinculacion_tokens | vinculacion_tokens_token_key | UNIQUE (token) |
| zonas | zonas_pkey | PRIMARY KEY (id) |
| zonas | zonas_tipo_check | CHECK ((tipo = ANY (ARRAY['ciudad'::text, 'provincia'::text, 'region'::text]))) |

---

## 3. Políticas RLS

> **Atención a la columna `roles`.** Las políticas llamadas `service_role_all`
> están casi todas declaradas `TO {public}`, no `TO {service_role}`. Una política
> `FOR ALL TO public USING (true)` deja la tabla abierta a cualquier usuario
> autenticado con la anon key. La única correctamente declarada es la de
> `mision_respuestas`.

| tablename | policyname | cmd | roles | qual | with_check |
| --- | --- | --- | --- | --- | --- |
| alertas_ignoradas | alertas_distri | ALL | {public} | `(distri_id = (SELECT profiles.distri_id FROM profiles WHERE (profiles.id = auth.uid())))` | null |
| bloque_campos | bloque_campos_insert | INSERT | {public} | null | `(auth.uid() IS NOT NULL)` |
| bloque_campos | bloque_campos_select | SELECT | {public} | `(auth.uid() IS NOT NULL)` | null |
| bloques_foto | bloques_foto_select | SELECT | {public} | `(((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = bloques_foto.campana_id) AND (c.estado = 'activa'))))) OR ((get_tipo_actor() = 'distribuidora') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = bloques_foto.campana_id) AND (c.distri_id = get_distri_id()))))) OR ((get_tipo_actor() = 'marca') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = bloques_foto.campana_id) AND (c.marca_id = get_marca_id()))))) OR (get_tipo_actor() = 'admin'))` | null |
| campana_localidades | service_role_all | ALL | {public} | `true` | null |
| campana_tokens | service_role_all | ALL | {public} | `true` | null |
| campana_zonas | campana_zonas_select | SELECT | {public} | `(auth.uid() IS NOT NULL)` | null |
| campanas | campanas_admin | ALL | {public} | `(get_tipo_actor() = 'admin')` | null |
| campanas | campanas_insert_distri | INSERT | {public} | null | `((get_tipo_actor() = 'distribuidora') AND (distri_id = get_distri_id()))` |
| campanas | campanas_insert_marca | INSERT | {public} | null | `((get_tipo_actor() = 'marca') AND (marca_id = get_marca_id()))` |
| campanas | campanas_select_distri | SELECT | {public} | `((get_tipo_actor() = 'distribuidora') AND (distri_id = get_distri_id()))` | null |
| campanas | campanas_select_gondolero | SELECT | {public} | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (estado = 'activa'))` | null |
| campanas | campanas_select_marca | SELECT | {public} | `((get_tipo_actor() = 'marca') AND (marca_id = get_marca_id()))` | null |
| campanas | campanas_update_distri | UPDATE | {public} | `((get_tipo_actor() = 'distribuidora') AND (distri_id = get_distri_id()))` | null |
| campanas | campanas_update_marca | UPDATE | {public} | `((get_tipo_actor() = 'marca') AND (marca_id = get_marca_id()))` | null |
| canjes | canjes_insert | INSERT | {public} | null | `(gondolero_id = auth.uid())` |
| canjes | canjes_select | SELECT | {public} | `((gondolero_id = auth.uid()) OR (get_tipo_actor() = 'admin'))` | null |
| canjes | canjes_update_admin | UPDATE | {public} | `(get_tipo_actor() = 'admin')` | null |
| comercios | comercios_insert | INSERT | {public} | null | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (registrado_por = auth.uid()))` |
| comercios | comercios_select | SELECT | {public} | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer','admin'])) OR (get_tipo_actor() = 'distribuidora'))` | null |
| comercios | comercios_update_distri_admin | UPDATE | {public} | `((get_tipo_actor() = 'admin') OR ((get_tipo_actor() = 'distribuidora') AND (EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = comercios.registrado_por) AND (p.distri_id = get_distri_id()))))))` | null |
| comercios_checks | service_role_all | ALL | {public} | `true` | null |
| configuracion | configuracion_admin | ALL | {public} | `(EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin'))))` | null |
| configuracion | configuracion_select | SELECT | {public} | `(auth.uid() IS NOT NULL)` | null |
| departamentos | public_read_departamentos | SELECT | {public} | `true` | null |
| distri_repo_relaciones | service_role_all | ALL | {public} | `true` | null |
| distri_repo_tokens | service_role_all | ALL | {public} | `true` | null |
| distribuidoras | distribuidoras_select_gondolero | SELECT | {public} | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (validada = true))` | null |
| distribuidoras | distribuidoras_select_own | SELECT | {public} | `((id = get_distri_id()) OR (get_tipo_actor() = 'admin'))` | null |
| distribuidoras | distribuidoras_update_own | UPDATE | {public} | `((id = get_distri_id()) AND (get_tipo_actor() = 'distribuidora'))` | null |
| errores_reportados | errores_admin | ALL | {public} | `(EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin'))))` | null |
| errores_reportados | errores_insert | INSERT | {public} | null | `(auth.uid() IS NOT NULL)` |
| fixer_distri_solicitudes | service_role_all | ALL | {public} | `true` | null |
| fixer_invitacion_tokens | service_role_all | ALL | {public} | `true` | null |
| fixer_repo_solicitudes | service_role_all | ALL | {public} | `true` | null |
| foto_respuestas | foto_respuestas_insert | INSERT | {public} | null | `(auth.uid() IS NOT NULL)` |
| foto_respuestas | foto_respuestas_select | SELECT | {public} | `(auth.uid() IS NOT NULL)` | null |
| fotos | fotos_admin | ALL | {public} | `(get_tipo_actor() = 'admin')` | null |
| fotos | fotos_insert_gondolero | INSERT | {public} | null | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (gondolero_id = auth.uid()))` |
| fotos | fotos_select_distri | SELECT | {public} | `((get_tipo_actor() = 'distribuidora') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = fotos.campana_id) AND (c.distri_id = get_distri_id())))))` | null |
| fotos | fotos_select_gondolero | SELECT | {public} | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (gondolero_id = auth.uid()))` | null |
| fotos | fotos_select_marca | SELECT | {public} | `((get_tipo_actor() = 'marca') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = fotos.campana_id) AND (c.marca_id = get_marca_id())))))` | null |
| fotos | fotos_update_distri_marca | UPDATE | {public} | `(((get_tipo_actor() = 'distribuidora') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = fotos.campana_id) AND (c.distri_id = get_distri_id()))))) OR ((get_tipo_actor() = 'marca') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = fotos.campana_id) AND (c.marca_id = get_marca_id()))))) OR (get_tipo_actor() = 'admin'))` | null |
| gondolero_distri_solicitudes | solicitudes_admin | ALL | {public} | `(EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin'))))` | null |
| gondolero_distri_solicitudes | solicitudes_distri | ALL | {public} | `(distri_id = (SELECT profiles.distri_id FROM profiles WHERE (profiles.id = auth.uid())))` | null |
| gondolero_distri_solicitudes | solicitudes_gondolero | ALL | {public} | `(gondolero_id = auth.uid())` | null |
| gondolero_localidades | service_role_all | ALL | {public} | `true` | null |
| gondolero_logros | gondolero_logros_insert | INSERT | {public} | null | `true` |
| gondolero_logros | gondolero_logros_select | SELECT | {public} | `((gondolero_id = auth.uid()) OR (EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin')))))` | null |
| gondolero_zonas | gondolero_zonas_delete | DELETE | {public} | `(gondolero_id = auth.uid())` | null |
| gondolero_zonas | gondolero_zonas_insert | INSERT | {public} | null | `(gondolero_id = auth.uid())` |
| gondolero_zonas | gondolero_zonas_select | SELECT | {public} | `((gondolero_id = auth.uid()) OR (get_tipo_actor() = 'admin'))` | null |
| localidades | public_read_localidades | SELECT | {public} | `true` | null |
| logros | logros_select | SELECT | {public} | `(auth.uid() IS NOT NULL)` | null |
| marca_distri_relaciones | relaciones_admin | ALL | {public} | `(EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin'))))` | null |
| marca_distri_relaciones | relaciones_distri | ALL | {public} | `(distri_id = (SELECT profiles.distri_id FROM profiles WHERE (profiles.id = auth.uid())))` | null |
| marca_distri_relaciones | relaciones_marca | ALL | {public} | `(marca_id = (SELECT profiles.marca_id FROM profiles WHERE (profiles.id = auth.uid())))` | null |
| marca_distri_tokens | tokens_marca_distri_insert | INSERT | {public} | null | `(auth.uid() IS NOT NULL)` |
| marca_distri_tokens | tokens_marca_distri_public | SELECT | {public} | `true` | null |
| marca_repo_relaciones | service_role_all | ALL | {public} | `true` | null |
| marca_repo_tokens | service_role_all | ALL | {public} | `true` | null |
| marcas | marcas_select_own | SELECT | {public} | `((id = get_marca_id()) OR (get_tipo_actor() = 'admin'))` | null |
| marcas | marcas_update_own | UPDATE | {public} | `((id = get_marca_id()) AND (get_tipo_actor() = 'marca'))` | null |
| mensajes_campana | mensajes_select | SELECT | {public} | `((EXISTS (SELECT 1 FROM participaciones p WHERE ((p.campana_id = mensajes_campana.campana_id) AND (p.gondolero_id = auth.uid())))) OR ((get_tipo_actor() = 'marca') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = mensajes_campana.campana_id) AND (c.marca_id = get_marca_id()))))) OR ((get_tipo_actor() = 'distribuidora') AND (EXISTS (SELECT 1 FROM campanas c WHERE ((c.id = mensajes_campana.campana_id) AND (c.distri_id = get_distri_id()))))) OR (get_tipo_actor() = 'admin'))` | null |
| **mision_respuestas** | **service_role_all** | **ALL** | **{service_role}** | `true` | `true` |
| misiones | service_role_all | ALL | {public} | `true` | null |
| movimientos_puntos | movimientos_puntos_select | SELECT | {public} | `((gondolero_id = auth.uid()) OR (get_tipo_actor() = 'admin'))` | null |
| movimientos_tokens | movimientos_tokens_select_distri | SELECT | {public} | `(((actor_tipo = 'distribuidora') AND (actor_id = get_distri_id()) AND (get_tipo_actor() = 'distribuidora')) OR ((actor_tipo = 'marca') AND (actor_id = get_marca_id()) AND (get_tipo_actor() = 'marca')) OR (get_tipo_actor() = 'admin'))` | null |
| notificaciones | actor_ve_sus_notificaciones | SELECT | {public} | `(actor_id = auth.uid())` | null |
| notificaciones | admin_ve_notificaciones_admin | SELECT | {public} | `((actor_tipo = 'admin') AND (EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin')))))` | null |
| notificaciones | gondolero_ve_sus_notificaciones | SELECT | {public} | `(gondolero_id = auth.uid())` | null |
| notificaciones | notificaciones_select | SELECT | {public} | `(gondolero_id = auth.uid())` | null |
| notificaciones | notificaciones_update_leida | UPDATE | {public} | `(gondolero_id = auth.uid())` | `(gondolero_id = auth.uid())` |
| participaciones | fixer_ve_sus_participaciones | SELECT | {public} | `(gondolero_id = auth.uid())` | null |
| participaciones | participaciones_insert | INSERT | {public} | null | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (gondolero_id = auth.uid()))` |
| participaciones | participaciones_select | SELECT | {public} | `((gondolero_id = auth.uid()) OR (get_tipo_actor() = ANY (ARRAY['distribuidora','marca','admin'])))` | null |
| participaciones | participaciones_update_admin | UPDATE | {public} | `(get_tipo_actor() = 'admin')` | null |
| participaciones | participaciones_update_gondolero | UPDATE | {public} | `((get_tipo_actor() = ANY (ARRAY['gondolero','fixer'])) AND (gondolero_id = auth.uid()))` | null |
| profiles | profiles_insert | INSERT | {public} | null | `(id = auth.uid())` |
| profiles | profiles_select | SELECT | {public} | `((id = auth.uid()) OR (get_tipo_actor() = 'admin'))` | null |
| profiles | profiles_select_distri | SELECT | {public} | `((get_tipo_actor() = 'distribuidora') AND (distri_id = get_distri_id()))` | null |
| profiles | profiles_select_marca | SELECT | {public} | `((get_tipo_actor() = 'marca') AND (EXISTS (SELECT 1 FROM (participaciones p JOIN campanas c ON ((c.id = p.campana_id))) WHERE ((p.gondolero_id = profiles.id) AND (c.marca_id = get_marca_id())))))` | null |
| profiles | profiles_update | UPDATE | {public} | `(id = auth.uid())` | null |
| provincias | public_read_provincias | SELECT | {public} | `true` | null |
| relacion_reinicio_solicitudes | actores_ven_reinicio_sus_relaciones | SELECT | {public} | `(EXISTS (SELECT 1 FROM marca_distri_relaciones mdr WHERE ((mdr.id = relacion_reinicio_solicitudes.relacion_id) AND ((EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.marca_id = mdr.marca_id)))) OR (EXISTS (SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.distri_id = mdr.distri_id))))))))` | null |
| relacion_reinicio_solicitudes | admin_gestiona_solicitudes_reinicio | ALL | {public} | `(EXISTS (SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.tipo_actor = 'admin'))))` | null |
| repositoras | service_role_all | ALL | {public} | `true` | null |
| vinculacion_tokens | tokens_distri | ALL | {public} | `(distri_id = (SELECT profiles.distri_id FROM profiles WHERE (profiles.id = auth.uid())))` | null |
| vinculacion_tokens | tokens_public_select | SELECT | {public} | `true` | null |
| zonas | zonas_admin_all | ALL | {public} | `(get_tipo_actor() = 'admin')` | null |
| zonas | zonas_select | SELECT | {public} | `true` | null |

### Tablas con política permisiva `FOR ALL TO public USING (true)`

`campana_localidades`, `campana_tokens`, `comercios_checks`,
`distri_repo_relaciones`, `distri_repo_tokens`, `fixer_distri_solicitudes`,
`fixer_invitacion_tokens`, `fixer_repo_solicitudes`, `gondolero_localidades`,
`marca_repo_relaciones`, `marca_repo_tokens`, `misiones`, `repositoras`.

### Tablas con SELECT público irrestricto

`marca_distri_tokens` (`tokens_marca_distri_public`), `vinculacion_tokens`
(`tokens_public_select`), `zonas` (`zonas_select`), `provincias`,
`departamentos`, `localidades`.

---

## 4. Índices

| tablename | indexname | indexdef |
| --- | --- | --- |
| alertas_ignoradas | alertas_ignoradas_pkey | CREATE UNIQUE INDEX alertas_ignoradas_pkey ON public.alertas_ignoradas USING btree (id) |
| alertas_ignoradas | alertas_ignoradas_unique | CREATE UNIQUE INDEX alertas_ignoradas_unique ON public.alertas_ignoradas USING btree (distri_id, tipo, referencia_id) |
| bloque_campos | bloque_campos_pkey | CREATE UNIQUE INDEX bloque_campos_pkey ON public.bloque_campos USING btree (id) |
| bloques_foto | bloques_foto_pkey | CREATE UNIQUE INDEX bloques_foto_pkey ON public.bloques_foto USING btree (id) |
| campana_localidades | campana_localidades_campana_id_localidad_id_key | CREATE UNIQUE INDEX ... ON public.campana_localidades USING btree (campana_id, localidad_id) |
| campana_localidades | campana_localidades_pkey | CREATE UNIQUE INDEX campana_localidades_pkey ON public.campana_localidades USING btree (id) |
| campana_tokens | campana_tokens_pkey | CREATE UNIQUE INDEX campana_tokens_pkey ON public.campana_tokens USING btree (id) |
| campana_tokens | campana_tokens_token_key | CREATE UNIQUE INDEX campana_tokens_token_key ON public.campana_tokens USING btree (token) |
| campana_zonas | campana_zonas_pkey | CREATE UNIQUE INDEX campana_zonas_pkey ON public.campana_zonas USING btree (campana_id, zona_id) |
| campanas | campanas_pkey | CREATE UNIQUE INDEX campanas_pkey ON public.campanas USING btree (id) |
| canjes | canjes_pkey | CREATE UNIQUE INDEX canjes_pkey ON public.canjes USING btree (id) |
| comercios | comercios_pkey | CREATE UNIQUE INDEX comercios_pkey ON public.comercios USING btree (id) |
| comercios | idx_comercios_lat_lng | CREATE INDEX idx_comercios_lat_lng ON public.comercios USING btree (lat, lng) |
| comercios_checks | comercios_checks_pkey | CREATE UNIQUE INDEX comercios_checks_pkey ON public.comercios_checks USING btree (id) |
| comercios_checks | comercios_checks_comercio_id_gondolero_id_key | CREATE UNIQUE INDEX ... ON public.comercios_checks USING btree (comercio_id, gondolero_id) |
| configuracion | configuracion_pkey | CREATE UNIQUE INDEX configuracion_pkey ON public.configuracion USING btree (id) |
| configuracion | configuracion_clave_key | CREATE UNIQUE INDEX configuracion_clave_key ON public.configuracion USING btree (clave) |
| departamentos | departamentos_nombre_provincia_id_key | CREATE UNIQUE INDEX ... ON public.departamentos USING btree (nombre, provincia_id) |
| departamentos | departamentos_pkey | CREATE UNIQUE INDEX departamentos_pkey ON public.departamentos USING btree (id) |
| departamentos | idx_departamentos_provincia | CREATE INDEX idx_departamentos_provincia ON public.departamentos USING btree (provincia_id) |
| distri_repo_relaciones | distri_repo_relaciones_pkey | CREATE UNIQUE INDEX distri_repo_relaciones_pkey ON public.distri_repo_relaciones USING btree (id) |
| distri_repo_relaciones | distri_repo_relaciones_distri_id_repositora_id_key | CREATE UNIQUE INDEX ... ON public.distri_repo_relaciones USING btree (distri_id, repositora_id) |
| distri_repo_tokens | distri_repo_tokens_pkey | CREATE UNIQUE INDEX distri_repo_tokens_pkey ON public.distri_repo_tokens USING btree (id) |
| distri_repo_tokens | distri_repo_tokens_token_key | CREATE UNIQUE INDEX distri_repo_tokens_token_key ON public.distri_repo_tokens USING btree (token) |
| distribuidoras | distribuidoras_pkey | CREATE UNIQUE INDEX distribuidoras_pkey ON public.distribuidoras USING btree (id) |
| distribuidoras | distribuidoras_cuit_key | CREATE UNIQUE INDEX distribuidoras_cuit_key ON public.distribuidoras USING btree (cuit) |
| errores_reportados | errores_reportados_pkey | CREATE UNIQUE INDEX errores_reportados_pkey ON public.errores_reportados USING btree (id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_pkey | CREATE UNIQUE INDEX fixer_distri_solicitudes_pkey ON public.fixer_distri_solicitudes USING btree (id) |
| fixer_distri_solicitudes | fixer_distri_solicitudes_fixer_id_distri_id_key | CREATE UNIQUE INDEX ... ON public.fixer_distri_solicitudes USING btree (fixer_id, distri_id) |
| fixer_invitacion_tokens | fixer_invitacion_tokens_pkey | CREATE UNIQUE INDEX fixer_invitacion_tokens_pkey ON public.fixer_invitacion_tokens USING btree (id) |
| fixer_invitacion_tokens | fixer_invitacion_tokens_token_key | CREATE UNIQUE INDEX fixer_invitacion_tokens_token_key ON public.fixer_invitacion_tokens USING btree (token) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_pkey | CREATE UNIQUE INDEX fixer_repo_solicitudes_pkey ON public.fixer_repo_solicitudes USING btree (id) |
| fixer_repo_solicitudes | fixer_repo_solicitudes_fixer_id_repositora_id_key | CREATE UNIQUE INDEX ... ON public.fixer_repo_solicitudes USING btree (fixer_id, repositora_id) |
| foto_respuestas | foto_respuestas_foto_id_campo_id_key | CREATE UNIQUE INDEX ... ON public.foto_respuestas USING btree (foto_id, campo_id) |
| foto_respuestas | foto_respuestas_pkey | CREATE UNIQUE INDEX foto_respuestas_pkey ON public.foto_respuestas USING btree (id) |
| fotos | idx_fotos_campana | CREATE INDEX idx_fotos_campana ON public.fotos USING btree (campana_id) |
| fotos | idx_fotos_comercio | CREATE INDEX idx_fotos_comercio ON public.fotos USING btree (comercio_id) |
| fotos | idx_fotos_estado | CREATE INDEX idx_fotos_estado ON public.fotos USING btree (estado) |
| fotos | idx_fotos_gondolero | CREATE INDEX idx_fotos_gondolero ON public.fotos USING btree (gondolero_id) |
| fotos | fotos_pkey | CREATE UNIQUE INDEX fotos_pkey ON public.fotos USING btree (id) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_pkey | CREATE UNIQUE INDEX ... ON public.gondolero_distri_solicitudes USING btree (id) |
| gondolero_distri_solicitudes | gondolero_distri_solicitudes_gondolero_id_distri_id_key | CREATE UNIQUE INDEX ... USING btree (gondolero_id, distri_id) |
| gondolero_localidades | gondolero_localidades_pkey | CREATE UNIQUE INDEX ... ON public.gondolero_localidades USING btree (gondolero_id, localidad_id) |
| gondolero_logros | gondolero_logros_gondolero_id_logro_clave_key | CREATE UNIQUE INDEX ... USING btree (gondolero_id, logro_clave) |
| gondolero_logros | gondolero_logros_pkey | CREATE UNIQUE INDEX gondolero_logros_pkey ON public.gondolero_logros USING btree (id) |
| gondolero_zonas | gondolero_zonas_pkey | CREATE UNIQUE INDEX gondolero_zonas_pkey ON public.gondolero_zonas USING btree (gondolero_id, zona_id) |
| localidades | idx_localidades_provincia | CREATE INDEX idx_localidades_provincia ON public.localidades USING btree (provincia_id) |
| localidades | localidades_pkey | CREATE UNIQUE INDEX localidades_pkey ON public.localidades USING btree (id) |
| localidades | localidades_nombre_departamento_id_key | CREATE UNIQUE INDEX ... USING btree (nombre, departamento_id) |
| localidades | idx_localidades_departamento | CREATE INDEX idx_localidades_departamento ON public.localidades USING btree (departamento_id) |
| logros | logros_pkey | CREATE UNIQUE INDEX logros_pkey ON public.logros USING btree (id) |
| logros | logros_clave_key | CREATE UNIQUE INDEX logros_clave_key ON public.logros USING btree (clave) |
| marca_distri_relaciones | marca_distri_relaciones_pkey | CREATE UNIQUE INDEX marca_distri_relaciones_pkey ON public.marca_distri_relaciones USING btree (id) |
| marca_distri_relaciones | marca_distri_relaciones_marca_id_distri_id_key | CREATE UNIQUE INDEX ... USING btree (marca_id, distri_id) |
| marca_distri_tokens | marca_distri_tokens_pkey | CREATE UNIQUE INDEX marca_distri_tokens_pkey ON public.marca_distri_tokens USING btree (id) |
| marca_distri_tokens | marca_distri_tokens_token_key | CREATE UNIQUE INDEX marca_distri_tokens_token_key ON public.marca_distri_tokens USING btree (token) |
| marca_repo_relaciones | marca_repo_relaciones_marca_id_repositora_id_key | CREATE UNIQUE INDEX ... USING btree (marca_id, repositora_id) |
| marca_repo_relaciones | marca_repo_relaciones_pkey | CREATE UNIQUE INDEX marca_repo_relaciones_pkey ON public.marca_repo_relaciones USING btree (id) |
| marca_repo_tokens | marca_repo_tokens_token_key | CREATE UNIQUE INDEX marca_repo_tokens_token_key ON public.marca_repo_tokens USING btree (token) |
| marca_repo_tokens | marca_repo_tokens_pkey | CREATE UNIQUE INDEX marca_repo_tokens_pkey ON public.marca_repo_tokens USING btree (id) |
| marcas | marcas_cuit_key | CREATE UNIQUE INDEX marcas_cuit_key ON public.marcas USING btree (cuit) |
| marcas | marcas_pkey | CREATE UNIQUE INDEX marcas_pkey ON public.marcas USING btree (id) |
| mensajes_campana | mensajes_campana_pkey | CREATE UNIQUE INDEX mensajes_campana_pkey ON public.mensajes_campana USING btree (id) |
| mision_respuestas | mision_respuestas_pkey | CREATE UNIQUE INDEX mision_respuestas_pkey ON public.mision_respuestas USING btree (id) |
| mision_respuestas | mision_respuestas_mision_id_idx | CREATE INDEX mision_respuestas_mision_id_idx ON public.mision_respuestas USING btree (mision_id) |
| misiones | misiones_pkey | CREATE UNIQUE INDEX misiones_pkey ON public.misiones USING btree (id) |
| movimientos_puntos | movimientos_puntos_pkey | CREATE UNIQUE INDEX movimientos_puntos_pkey ON public.movimientos_puntos USING btree (id) |
| movimientos_tokens | movimientos_tokens_pkey | CREATE UNIQUE INDEX movimientos_tokens_pkey ON public.movimientos_tokens USING btree (id) |
| notificaciones | notificaciones_pkey | CREATE UNIQUE INDEX notificaciones_pkey ON public.notificaciones USING btree (id) |
| participaciones | participaciones_campana_id_gondolero_id_key | CREATE UNIQUE INDEX ... USING btree (campana_id, gondolero_id) |
| participaciones | participaciones_pkey | CREATE UNIQUE INDEX participaciones_pkey ON public.participaciones USING btree (id) |
| profiles | profiles_pkey | CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id) |
| profiles | profiles_codigo_gondolero_key | CREATE UNIQUE INDEX profiles_codigo_gondolero_key ON public.profiles USING btree (codigo_gondolero) |
| provincias | provincias_pkey | CREATE UNIQUE INDEX provincias_pkey ON public.provincias USING btree (id) |
| provincias | provincias_nombre_key | CREATE UNIQUE INDEX provincias_nombre_key ON public.provincias USING btree (nombre) |
| relacion_reinicio_solicitudes | relacion_reinicio_solicitudes_pkey | CREATE UNIQUE INDEX ... ON public.relacion_reinicio_solicitudes USING btree (id) |
| repositoras | repositoras_pkey | CREATE UNIQUE INDEX repositoras_pkey ON public.repositoras USING btree (id) |
| spatial_ref_sys | spatial_ref_sys_pkey | CREATE UNIQUE INDEX spatial_ref_sys_pkey ON public.spatial_ref_sys USING btree (srid) |
| vinculacion_tokens | vinculacion_tokens_token_key | CREATE UNIQUE INDEX vinculacion_tokens_token_key ON public.vinculacion_tokens USING btree (token) |
| vinculacion_tokens | vinculacion_tokens_pkey | CREATE UNIQUE INDEX vinculacion_tokens_pkey ON public.vinculacion_tokens USING btree (id) |
| zonas | zonas_pkey | CREATE UNIQUE INDEX zonas_pkey ON public.zonas USING btree (id) |

### Foreign keys SIN índice

PostgreSQL no indexa las FK automáticamente. Estas quedaron sin cubrir:

- `misiones`: `campana_id`, `gondolero_id`, `comercio_id` (solo tiene pkey)
- `notificaciones`: `actor_id`, `gondolero_id`, `campana_id`, `foto_id`, `leida`
- `fotos`: `mision_id`, `bloque_id`
- `comercios`: `localidad_id`, `zona_id`, `registrado_por`, `campana_id`
- `movimientos_puntos`: `gondolero_id`, `campana_id`
- `movimientos_tokens`: `actor_id`, `campana_id`
- `participaciones`: solo compuesto `(campana_id, gondolero_id)` — filtrar por
  `gondolero_id` solo no usa ese índice
- `campana_localidades`: solo compuesto `(campana_id, localidad_id)` — filtrar
  por `localidad_id` solo no lo usa
- `bloque_campos`: `bloque_id`
- `bloques_foto`: `campana_id`

Nota sobre `idx_comercios_lat_lng`: es un btree compuesto sobre dos `numeric`.
No resuelve búsquedas por proximidad (radio de N metros). PostGIS está instalado
pero sin usar.

---

## 5. Funciones y triggers

### Funciones

> Las tres funciones helper de RLS son `SECURITY DEFINER`, y **debe seguir siendo
> así**: `get_tipo_actor()` lee de `profiles`, y las políticas de `profiles`
> llaman a `get_tipo_actor()`. Sin DEFINER hay recursión infinita.
> El `search_path` ya fue fijado a `public, pg_temp` (ver nota al inicio del
> documento) — las definiciones de abajo son previas a ese cambio.

```sql
CREATE OR REPLACE FUNCTION public.get_tipo_actor()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT tipo_actor FROM profiles WHERE id = auth.uid();
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_distri_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT distri_id FROM profiles WHERE id = auth.uid();
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_marca_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT marca_id FROM profiles WHERE id = auth.uid();
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.avg_precio_confirmado(campana_ids uuid[])
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT ROUND(AVG(precio_confirmado)::numeric, 2)
  FROM fotos
  WHERE campana_id = ANY(campana_ids)
  AND estado = 'aprobada'
  AND precio_confirmado IS NOT NULL
$function$
```

**No existe `get_repositora_id()`.** Solo hay helpers para distribuidora y marca.
Esta ausencia es la razón estructural por la que todas las tablas del actor
repositora quedaron con `service_role_all USING (true)` y por la que el código de
repositora depende del admin client: no había forma de escribir una política
correcta sin ese helper.

### Funciones ejecutadas por triggers

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, tipo_actor, nombre, alias, distri_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'tipo_actor', 'gondolero'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    NEW.raw_user_meta_data->>'alias',
    (NEW.raw_user_meta_data->>'distri_id')::uuid
  );
  RETURN NEW;
END;
$function$
```

> **VULNERABILIDAD CRÍTICA (mitigada, no resuelta).** `raw_user_meta_data` es lo
> que el cliente envía en `options.data` del `signUp()`. La función copia
> `tipo_actor` y `distri_id` sin validarlos contra ninguna lista blanca. Con el
> registro público habilitado, cualquiera con la anon key podía registrarse como
> `tipo_actor: 'admin'` y obtener control total: toda la RLS del sistema depende
> de `get_tipo_actor()`. Tampoco setea `repositora_id`.
>
> **Mitigación aplicada el 7/9/2026:** se cerró el registro público en el
> dashboard. El agujero deja de ser explotable, pero **la función sigue sin
> validar** — al reabrir el registro público la vulnerabilidad vuelve. El fix de
> fondo (lista blanca dentro de la función) requiere primero verificar si el alta
> desde el panel admin depende de este trigger o escribe el profile por separado.

```sql
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.update_gondolero_puntos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tipo = 'credito' THEN
    UPDATE profiles
    SET
      puntos_disponibles = puntos_disponibles + NEW.monto,
      puntos_totales_ganados = puntos_totales_ganados + NEW.monto
    WHERE id = NEW.gondolero_id;
  ELSIF NEW.tipo = 'debito' THEN
    UPDATE profiles
    SET puntos_disponibles = GREATEST(0, puntos_disponibles - NEW.monto)
    WHERE id = NEW.gondolero_id;
  END IF;
  RETURN NEW;
END;
$function$
```

> `update_gondolero_puntos()` es el corazón de la lógica de puntos reescrita en
> abril de 2026: los puntos se acreditan únicamente al insertar en
> `movimientos_puntos`, y este trigger propaga el saldo a `profiles`. No es
> `SECURITY DEFINER`, así que el UPDATE sobre `profiles` corre con los permisos
> de quien insertó el movimiento — verificar si funciona porque siempre se
> inserta con service_role o porque alguna política lo permite.

### Triggers

| tabla | trigger | timing | evento | función |
| --- | --- | --- | --- | --- |
| **auth.users** | **on_auth_user_created** | AFTER | INSERT | **handle_new_user()** |
| campanas | set_updated_at_campanas | BEFORE | UPDATE | trigger_set_updated_at() |
| comercios | set_updated_at_comercios | BEFORE | UPDATE | trigger_set_updated_at() |
| distribuidoras | set_updated_at_distribuidoras | BEFORE | UPDATE | trigger_set_updated_at() |
| fotos | set_updated_at_fotos | BEFORE | UPDATE | trigger_set_updated_at() |
| marcas | set_updated_at_marcas | BEFORE | UPDATE | trigger_set_updated_at() |
| movimientos_puntos | on_movimiento_puntos | AFTER | INSERT | update_gondolero_puntos() |
| profiles | set_updated_at_profiles | BEFORE | UPDATE | trigger_set_updated_at() |

El trigger sobre `auth.users` crea automáticamente la fila en `profiles` cuando se
registra un usuario. Es la puerta de entrada de todo actor al sistema — ver la
advertencia sobre `handle_new_user()` más arriba.

**Tablas SIN trigger de `updated_at`** pese a tener la columna:
`misiones`, `marca_distri_relaciones`, `marca_repo_relaciones`,
`distri_repo_relaciones`, `fixer_distri_solicitudes`, `fixer_repo_solicitudes`,
`gondolero_distri_solicitudes`, `participaciones`, `repositoras`,
`relacion_reinicio_solicitudes`. En esas tablas `updated_at` solo se actualiza si
el código lo setea explícitamente.
