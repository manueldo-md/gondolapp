# AUDITORÍA TÉCNICA — GondolApp — Septiembre 2026

> Auditoría realizada el 7–8 de septiembre de 2026 después de 5 meses sin actividad.
> Fuente de verdad de DB: `docs/schema-real-2026-09.md`.
> No se modificó ningún archivo durante la auditoría.

---

## 1. SEGURIDAD Y WALLED GARDEN — MÁXIMA PRIORIDAD

### 1.1 Punto (J): `handle_new_user()` — flujo completo y fix propuesto

#### Cómo crea usuarios el panel admin

Archivo: [`app/(admin)/admin/usuarios/actions.ts`](app/(admin)/admin/usuarios/actions.ts)

- **Línea 219**: `await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { tipo_actor, nombre, distri_id, marca_id, repositora_id } })`
- Usa `auth.admin.createUser()` con el `service_role` key — **no usa el registro público**.
- Inmediatamente después (línea 250): `await admin.from('profiles').update(profileUpdate).eq('id', authData.user.id)` — hace un UPDATE explícito que sobreescribe todo lo que el trigger haya escrito, incluyendo `repositora_id` (que el trigger no setea).
- El flujo es: `createUser` → el trigger `handle_new_user()` crea la fila en profiles con lo que viene en `user_metadata` → el UPDATE en línea 250 la sobreescribe con los valores correctos.
- **El alta desde admin NO depende del trigger para la corrección final**: si el trigger escribe algo malo, el UPDATE lo pisa.

#### Registro público (`signUp` desde el browser)

Archivo: [`app/auth/page.tsx`](app/auth/page.tsx), línea 124:
```ts
const { data: signUpData, error: err } = await supabase.auth.signUp({
  email: data.email,
  password: data.password,
  options: {
    data: {
      tipo_actor: data.tipo_actor,   // viene del form del browser
      nombre: data.nombre,
      alias: alias,
      celular: data.celular || null,
      distri_id: data.distri_id || null,
    },
  },
})
```

- La UI solo muestra gondolero, distribuidora, marca (líneas 17–41, `OPCIONES_TIPO` excluye explícitamente `'admin'` y `'repositora'`).
- **Pero `tipo_actor` llega al servidor como metadata libre**: un atacante con la `anon key` podía llamar directamente a `supabase.auth.signUp()` con `options.data.tipo_actor: 'admin'` y el trigger lo copiaba sin validar.
- **Mitigación actual (7/9/2026)**: registro público cerrado en el dashboard de Supabase. Verificado funcionando.
- **La vulnerabilidad vuelve si se reactiva el registro público** — la función sigue sin validar.

#### Flujos de invitación por token: ¿crean usuarios?

**Ninguno crea usuarios.** Todos asumen que el usuario ya existe con cuenta:
- `app/vinculacion/page.tsx` — verifica `auth.uid()` en el Server Component, require usuario autenticado
- `app/vinculacion-marca/page.tsx` — ídem
- `app/fixer-vinculacion/page.tsx` — ídem
- `app/vinculacion-distri-repo/page.tsx` — ídem
- `app/vinculacion-repo/page.tsx` — ídem

Los flujos solo vinculan: hacen upsert en tablas de solicitudes/relaciones y actualizan `profiles.distri_id / repositora_id`.

#### Metadata enviada en cada creación de usuario

| Origen | Función | Metadata enviada |
|--------|---------|-----------------|
| Registro público | `auth/page.tsx:124` | `tipo_actor, nombre, alias, celular, distri_id` |
| Panel admin | `admin/usuarios/actions.ts:219` | `tipo_actor, nombre, distri_id, marca_id, repositora_id` |
| Seed scripts | `scripts/seed-demo-completo.ts:82` | varia por script |

#### Fix propuesto para `handle_new_user()`

La lista blanca tiene que excluir `'admin'` **en todos los casos** porque ese tipo solo se asigna desde el panel admin vía UPDATE directo. El trigger nunca debe aceptar `'admin'` de `raw_user_meta_data`.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  _tipo        text;
  _distri_id   uuid;
  _nombre      text;
  -- Tipos permitidos desde el registro público/invitación.
  -- 'admin' NUNCA se acepta aquí: el admin solo existe porque un admin
  -- lo crea desde el panel y luego hace UPDATE directo en profiles.
  WHITELIST constant text[] := ARRAY[
    'gondolero', 'fixer', 'distribuidora', 'marca', 'repositora'
  ];
BEGIN
  _tipo := NEW.raw_user_meta_data->>'tipo_actor';

  -- Si el tipo no está en la lista blanca (o es null / 'admin'), caer a gondolero.
  IF _tipo IS NULL OR NOT (_tipo = ANY(WHITELIST)) THEN
    _tipo := 'gondolero';
  END IF;

  -- distri_id: validar que la distribuidora existe; si no, ignorar.
  BEGIN
    _distri_id := (NEW.raw_user_meta_data->>'distri_id')::uuid;
    IF _distri_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM distribuidoras WHERE id = _distri_id
    ) THEN
      _distri_id := NULL;
    END IF;
  EXCEPTION WHEN others THEN
    _distri_id := NULL;
  END;

  _nombre := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'nombre'), ''),
    NEW.email
  );

  INSERT INTO public.profiles (id, tipo_actor, nombre, alias, distri_id)
  VALUES (
    NEW.id,
    _tipo,
    _nombre,
    NEW.raw_user_meta_data->>'alias',
    _distri_id
  );

  RETURN NEW;
END;
$$;
```

**Por qué no rompe el alta desde admin:**
El admin hace `auth.admin.createUser()` → el trigger crea el profile con el tipo de la metadata (que para admins ya viene como `'admin'` en `user_metadata`, pero la lista blanca lo baja a `'gondolero'`) → inmediatamente el UPDATE en `actions.ts:250` sobreescribe el profile con `tipo_actor: 'admin'` y todos los campos correctos. El ORDER garantiza que el UPDATE siempre llegue después del trigger. Si el timing fallara (condición de carrera entre el INSERT del trigger y el UPDATE), el UPDATE ya apunta al `id` correcto y lo pisa igual.

**Nota**: `repositora_id` y `marca_id` no se setean en el trigger actual ni en la propuesta — el UPDATE del admin los fija. Si en el futuro se quiere soportar registro público para repositoras, habrá que agregar `repositora_id` al trigger con la misma validación de existencia.

---

### 1.2 Tablas con `FOR ALL TO public USING (true)` — datos concretos expuestos

Las 13 tablas con política permisiva (confirmado en `schema-real-2026-09.md` sección 3):

| Tabla | Datos expuestos | Actor que puede acceder |
|-------|----------------|------------------------|
| `misiones` | quién fue a qué comercio, cuándo, estado de bounty, puntos | Cualquier usuario autenticado |
| `repositoras` | razón social y CUIT de todas las repositoras | Cualquier usuario autenticado |
| `distri_repo_relaciones` | qué distribuidoras trabajan con qué repositoras | Cualquier usuario autenticado |
| `marca_repo_relaciones` | qué marcas trabajan con qué repositoras | Cualquier usuario autenticado |
| `fixer_distri_solicitudes` | estado de vinculación de todos los fixers con distribuidoras | Cualquier usuario autenticado |
| `fixer_repo_solicitudes` | estado de vinculación de todos los fixers con repositoras | Cualquier usuario autenticado |
| `fixer_invitacion_tokens` | **tokens de invitación no usados con `actor_id` y `tipo`** | Cualquier usuario autenticado |
| `marca_repo_tokens` | tokens de invitación marca-repositora | Cualquier usuario autenticado |
| `distri_repo_tokens` | tokens de invitación distribuidora-repositora | Cualquier usuario autenticado |
| `gondolero_localidades` | localidades de operación de cada gondolero (privacidad) | Cualquier usuario autenticado |
| `campana_localidades` | zonas de todas las campañas, incluyendo internas | Cualquier usuario autenticado |
| `campana_tokens` | tokens de invitación de campaña para distri/repo | Cualquier usuario autenticado |
| `comercios_checks` | logs GPS de validación de comercios con distri_id | Cualquier usuario autenticado |

**Adicionalmente, SELECT irrestricto (`USING (true)`) sin restricción de autenticación:**
- `vinculacion_tokens.tokens_public_select` → tokens de invitación gondolero-distri con `distri_id`, `gondolero_id`, `expira_at`, `usado`
- `marca_distri_tokens.tokens_marca_distri_public` → todos los tokens marca-distri con `marca_id`, `distri_id`, `iniciado_por`
- `zonas.zonas_select` → catálogo de zonas (aceptable, son datos públicos)
- `provincias`, `departamentos`, `localidades` → geográficos, aceptable

El problema crítico de `fixer_invitacion_tokens` con `FOR ALL TO public USING (true)`: un usuario autenticado puede **leer tokens no usados** y saber el `actor_id` y `tipo` del invitante, potencialmente interferir con el flujo.

---

### 1.3 Escenario: dos distribuidoras competidoras con solo la anon key

Usando solo la anon key + una cuenta autenticada como distribuidora B:

**Distri B SÍ puede ver:**
- `misiones`: id, campana_id, comercio_id, gondolero_id, estado, puntos_total de **todas las misiones de Distri A** — sabe exactamente en qué comercios trabaja Distri A, cuántas misiones completó, y en qué campañas.
- `gondolero_localidades`: localidades donde opera cada gondolero — sabe el territorio de la fuerza de campo de Distri A.
- `fixer_distri_solicitudes`: estado de los fixers de Distri A (aprobado/pendiente/terminada).
- `distri_repo_relaciones`: con qué repositoras trabaja Distri A.
- `campana_localidades`: en qué localidades tiene campañas Distri A (incluyendo campañas internas tipo 'interna').
- `marca_distri_relaciones` **sí está bien**: Distri B solo ve sus propias relaciones con marcas (política `relaciones_distri` usa `distri_id = profiles.distri_id`).
- `fotos`: **sí está bien**, la política filtra por `c.distri_id = get_distri_id()`.
- `campanas`: **sí está bien**, `campanas_select_distri` filtra por `distri_id = get_distri_id()`.

**Conclusión**: el activo central (fotos y campañas) está protegido. Pero la inteligencia operacional (quiénes son los gondoleros, dónde operan, con quién trabajan) está expuesta.

---

### 1.4 Usos del admin client (service_role) — necesarios vs. por RLS rota

Hay **dos patrones de adminClient** que coexisten (detalle en informe de agente):

**Patrón correcto** (instancia base sin cookies, ~50 archivos):
```ts
function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

**Patrón incorrecto** (`lib/supabase/server.ts:38`):
`createAdminClient()` usa `createServerClient` de `@supabase/ssr` con `service_role` — es async, maneja cookies. Un cliente service_role no debería manejar sesiones de usuario. No genera vulnerabilidad inmediata pero es conceptualmente incorrecto y no se usa ampliamente (solo en `gondolas/actions.ts`).

**Usos genuinamente necesarios:**
- `app/(admin)/admin/**` — el admin necesita bypass de RLS para ver todos los datos
- `captura/actions.ts:subirFoto` — subir a Storage (no hay RLS granular en buckets configurada)
- `captura/actions.ts:registrarMision` — escribe en `misiones` (cuya RLS está rota, pero el fix de RLS necesitaría un helper `get_repositora_id` y rediseño)
- `lib/notificaciones.ts` — crea notificaciones para actores de distintos tipos
- `lib/config.ts` — lee configuración global

**Usos motivados por RLS rota:**
- `app/vinculacion*/actions.ts` — operan sobre tablas con `service_role_all TO public`; si la RLS se arregla, estas acciones podrían usar el client normal del usuario autenticado
- `app/fixer-vinculacion/actions.ts` — ídem
- `app/(repositora)/**` casi todas las páginas — sin `get_repositora_id()` no hay forma de escribir políticas correctas, así que todo corre con service_role

---

### 1.5 Propuesta de políticas RLS correctas

**Paso 0 (prerequisito): crear `get_repositora_id()`**

```sql
CREATE OR REPLACE FUNCTION public.get_repositora_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT repositora_id FROM profiles WHERE id = auth.uid();
$$;
```

Sin este helper, no se pueden escribir políticas correctas para el actor repositora.

**Tablas y políticas propuestas:**

```sql
-- misiones: cada gondolero ve las suyas; distri ve las de sus gondoleros;
--           marca ve las de sus campañas; repositora las de las suyas; admin todo
DROP POLICY service_role_all ON misiones;
CREATE POLICY misiones_gondolero ON misiones FOR ALL
  USING (gondolero_id = auth.uid());
CREATE POLICY misiones_distri ON misiones FOR SELECT
  USING (get_tipo_actor() = 'distribuidora' AND EXISTS (
    SELECT 1 FROM campanas c WHERE c.id = misiones.campana_id AND c.distri_id = get_distri_id()
  ));
CREATE POLICY misiones_marca ON misiones FOR SELECT
  USING (get_tipo_actor() = 'marca' AND EXISTS (
    SELECT 1 FROM campanas c WHERE c.id = misiones.campana_id AND c.marca_id = get_marca_id()
  ));
CREATE POLICY misiones_repositora ON misiones FOR SELECT
  USING (get_tipo_actor() = 'repositora' AND EXISTS (
    SELECT 1 FROM campanas c WHERE c.id = misiones.campana_id AND c.repositora_id = get_repositora_id()
  ));
CREATE POLICY misiones_admin ON misiones FOR ALL
  USING (get_tipo_actor() = 'admin');
-- INSERT necesita service_role (captura/actions.ts usa admin client) — no crear INSERT policy para usuarios
```

```sql
-- repositoras: la propia repositora ve la suya; admin ve todas; distri/marca ven las vinculadas
DROP POLICY service_role_all ON repositoras;
CREATE POLICY repositoras_own ON repositoras FOR SELECT
  USING (id = get_repositora_id() OR get_tipo_actor() = 'admin');
CREATE POLICY repositoras_distri ON repositoras FOR SELECT
  USING (get_tipo_actor() = 'distribuidora' AND EXISTS (
    SELECT 1 FROM distri_repo_relaciones r
    WHERE r.repositora_id = repositoras.id AND r.distri_id = get_distri_id() AND r.estado = 'activa'
  ));
CREATE POLICY repositoras_marca ON repositoras FOR SELECT
  USING (get_tipo_actor() = 'marca' AND EXISTS (
    SELECT 1 FROM marca_repo_relaciones r
    WHERE r.repositora_id = repositoras.id AND r.marca_id = get_marca_id() AND r.estado = 'activa'
  ));
```

```sql
-- distri_repo_relaciones
DROP POLICY service_role_all ON distri_repo_relaciones;
CREATE POLICY drr_distri ON distri_repo_relaciones FOR ALL
  USING (distri_id = get_distri_id() AND get_tipo_actor() = 'distribuidora');
CREATE POLICY drr_repositora ON distri_repo_relaciones FOR ALL
  USING (repositora_id = get_repositora_id() AND get_tipo_actor() = 'repositora');
CREATE POLICY drr_admin ON distri_repo_relaciones FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- marca_repo_relaciones
DROP POLICY service_role_all ON marca_repo_relaciones;
CREATE POLICY mrr_marca ON marca_repo_relaciones FOR ALL
  USING (marca_id = get_marca_id() AND get_tipo_actor() = 'marca');
CREATE POLICY mrr_repositora ON marca_repo_relaciones FOR ALL
  USING (repositora_id = get_repositora_id() AND get_tipo_actor() = 'repositora');
CREATE POLICY mrr_admin ON marca_repo_relaciones FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- fixer_distri_solicitudes
DROP POLICY service_role_all ON fixer_distri_solicitudes;
CREATE POLICY fds_fixer ON fixer_distri_solicitudes FOR ALL USING (fixer_id = auth.uid());
CREATE POLICY fds_distri ON fixer_distri_solicitudes FOR ALL
  USING (distri_id = get_distri_id() AND get_tipo_actor() = 'distribuidora');
CREATE POLICY fds_admin ON fixer_distri_solicitudes FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- fixer_repo_solicitudes
DROP POLICY service_role_all ON fixer_repo_solicitudes;
CREATE POLICY frs_fixer ON fixer_repo_solicitudes FOR ALL USING (fixer_id = auth.uid());
CREATE POLICY frs_repositora ON fixer_repo_solicitudes FOR ALL
  USING (repositora_id = get_repositora_id() AND get_tipo_actor() = 'repositora');
CREATE POLICY frs_admin ON fixer_repo_solicitudes FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- fixer_invitacion_tokens: el invitante (actor_id) puede ver los suyos; el fixer que usa el token
-- tiene que poder leerlo (para validar en la página). La lectura pública actual es excesiva.
DROP POLICY service_role_all ON fixer_invitacion_tokens;
CREATE POLICY fit_actor ON fixer_invitacion_tokens FOR ALL
  USING (actor_id = CASE
    WHEN get_tipo_actor() = 'distribuidora' THEN get_distri_id()
    WHEN get_tipo_actor() = 'repositora' THEN get_repositora_id()
    ELSE NULL
  END);
CREATE POLICY fit_read_token ON fixer_invitacion_tokens FOR SELECT
  USING (true); -- necesario: la página de vinculacion lee por token, el fixer no conoce el actor_id
CREATE POLICY fit_admin ON fixer_invitacion_tokens FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- gondolero_localidades
DROP POLICY service_role_all ON gondolero_localidades;
CREATE POLICY gl_own ON gondolero_localidades FOR ALL USING (gondolero_id = auth.uid());
CREATE POLICY gl_distri ON gondolero_localidades FOR SELECT
  USING (get_tipo_actor() = 'distribuidora' AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = gondolero_localidades.gondolero_id AND p.distri_id = get_distri_id()
  ));
CREATE POLICY gl_admin ON gondolero_localidades FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- campana_localidades: lectura ya es posible para todos los actores via bloques_foto
-- Restringir a los actores de la campaña
DROP POLICY service_role_all ON campana_localidades;
CREATE POLICY cl_select ON campana_localidades FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM campanas c WHERE c.id = campana_localidades.campana_id AND (
      get_tipo_actor() = 'admin'
      OR (get_tipo_actor() = 'distribuidora' AND c.distri_id = get_distri_id())
      OR (get_tipo_actor() = 'marca' AND c.marca_id = get_marca_id())
      OR (get_tipo_actor() = ANY(ARRAY['gondolero','fixer']) AND c.estado = 'activa')
      OR (get_tipo_actor() = 'repositora' AND c.repositora_id = get_repositora_id())
    )
  ));
CREATE POLICY cl_admin_write ON campana_localidades FOR ALL USING (get_tipo_actor() = 'admin');
```

```sql
-- campana_tokens y distri_repo_tokens y marca_repo_tokens: idem
-- El patrón es: el creador puede verlos; el destinatario puede leer el suyo (para la página de vinculación)
-- Aplicar service_role para escritura (los tokens se crean desde actions con adminClient)
```

```sql
-- comercios_checks: lectura interna solamente
DROP POLICY service_role_all ON comercios_checks;
CREATE POLICY cc_gondolero ON comercios_checks FOR SELECT USING (gondolero_id = auth.uid());
CREATE POLICY cc_distri ON comercios_checks FOR SELECT
  USING (distri_id = get_distri_id() AND get_tipo_actor() = 'distribuidora');
CREATE POLICY cc_admin ON comercios_checks FOR ALL USING (get_tipo_actor() = 'admin');
-- INSERT sigue siendo service_role (actions-checks.ts usa adminClient)
```

**Tokens de invitación con SELECT irrestricto:**
`vinculacion_tokens.tokens_public_select` y `marca_distri_tokens.tokens_marca_distri_public` son un problema menor: los tokens son strings largos y aleatorios (`encode(gen_random_bytes(32), 'hex')`), así que la exposición real es leer quién invitó a quién. Para el piloto es aceptable; para producción con múltiples distribuidoras competidoras, restringir.

---

### 1.6 Orden de aplicación seguro

**Fase 1 (sin cambio de código):**
1. Crear `get_repositora_id()` — no rompe nada
2. Fix de `handle_new_user()` — en producción con registro cerrado, no afecta nada; al reabrir el registro, la protección estará activa

**Fase 2 (requiere prueba en staging antes de producción):**
3. RLS de `repositoras`, `distri_repo_relaciones`, `marca_repo_relaciones` — las páginas del panel ya usan service_role para leer, así que el impacto es solo que el cliente anon ya no puede leer más
4. RLS de `fixer_distri_solicitudes`, `fixer_repo_solicitudes`, `fixer_invitacion_tokens` — verificar que los flujos de invitación sigan funcionando

**Fase 3 (requiere refactor de captura/misiones):**
5. RLS de `misiones` — **esto sí requiere cambio de código**: `captura/actions.ts` usa adminClient para insertar en misiones. Una vez que haya política de INSERT para gondolero, se puede usar el client normal.
6. RLS de `gondolero_localidades`, `campana_localidades`, `campana_tokens`, `distri_repo_tokens`, `marca_repo_tokens`, `comercios_checks`

---

## 2. DESINCRONIZACIÓN MIGRACIONES ↔ DB REAL

### 2.1 Corrección de diagnóstico previo

**El directorio `supabase/migrations/` NO está vacío.** Al momento de la auditoría contenía 44 archivos `.sql` numerados del 001 al 044 (47 en realidad: los números 021 y 039 estaban duplicados, y existía un 045). El diagnóstico anterior fue un falso negativo de la herramienta de búsqueda.

> **ACTUALIZADO 7/9/2026:** son 56 archivos y ya no usan numeración ordinal — se renombraron todos al formato de timestamps del CLI (`YYYYMMDDHHMMSS_nombre.sql`). Las referencias por número en este documento corresponden a la nomenclatura vieja.

Sin embargo, el problema de desincronización sigue siendo real y significativo. La causa raíz es diferente:

- **`supabase init` nunca se ejecutó** — no existe `supabase/config.toml`. Confirmado: `npx supabase migration list` falla con `cannot read config: open supabase\config.toml: file not found`.
- Esto significa que las 44 migraciones **se aplican pegándolas manualmente en el SQL Editor de Supabase**, no con `supabase db push`.
- Supabase **no lleva registro interno de qué migraciones están aplicadas** (la tabla `supabase_migrations` que crea el CLI no existe). No hay forma de saber automáticamente cuáles se corrieron, en qué orden, ni si se corrieron completas.
- Varias migraciones tienen numeración conflictiva o definen los mismos objetos dos veces, lo que indica que el schema real fue parcialmente construido a mano en el SQL Editor *antes* de que se escribieran las migraciones correspondientes.

---

### 2.2 Objetos en la DB pero NO en ninguna migración

Verificado comparando `docs/schema-real-2026-09.md` (sección 1: Tablas y columnas) con todos los `.sql` en `supabase/migrations/`.

**Tablas completas sin migración:**

| Tabla | Descripción |
|-------|------------|
| `campana_tokens` | Tokens de invitación para compartir campañas con distribuidoras y repositoras. Columnas: id, token, campana_id, distri_id, usado, expira_at, created_at, **repositora_id**. La columna `repositora_id` también falta en migraciones. |
| `comercios_checks` | Log GPS de visitas de validación de comercios. Columnas: id, comercio_id, gondolero_id, distri_id, latitud, longitud, created_at. |

**Columnas sin migración en tablas que sí están migradas:**

| Tabla.columna | Tipo | Descripción |
|---------------|------|-------------|
| `campanas.via_ejecucion` | text DEFAULT 'distribuidora' | Quién ejecuta la campaña. El CHECK que la acompaña incluye `'repositora'`, que tampoco está en ninguna migración. |
| `campanas.repositora_id` | uuid FK → repositoras | La FK `campanas_repositora_id_fkey` tampoco está en ninguna migración. |
| `campanas.motivo_rechazo` | text | `motivo_rechazo` existe en `fotos` desde el initial schema, pero en `campanas` es una columna agregada manualmente posterior. |

**CHECKs modificados manualmente sin migración:**

| Tabla.constraint | Valor en migración | Valor en DB |
|------------------|--------------------|-------------|
| `campanas.campanas_financiada_por_check` | `('marca','distri','gondolapp')` — migration 001 | `('marca','distri','gondolapp','repositora')` — **'repositora' agregado a mano** |
| `comercios.comercios_tipo_check` | `('autoservicio','almacen','kiosco','mayorista','otro')` — migration 001 | `('almacen','kiosco','autoservicio','dietetica','mayorista','otro')` — **'dietetica' agregado a mano** |

---

### 2.3 Cambios del 7/9/2026 sin migración

Los tres cambios aplicados después del dump (documentados en el encabezado de `schema-real-2026-09.md`) tampoco tienen migración:

| Cambio | SQL aplicado | Migración existente |
|--------|-------------|---------------------|
| `'terminada'` en `gondolero_distri_solicitudes.estado` | `DROP CONSTRAINT + ADD CONSTRAINT CHECK (... 'terminada')` | **No existe** |
| `'terminada'` en `fixer_repo_solicitudes.estado` | `DROP CONSTRAINT + ADD CONSTRAINT CHECK (... 'terminada')` | **No existe** |
| `search_path` en `get_tipo_actor()`, `get_distri_id()`, `get_marca_id()` | `ALTER FUNCTION ... SET search_path = public, pg_temp` | **No existe** |

---

### 2.4 Conflictos internos entre migraciones

Los siguientes conflictos revelan que parte del schema fue construido en el SQL Editor *antes* de que se escribiera la migración que lo documenta — por eso los `CREATE TABLE IF NOT EXISTS` son no-ops en producción.

**Tabla `distri_repo_relaciones` definida dos veces:**
- `20260408192350_distri_repo_relaciones.sql`: crea la tabla con `CHECK (estado IN ('activa','inactiva'))` y sin `updated_at`.
- `20260409161503_distri_repo.sql`: también crea la tabla (IF NOT EXISTS) con `CHECK (estado IN ('activa','inactiva','terminada'))` y con `updated_at`.
- **DB real**: tiene `'terminada'` en el CHECK y tiene `updated_at` → coincide con 040.
- **Conclusión**: la tabla fue creada manualmente en el SQL Editor con el schema de 040 antes de que se escribieran ambas migraciones. Las dos migraciones son no-ops en producción. Si se corriera sobre una DB limpia, 039 ganaría (se ejecuta primero) y la tabla quedaría sin `'terminada'` y sin `updated_at` — inconsistente con el código.

**Tabla `campana_localidades` definida dos veces:**
- `20260406151509_zonas_geograficas.sql`: crea `campana_localidades` con `PRIMARY KEY (campana_id, localidad_id)` — sin columna `id`.
- `20260409185450_campana_localidades.sql`: también crea `campana_localidades` (IF NOT EXISTS) con `id uuid PRIMARY KEY` y UNIQUE(campana_id, localidad_id).
- **DB real** (`schema-real-2026-09.md` líneas 98–101): tiene columna `id uuid gen_random_uuid()` → coincide con 041.
- **Conclusión**: la tabla fue creada manualmente con el schema de 041. Si se corriera sobre una DB limpia, 032 ganaría (se ejecuta primero) y la tabla quedaría con PK compuesto y sin la columna `id` — inconsistente con el código (que hace `select('id')` sobre esta tabla).

**Numeración duplicada (021):**
- `20260404134949_multi_distri_gondolero.sql`
- `20260404134950_relacion_reinicio.sql`
- Dos archivos con el mismo número de secuencia. En el CLI de Supabase esto es un error fatal. Aplicados a mano no hay problema, pero la ambigüedad de orden es un riesgo.

**Schema de `gondolero_localidades` diverge de migration 032:**
- Migration 032 crea `gondolero_localidades` con columna `created_at timestamptz DEFAULT now()`.
- **DB real** (`schema-real-2026-09.md` líneas 292–293): solo tiene `gondolero_id` y `localidad_id` — **sin `created_at`**.
- La tabla en producción fue creada con un DDL diferente al de la migración.

**`distri_repo_tokens.distri_id` FK sin ON DELETE CASCADE:**
- Migration 040: `distri_id uuid REFERENCES distribuidoras(id) NOT NULL` — sin ON DELETE CASCADE.
- **DB real** (sección 2 de constraints): `distri_repo_tokens_distri_id_fkey: FOREIGN KEY (distri_id) REFERENCES distribuidoras(id) ON DELETE CASCADE` — **con ON DELETE CASCADE**.
- La FK fue creada o alterada manualmente con CASCADE después de que se escribió la migración.

---

### 2.5 Veredicto: ¿qué le falta a una DB fresca si se corren las 44 migraciones?

Asumiendo que se corren en orden sobre una base limpia con el schema inicial de Supabase:

**Tablas que estarían completamente ausentes:**
- `campana_tokens` — no existe en ninguna migración
- `comercios_checks` — no existe en ninguna migración

**Columnas que faltarían:**
- `campanas.via_ejecucion` — el código la lee en decenas de páginas; las campañas creadas en la DB fresca no tendrían modo de ejecución
- `campanas.repositora_id` — toda la vinculación de repositoras con campañas rompería
- `campanas.motivo_rechazo` — el flujo de rechazo de campañas rompería

**CHECKs más restrictivos que la DB real:**
- `campanas.financiada_por`: no aceptaría `'repositora'` → inserción de campañas de repositoras fallaría con constraint violation
- `comercios.tipo`: no aceptaría `'dietetica'` → creación de comercios de ese tipo fallaría
- `gondolero_distri_solicitudes.estado`: sin `'terminada'` → el flujo de desvinculación fallaría
- `fixer_repo_solicitudes.estado`: sin `'terminada'` → ídem

**Inconsistencias de schema respecto al código:**
- `campana_localidades`: PK sería (campana_id, localidad_id) sin columna `id` — las queries que hacen `.select('id')` sobre esta tabla retornarían null
- `distri_repo_relaciones`: solo estados `'activa'` e `'inactiva'` — sin `'terminada'`, el flujo de fin de relación fallaría; sin `updated_at`, las queries que lo actualizan lanzarían error
- `gondolero_localidades`: tendría columna `created_at` extra (no rompe nada, pero difiere)
- `distri_repo_tokens`: sin ON DELETE CASCADE en `distri_id` — borrar una distribuidora dejaría tokens huérfanos en lugar de eliminarlos

**Funciones sin `search_path` fijo** — `get_tipo_actor()`, `get_distri_id()`, `get_marca_id()` son vulnerables a hijacking del search_path (mitigado, pero no corregido en las migraciones).

**Resumen ejecutivo**: una DB creada solo con las 44 migraciones necesitaría al menos **10 objetos adicionales / cambios** antes de poder correr el código de producción sin errores.

---

### 2.6 Plan de reconciliación (corregido)

> **ACTUALIZADO 7/9/2026 — este plan ya se ejecutó, con desviaciones.** Lo que
> sigue es la propuesta original de la auditoría, conservada como registro. Al
> implementarla aparecieron tres cosas que la auditoría no había detectado, y
> además todas las migraciones se renombraron al formato de timestamps del CLI
> (`YYYYMMDDHHMMSS_nombre.sql`), así que la numeración de abajo ya no existe.
> Ver la tabla de equivalencia al final de esta sección.

El trabajo ya **no es** escribir el schema entero desde cero — la mayoría del schema ya está en las migraciones existentes. El trabajo es escribir las **migraciones faltantes** que cubran la divergencia.

**Migraciones a crear (propuesta original, superada):**

```
045_campana_tokens.sql              — CREATE TABLE campana_tokens (con repositora_id)
046_campana_via_ejecucion.sql       — ADD COLUMN via_ejecucion, repositora_id, motivo_rechazo a campanas
                                      + ALTER CHECK financiada_por para incluir 'repositora'
                                      + ALTER CHECK via_ejecucion con ('distribuidora','gondolapp','repositora')
047_comercios_checks.sql            — CREATE TABLE comercios_checks
048_comercios_tipo_dietetica.sql    — ALTER CHECK comercios.tipo para incluir 'dietetica'
049_estado_terminada.sql            — ALTER CHECK gondolero_distri_solicitudes y fixer_repo_solicitudes
                                      para incluir 'terminada' (cambios del 7/9/2026)
050_search_path_helpers.sql         — ALTER FUNCTION get_tipo_actor/get_distri_id/get_marca_id
                                      SET search_path = public, pg_temp (cambios del 7/9/2026)
```

**Qué se implementó realmente:**

| Archivo | Cubre |
|---|---|
| `20260409185451_bloque_campos_foto_respuestas.sql` | **No estaba en el plan.** Crea `bloque_campos` y `foto_respuestas`, que ninguna migración creaba. Va antes de `bloque_campos_tipo_foto` porque esa les hace `ALTER` y las referencia en un FK — sin esto una base limpia aborta ahí y nunca llega al resto. |
| `20260907152746_campana_tokens.sql` | `campana_tokens` con `repositora_id` + extensión `pgcrypto`, que la migración inicial nunca habilitó |
| `20260907152747_comercios_checks.sql` | `comercios_checks` |
| `20260907152748_campanas_via_ejecucion_repositora.sql` | `via_ejecucion`, `repositora_id`, `motivo_rechazo` + CHECKs de `via_ejecucion` y `financiada_por` |
| `20260907152749_comercios_tipo_dietetica.sql` | CHECK de `comercios.tipo` con `'dietetica'` |
| `20260907152750_estado_terminada.sql` | CHECK con `'terminada'` en las dos tablas de solicitudes |
| `20260907152751_search_path_helpers.sql` | `search_path` fijo en los tres helpers de RLS |
| `20260907152752_handle_new_user_whitelist.sql` | **No estaba en el plan.** `handle_new_user()` con whitelist de `tipo_actor`, copia literal de producción |
| `20260907152753_reconciliacion_conflictos.sql` | Los conflictos internos entre migraciones (ver abajo) |

**Migraciones existentes que necesitaban corrección de conflicto:**
- Se resolvieron los números duplicados (`021` y `039` aparecían dos veces). El renombrado general a timestamps eliminó la clase entera de problema.
- Anotado en `20260408192350_distri_repo_relaciones.sql` que quedó superseded por `20260409161503_distri_repo.sql`.
- Anotado en `20260406151509_zonas_geograficas.sql` que `campana_localidades` quedó superseded por `20260409185450_campana_localidades.sql`.
- **No detectado por la auditoría:** las dos migraciones de `distri_repo_relaciones` creaban una policy con el mismo nombre sobre la misma tabla, y `CREATE POLICY` no admite `IF NOT EXISTS`. Sobre una base limpia eso aborta la corrida entera. Se agregó `DROP POLICY IF EXISTS` en `20260409161503_distri_repo.sql`. Efecto lateral útil: ese archivo pasó a ser re-ejecutable, cosa que antes no era.

**Prerequisito técnico:** Correr `supabase init` para crear `config.toml` y conectar la CLI al proyecto. Esto habilita `supabase migration list` para auditar el estado remoto, y `supabase db push` para aplicar migraciones de forma controlada en staging. **Cuidado:** `config.toml` se genera con `[auth] enable_signup = true`, que es lo contrario de la mitigación aplicada el 7/9. Revisar y fijar en `false` antes de commitearlo.

---

## 3. SISTEMAS DUPLICADOS DE ZONAS

### 3.1 Sistema legacy (UUID)

Tablas: `zonas` (uuid PK), `campana_zonas` (campana_id + zona_id), `gondolero_zonas` (gondolero_id + zona_id)

Archivos que lo usan:
- [`app/auth/page.tsx:333`](app/auth/page.tsx) — `gondolero_zonas.insert` al registrarse → **nuevos usuarios van al sistema viejo**
- [`app/(gondolero)/gondolero/campanas/page.tsx:27`](app/(gondolero)/gondolero/campanas/page.tsx) — `gondolero_zonas.select('zona_id')`
- [`app/(gondolero)/gondolero/campanas/page.tsx:139`](app/(gondolero)/gondolero/campanas/page.tsx) — `campana_zonas.select('campana_id').in('zona_id', zonaIds)`
- [`app/(gondolero)/gondolero/logros/page.tsx:88,185,197`](app/(gondolero)/gondolero/logros/page.tsx) — lee `gondolero_zonas` para calcular logros geográficos
- [`app/(admin)/admin/zonas/page.tsx:18,19`](app/(admin)/admin/zonas/page.tsx) — cuenta campañas y gondoleros por zona
- [`app/(admin)/admin/repositoras/page.tsx:35`](app/(admin)/admin/repositoras/page.tsx) — `campana_zonas.select('zona_id')` para campañas de fixer activas

### 3.2 Sistema nuevo (integer)

Tablas: `localidades` (integer PK), `campana_localidades` (campana_id + localidad_id), `gondolero_localidades` (gondolero_id + localidad_id)

Archivos que lo usan:
- [`app/(gondolero)/gondolero/campanas/page.tsx:142`](app/(gondolero)/gondolero/campanas/page.tsx) — `campana_localidades.select('campana_id').in('localidad_id', localidadIds)`
- [`app/(gondolero)/gondolero/perfil/actions.ts:104`](app/(gondolero)/gondolero/perfil/actions.ts) — reemplaza `gondolero_localidades` al editar perfil
- [`app/(admin)/admin/campanas/nueva/actions.ts:103`](app/(admin)/admin/campanas/nueva/actions.ts) — inserta en `campana_localidades` al crear campaña
- [`app/(distribuidora)/distribuidora/campanas/nueva/actions.ts:52`](app/(distribuidora)/distribuidora/campanas/nueva/actions.ts) — ídem
- Todas las páginas de detalle de campañas leen `campana_localidades(localidad_id, localidades(nombre))`

### 3.3 Archivos que consultan AMBOS sistemas

[`app/(gondolero)/gondolero/campanas/page.tsx`](app/(gondolero)/gondolero/campanas/page.tsx) lee ambos en paralelo (líneas 27–28 y 139–158) y combina los resultados para determinar qué campañas puede ver el gondolero. También lee "todas las campana_zonas + campana_localidades" (línea 158) para detectar campañas sin zona asignada.

### 3.4 Comercios con ambas columnas

Tabla `comercios` tiene tanto `zona_id uuid` (legacy) como `localidad_id integer` (nuevo), simultáneamente. El código de creación de comercios en [`app/(gondolero)/gondolero/captura/actions-comercios.ts:70,114`](app/(gondolero)/gondolero/captura/actions-comercios.ts) solo setea `zona_id` (busca "Entre Ríos" por nombre o primera zona disponible), nunca `localidad_id`. Los formularios nuevos de alta de campaña setean `localidad_id`. Un comercio puede tener uno, el otro, o ninguno.

### 3.5 Plan de unificación

**Por riesgo, de menor a mayor:**

1. (Bajo) Migrar `auth/page.tsx:333` de `gondolero_zonas` a `gondolero_localidades` al registrarse. Requiere mapear el UUID de zona a un integer de localidad, o eliminar el paso de zonas del registro si el perfil lo maneja.
2. (Bajo) En `actions-comercios.ts`, agregar `localidad_id` al crear comercios cuando sea determinable por GPS.
3. (Medio) Migrar `admin/zonas/` a mostrar también localidades — o reemplazar por localidades.
4. (Medio) Migrar `admin/repositoras/page.tsx:35` de `campana_zonas` a `campana_localidades`.
5. (Alto, blocker) Migrar `gondolero/logros/page.tsx` de `gondolero_zonas` a `gondolero_localidades` — requiere que todos los gondoleros tengan localidades, lo que depende del punto 1.
6. (Alto) Marcar `campana_zonas` y `gondolero_zonas` como deprecated y dejar de escribir en ellas. Eliminarlas cuando el código las deje de leer.

El riesgo principal es que gondoleros antiguos que solo tienen `gondolero_zonas` perderían la asignación de zona en el sistema nuevo hasta que se migren sus datos.

---

## 4. CAMPOS LEGACY Y FUENTES DE VERDAD DUPLICADAS

### 4.1 `puntos_por_foto` vs `puntos_por_mision`

**Estado**: `puntos_por_foto` es el campo legacy (CLAUDE.md original). `puntos_por_mision` fue agregado después para representar el total por misión (no por foto individual). Ambos coexisten en la tabla `campanas`.

**Regla de negocio actual**: si `puntos_por_mision > 0`, se usa ese; si no, fallback a `puntos_por_foto`.

**Dónde aparece el fallback** (citas exactas):

- [`app/(admin)/admin/fotos/actions.ts:37–40`](app/(admin)/admin/fotos/actions.ts):
  ```ts
  const puntosEfectivos: number = (foto?.campana?.puntos_por_mision ?? 0) > 0
    ? foto?.campana?.puntos_por_mision ?? 0
    : foto?.campana?.puntos_por_foto ?? 0
  ```
- [`app/(admin)/admin/fotos/actions.ts:228–230`](app/(admin)/admin/fotos/actions.ts): mismo patrón
- [`app/(distribuidora)/distribuidora/campanas/[id]/detalle/draft-actions.ts:43`](app/(distribuidora)/distribuidora/campanas/[id]/detalle/draft-actions.ts):
  ```ts
  const puntosActuales = c.puntos_por_mision > 0 ? c.puntos_por_mision : c.puntos_por_foto
  ```
- [`app/(gondolero)/gondolero/captura/actions-checks.ts`](app/(gondolero)/gondolero/captura/actions-checks.ts) — función `liberarBounty` usa el mismo fallback
- [`app/(gondolero)/gondolero/campanas/campanas-sections.tsx`](app/(gondolero)/gondolero/campanas/campanas-sections.tsx) — muestra al gondolero `puntos_por_mision > 0 ? puntos_por_mision : puntos_por_foto`

**Conclusión**: el campo `puntos_por_foto` puede quedar en `0` en campañas nuevas sin problema. Las campañas del `seed.sql` usan solo `puntos_por_foto` (legacy). No hay inconsistencia técnica, solo deuda de limpieza.

### 4.2 `objetivo_comercios` vs `tope_total_comercios`

**Diferencia semántica**:
- `objetivo_comercios`: objetivo declarativo para mostrar en la UI (barra de progreso)
- `tope_total_comercios`: límite operativo que cierra la campaña automáticamente

**Fallback en código**:
- [`app/(admin)/admin/campanas/[id]/detalle/page.tsx:100`](app/(admin)/admin/campanas/[id]/detalle/page.tsx): `const limiteComerciosAdmin = campana.tope_total_comercios ?? campana.objetivo_comercios`
- [`app/(distribuidora)/distribuidora/campanas/[id]/detalle/page.tsx:134`](app/(distribuidora)/distribuidora/campanas/[id]/detalle/page.tsx): `{c.tope_total_comercios ?? c.objetivo_comercios}`

**Estado real**: los formularios de nueva campaña insertan solo `tope_total_comercios` (sin `objetivo_comercios`). La UI de listas usa `objetivo_comercios` para el progreso. Las campañas nuevas tendrían `objetivo_comercios = null` y el progreso se calcularía incorrectamente.

Confirmado en [`app/(distribuidora)/distribuidora/alertas/page.tsx:183`](app/(distribuidora)/distribuidora/alertas/page.tsx): filtra campañas "en riesgo" usando `objetivo_comercios`, que puede ser null en campañas nuevas — la alerta nunca dispararía para ellas.

### 4.3 `profiles.distri_id` vs `gondolero_distri_solicitudes` — dos fuentes de verdad

**Regla documentada** (en `vinculacion/actions.ts:37–40`):
```ts
// Actualizar profiles.distri_id solo si no tiene ninguna distri principal aún
const { data: profileCheck } = await admin.from('profiles').select('distri_id').eq('id', gondoleroId).single()
if (!profileCheck?.distri_id) {
  await admin.from('profiles').update({ distri_id: distriId }).eq('id', gondoleroId)
}
```

**Divergencia posible**: si un gondolero ya tenía `profiles.distri_id` seteado (de la distri anterior), al aceptar una nueva invitación `gondolero_distri_solicitudes` se actualiza a 'aprobada' pero `profiles.distri_id` **no cambia**. La RLS usa `profiles.distri_id`. Resultado: el gondolero tiene una solicitud aprobada con la nueva distri pero RLS-wise sigue siendo de la anterior.

Similar para fixer/repositora: `fixer-vinculacion/actions.ts:46` y `:75` tienen la misma lógica condicional.

**Qué usa cada parte del código:**
- La RLS usa `profiles.distri_id` (via `get_distri_id()`)
- La UI del perfil del gondolero muestra solicitudes desde `gondolero_distri_solicitudes`
- El middleware usa `profiles.tipo_actor`
- Las acciones de desvinculación (`desvincular-actions.ts`) actualizan `gondolero_distri_solicitudes.estado = 'terminada'` y `profiles.distri_id = null`

---

## 5. FLUJO DE CAPTURA

### 5.1 Diagrama del flujo actual (de `captura/page.tsx`)

**Campaña tipo `'comercios'`** (registrar comercio nuevo):
```
comercios-gps → comercios-formulario → comercios-fachada → comercios-exito
```

**Todas las demás campañas:**
```
comercios-gps         ← seleccionar comercio en mapa (radio 20m)
    ↓
gps                   ← validar posición (radio 50m del comercio)
    ↓
camara                ← captura con cámara nativa, blur detection, giroscopio
    ↓
[blur-advertencia]    ← si blur_score < umbral (800 mobile / 50 desktop)
    ↓
[formulario-camara]   ← campos del bloque durante captura (si los hay)
    ↓
formulario            ← campos post-captura (precio, declaración, etc.)
    ↓
confirmacion          ← preview + edición antes de enviar
    ↓
mision-resumen        ← si hay múltiples bloques, loop por cada uno
    ↓
exito                 ← muestra puntos y resultado
```

**Puntos calculados en cliente**: `puntos_por_mision > 0 ? puntos_por_mision : puntos_por_foto * fotosCapturadas.length`

### 5.2 Bug: bloques de campaña creados en el ALTA no se ejecutan en la misión

**Lo que funciona:**
El ALTA crea correctamente:
- `bloques_foto` (con `campana_id`, `orden`, `instruccion`, `tipo_contenido`, `solicitar_precio`)
- `bloque_campos` (con `bloque_id`, `tipo`, `pregunta`, `opciones`, `obligatorio`, `orden`)

Confirmado en [`app/(admin)/admin/campanas/nueva/actions.ts:67–99`](app/(admin)/admin/campanas/nueva/actions.ts) y [`app/(distribuidora)/distribuidora/campanas/nueva/actions.ts:64–97`](app/(distribuidora)/distribuidora/campanas/nueva/actions.ts) — la estructura es idéntica entre alta y edición.

**Diagnóstico de la causa raíz — lo que puede diferir:**

El `captura/page.tsx` carga la campaña con sus bloques desde el client ANON (no service_role). La política `bloques_foto_select` (schema sección 3) requiere que `c.estado = 'activa'`. **Las campañas creadas desde el admin se crean directamente en estado `'activa'`** (actions.ts:51: `estado: 'activa'`). Esto es correcto y no debería ser el problema.

La hipótesis más plausible identificada a partir del código:

**La captura usa `asegurarBloqueGenerico()` como fallback** (`captura/actions.ts:457–493`). Esta función, llamada desde el frontend, busca el primer bloque existente. Si lo encuentra, lo devuelve. Si NO lo encuentra (porque la consulta usa service_role, que debería bypassear RLS sin problema), crea uno genérico **vacío** (sin campos).

**La causa raíz probable es otra**: el captura/page.tsx carga la campaña con `bloques_foto(bloque_campos(...))` usando el **client ANON del usuario**. La política `bloque_campos_select` es simplemente `auth.uid() IS NOT NULL` — cualquier usuario autenticado puede leerlos. Tampoco hay restricción.

**Pero**: el page.tsx cachea la campaña en IndexedDB. Si el gondolero tenía la campaña cacheada de una visita anterior (antes de agregar bloques o después de cambios), la caché stale podría mostrar bloques viejos o ninguno.

**Hipótesis final (no verificable sin acceso a producción)**: el bug puede ser que la caché de IndexedDB del gondolero tiene datos de antes de que se agregaran los campos correctamente en el alta. La EDICIÓN y republicación invalida esa caché (o el gondolero recarga) y entonces funciona.

**Diagnóstico honesto**: No puedo determinar la causa raíz exacta sin reproducir el bug con logs del servidor o el browser de un gondolero real. Los tres caminos de escritura (alta admin, alta distri, edición) producen el mismo DDL en `bloques_foto` y `bloque_campos`. El bug probablemente está en la lectura/caché del cliente, no en la escritura del servidor. Proponer un cuarto parche de escritura sin reproducir el bug sería incorrecto.

**Próximo paso recomendado**: agregar logs en `page.tsx` para registrar qué devuelve la query de campaña con bloques al cargar una campaña nueva, y comparar con una editada.

---

## 6. ACTOR REPOSITORA — COMPLETITUD

### 6.1 Qué funciona bien

- Panel completo implementado: dashboard, campanas, comercios, fixers, distribuidoras, marcas, gondolas, cuenta (1425 líneas totales en las páginas de repositora)
- El layout verifica autenticación y `tipo_actor === 'repositora'`
- Las relaciones con marcas y distribuidoras están modeladas en DB
- Los flujos de invitación de fixers funcionan (fixer-vinculacion/actions.ts)
- `crearUsuario()` en admin crea el registro en `repositoras` y setea `repositora_id` en el profile vía UPDATE

### 6.2 Qué quedó a medias o roto

- **Sin `get_repositora_id()`**: no hay función SQL helper. Toda la lectura de datos de repositora se hace con service_role (bypass de RLS), o leyendo `repositora_id` directamente del profile en el código del Server Component.
- **Todas las tablas de repositora tienen `service_role_all TO public`**: cualquier usuario puede leer `repositoras`, `distri_repo_relaciones`, `marca_repo_relaciones`, `fixer_repo_solicitudes`.
- **`repositoras` no tiene `tokens_disponibles`**: las tablas `marcas` y `distribuidoras` tienen `tokens_disponibles integer DEFAULT 0`, pero `repositoras` no. Si el modelo de negocio prevé que las repositoras también tengan tokens, esta columna falta.
- **`handle_new_user()` no setea `repositora_id`**: el trigger crea el profile sin `repositora_id`. El admin lo agrega vía UPDATE en `actions.ts:250`. Si se creara una repositora fuera del panel admin, el `repositora_id` quedaría null y la repositora no podría acceder a sus datos.
- **El panel admin de repositoras usa `campana_zonas` (legacy)**: `app/(admin)/admin/repositoras/page.tsx:35` consulta `campana_zonas` para campañas de fixer activas, ignorando el sistema nuevo de `campana_localidades`.

### 6.3 `repositoras.tokens_disponibles` — intencional o pendiente

No se puede determinar desde el código. La ausencia no genera error porque ninguna parte del código actual intenta leer `repositoras.tokens_disponibles`. Si el modelo de negocio planea cobrar tokens a repositoras o darles tokens como en el sistema de distris, la columna falta. Si la repositora no participa en la economía de tokens, la ausencia es intencional.

---

## 7. DEPENDENCIAS

### 7.1 Versiones actuales

| Paquete | Versión en package.json | Instalada |
|---------|------------------------|-----------|
| Next.js | ^14.2.0 | 14.2.35 |
| React | ^18.3.0 | 18.3.x |
| @supabase/ssr | ^0.10.0 | 0.10.x |
| @supabase/supabase-js | ^2.43.0 | 2.43.x |
| TypeScript | ^5.4.0 | 5.4.x |
| Supabase CLI (dev) | ^1.173.0 | 1.173.x |
| Node.js (runtime) | — | 24.11.1 |

### 7.2 Vulnerabilidad CRITICAL: `tar`

Afecta: `supabase` CLI (devDependency), versiones 1.1.6–2.72.8. La CLI usa `tar` ≤7.5.20.

Vulnerabilidades en `node-tar`:
- Arbitrary File Create/Overwrite via Hardlink Path Traversal (GHSA-34x7-hfp2-rc4v)
- Arbitrary File Overwrite/Symlink Poisoning via insufficient path sanitization (GHSA-8qq5-rm4j-mr97)
- Arbitrary File Read/Write via Symlink Chain in extraction (GHSA-83g3-92jg-28cx)
- Drive-Relative Linkpath hardlink traversal — **relevante en Windows** (GHSA-qffp-2rhf-9h96)
- Varios DoS adicionales (PAX, recursión, NUL bytes)

**Impacto real**: solo afecta el entorno de desarrollo cuando se extrae un archivo `.tar` malicioso con la CLI de Supabase (por ejemplo, `supabase db pull`). **No afecta el runtime de producción en Vercel**. En Windows (este entorno), la vulnerabilidad de drive-relative path es más relevante. Fix: `npm audit fix --force` actualizaría `supabase` a ≥2.116.0 (breaking change en CLI).

### 7.3 Vulnerabilidades HIGH (16)

| Paquete | CVE/GHSA | Impacto en producción | Fix |
|---------|----------|-----------------------|-----|
| `brace-expansion` | Múltiples DoS via expansión exponencial | No (build tool) | `npm audit fix` |
| `browserslist` | OOM sin eviction, crash via stats JSON | No (build tool) | `npm audit fix` |
| `fast-uri` | SSRF, host confusion, path traversal | Posible si se procesa URIs de usuario | `npm audit fix` |
| `glob` | Command injection via `--cmd` con `shell:true` | No (eslint-config-next, devDep) | `--force` (rompe eslint-config-next) |
| `hono` | Cookie name validation bypass | Bajo (solo si se usa Hono directamente) | `npm audit fix` |
| `next` | SSRF en rewrites, disclosure de Server Functions, middleware bypass | **Sí — producción** | `--force` → Next 16 (breaking) |
| `postcss` | XSS via `</style>`, arbitrary file read via sourceMappingURL | Solo build time | `--force` → transitivo de Next |
| `sharp` | 4 CVEs 2026 en libvips heredados | Posible si se procesa imágenes del usuario | `--force` → sharp 0.35.x (breaking) |
| `ws` | Uninitialized memory disclosure, memory exhaustion | Depende de si se usa WebSocket | `npm audit fix` |

**La vulnerabilidad más relevante para producción es `next`**: el SSRF en rewrites (`GHSA-p9j2-gv94-2wf4`) y la disclosure de Server Function endpoints (`GHSA-955p-x3mx-jcvp`). GondolApp no tiene rewrites configurados actualmente (ver `next.config.js`), así que el riesgo del SSRF es bajo en esta configuración. La disclosure de endpoints es más relevante pero depende de configuración específica.

### 7.4 Node 24 con Next 14

**Sin incompatibilidades conocidas**. Next.js 14 requiere Node ≥18.17. Node 24 es LTS desde octubre 2024 y soporta Next 14 sin problemas documentados.

### 7.5 Esfuerzo de subir Next a la última major (actualmente 15.x, próximamente 16.x)

**Next 14 → 15**: cambios breaking documentados:
- `cookies()`, `headers()`, `params`, `searchParams` pasan de sync a async en Server Components — **impacto alto**: hay decenas de archivos que usan `await cookies()` (ya están adaptados) pero `params` en layouts/pages probablemente necesite revisión.
- Comportamiento de caché cambia (fetches ya no se cachean por defecto).
- `@supabase/ssr` ^0.10.0 puede necesitar actualización.

**Esfuerzo estimado**: 2–3 días con testing. Riesgo: medio (muchos archivos afectados, pero el build actual pasa → el compilador detecta la mayoría de errores).

**Recomendación**: actualizar solo si hay una vulnerabilidad crítica en Next 14 que afecte la configuración actual. En este momento, no la hay con la configuración de rewrites que tiene GondolApp.

---

## 8. TESTING

### 8.1 Los 5 flujos que si se rompen, rompen el negocio

1. **Gondolero captura foto** → foto en DB con estado `'pendiente'`, misión creada, bounty `'retenido'`
2. **Admin aprueba foto/misión** → puntos acreditados, `movimientos_puntos` insertado, `profiles.puntos_disponibles` actualizado vía trigger
3. **Admin/distri crea campaña** → campaña visible para gondolero en su zona, con bloques y campos correctos
4. **Gondolero se registra** → profile creado con `tipo_actor` correcto (no puede ser `'admin'`)
5. **Distri aprueba gondolero** → gondolero ve campañas internas de esa distri (depende de `profiles.distri_id`)

### 8.2 Herramienta recomendada y por qué

**Playwright** (testing E2E en browser real).

Razones:
- La app es una PWA con cámara nativa (`getUserMedia`), GPS (`Geolocation API`) y captura mobile — Playwright puede mockear estas APIs del browser
- Los flujos críticos son end-to-end: involucran DB real (o Supabase local), auth, y navegación
- Playwright tiene soporte para múltiples contextos de browser (un gondolero + un admin en paralelo)
- Alternativa (Cypress) tiene peor soporte para APIs de hardware del browser

**Para los tests unitarios de la lógica de negocio** (Haversine, blur detection, cálculo de puntos): Jest o Vitest.

**Estado actual**: todo el QA es manual en un celular. Cero tests automatizados.

**Suite mínima prioritaria:**
```
test/e2e/
  01-registro-gondolero.spec.ts    # flujo 4
  02-registro-no-puede-ser-admin.spec.ts  # seguridad J
  03-crear-campana-admin.spec.ts   # flujo 3
  04-captura-foto.spec.ts          # flujo 1 (con GPS mockeado)
  05-aprobar-foto-puntos.spec.ts   # flujo 2
```

---

## 9. CÓDIGO MUERTO Y DUPLICACIÓN

### 9.1 Duplicación más significativa

**`adminClient()` definido localmente en ~50 archivos**. Es exactamente la misma función de 6 líneas copiada en cada archivo. Existe un `createAdminClient()` en `lib/supabase/server.ts` pero usa el patrón incorrecto (`@supabase/ssr` con cookies). No existe una función utilitaria centralizada con el patrón correcto.

```ts
// Existe en ~50 archivos, literalmente idéntica
function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

Solución: centralizar en `lib/supabase/admin.ts` y exportar. **No es un cambio de comportamiento, solo de estructura.**

**Paneles marca / distri / repositora** son altamente similares. Por ejemplo:
- Las páginas de `marcas.tsx` (distri) y `distribuidoras.tsx` (marca) tienen prácticamente la misma estructura
- Las páginas de `campanas/page.tsx` de los tres actores comparten el 70% del JSX

Cuantificación: los 3 paneles juntos tienen ~12.000 líneas de TSX. Estimo 30–40% de duplicación estructural real (JSX de tablas, formularios de filtro, cards de campaña).

### 9.2 Componentes o rutas sin uso aparente

- [`app/(admin)/admin/cambiar-rol-btn.tsx`](app/(admin)/admin/usuarios/cambiar-rol-btn.tsx) — marcado en su código como "componente legacy — la funcionalidad se migró a AccionesUsuario". Posible código muerto.
- `app/(gondolero)/gondolero/misiones/` — rutas existentes pero no encontré uso desde el panel principal del gondolero en la auditoría.

### 9.3 Código `any` en TypeScript

`types/database.ts` es un placeholder que exporta `Record<string, unknown>` para todas las tablas (línea 1: `"Por ahora es un placeholder hasta que se conecte Supabase. NO editar manualmente."`). Esto significa que **ninguna query de Supabase está tipada**. En todo el código hay casts manuales como `supabase as any` para evitar errores de TypeScript.

Esto es un riesgo de mantenimiento alto: los errores de schema (columna renombrada, tipo cambiado) no se detectan en build, solo en runtime.

---

## 10. TOP 10 PRIORIDADES

| # | Qué | Por qué | Riesgo si no se hace | Esfuerzo | Bloquea a |
|---|-----|---------|---------------------|----------|-----------|
| 1 | **Fix `handle_new_user()`** (whitelist) | Vulnerabilidad activa: al reabrir el registro, cualquiera puede registrarse como admin | Toma de control total de la plataforma con una cuenta free | 2h (solo SQL) | — |
| 2 | **Crear `get_repositora_id()`** | Prerequisito de todo el RLS de repositora | Sin él, todo el actor repositora corre sin walled garden real | 30min (SQL) | #3, #4 |
| 3 | **RLS correctas en misiones** | Cualquier gondolero puede leer misiones de todos los demás | Espionaje operativo entre distribuidoras competidoras | 1 día (SQL + code, ver sección 1.6 fase 3) | — |
| 4 | **RLS correctas en tablas de repositora** (`repositoras`, `distri_repo_relaciones`, `marca_repo_relaciones`) | Datos de relaciones comerciales expuestos | Competidores ven con quién trabaja cada actor | 4h (SQL) | `get_repositora_id()` |
| 5 | **Migraciones faltantes + `supabase init`** | La DB real tiene 10+ objetos/cambios sin migración. Una DB fresca corriendo las 44 migraciones existentes fallaría en producción con constraint violations y columnas faltantes | No se puede hacer staging ni onboarding; cualquier reset de la DB produce una app rota | 1 día (6 migraciones nuevas + `supabase init`) — **HECHO el 7/9/2026: fueron 9, no 6; ver sección 2.6.** `supabase init` sigue pendiente | — |
| 6 | **Generar `types/database.ts` real** | Todo el código usa `any` implícito; errores de schema solo se detectan en runtime | Bugs silenciosos imposibles de detectar en build | 2h (`supabase gen types`) + ajustes | — |
| 7 | **Unificar sistema de zonas** | Dos sistemas paralelos con escritura divergente; gondoleros nuevos van al sistema viejo | Al escalar, la detección de campañas por zona será inconsistente | 2–3 días | — |
| 8 | **Resolver bug de bloques en captura** | El flujo principal del negocio tiene un bug intermitente no reproducible consistentemente | Gondoleros que no pueden completar misiones = datos perdidos del piloto | 1 día (investigación + fix) | — |
| 9 | **Centralizar `adminClient()`** | 50 archivos con la misma función duplicada; si el patrón cambia hay que actualizar todos | Deuda de mantenimiento compuesta | 2h (refactor mecánico) | — |
| 10 | **Suite de tests E2E básica** | Sin tests, cualquier cambio puede romper el flujo de captura silenciosamente | El piloto con Biomega/Georgalos se interrumpe sin saberlo | 3–4 días | Requiere Playwright configurado |

---

*Auditoría generada el 7–8 de septiembre de 2026.*
*Herramienta: Claude Sonnet 4.6 via Claude Code.*
*Todo el análisis es estático — no se ejecutó código en producción ni se leyeron datos de la DB real.*
