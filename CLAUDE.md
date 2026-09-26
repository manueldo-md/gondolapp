# CLAUDE.md — GondolApp

> Este archivo es el contexto principal del proyecto para Claude Code.
> Leelo completo antes de escribir cualquier línea de código.
> Ante cualquier duda de arquitectura o producto, este documento tiene precedencia.

---

## 1. QUÉ ES GONDOLAPP

GondolApp es una plataforma de inteligencia de mercado para el **canal tradicional de distribución argentino** (autoservicios, almacenes, kioscos). Conecta cuatro tipos de actores a través de una app web móvil y paneles web desktop.

**La idea central:** los vendedores de campo que ya recorren estos comercios todos los días fotografían las góndolas a cambio de puntos canjeables. Esas fotos se convierten en datos accionables para distribuidoras y marcas.

**El piloto:** Biomega (distribuidora, Entre Ríos) + Georgalos/Entrenuts (marcas).

**Referencia de negocios:** Nielsen adquirió Mtrix en Brasil por exactamente este tipo de activo de datos del canal tradicional.

---

## 2. LOS CUATRO ACTORES

| Actor | Interfaz | Rol |
|-------|----------|-----|
| **Gondolero** | Web app mobile (PWA) | Fotografía góndolas, gana puntos |
| **Fixer** | Web app mobile (PWA, mismo proyecto) | Acomoda góndolas, par antes/después |
| **Distribuidora** | Panel web desktop | Coordina vendedores, valida, ve data |
| **Marca** | Panel web desktop | Crea campañas, ve fotos, consume datos |

Existe además un **panel de administración interno** (backend de GondolApp) con 5 roles: Super Admin, Operaciones, Comercial, Tech/Data, Administración.

---

## 3. STACK TECNOLÓGICO — DECISIONES CERRADAS

```
Frontend:     Next.js 14+ (App Router) + TypeScript + Tailwind CSS
Base de datos: Supabase (PostgreSQL + Auth + Storage + Realtime)
Hosting:      Vercel (frontend) — deploy automático desde GitHub
ORM:          Supabase JS Client (no Prisma en V1)
Estado:       Zustand (global) + React Query (server state)
Formularios:  React Hook Form + Zod (validación)
UI base:      shadcn/ui + Radix UI
Íconos:       Lucide React
Fotos:        MediaDevices API (cámara nativa del browser)
GPS:          Geolocation API (nativa del browser)
SMS/OTP:      Supabase Auth (magic link o OTP por email en MVP, SMS en V2)
IA de fotos:  Desactivada en MVP — validación manual. V2: Google Vertex AI Vision
```

**Por qué Next.js y no Flutter:**
- Un solo proyecto para las 3 interfaces (gondolero, panel clientes, backend admin)
- Claude Code lo maneja muy bien
- PWA funciona en Android de bajo costo sin instalar nada
- La cámara y el GPS funcionan nativamente en el browser mobile

**Por qué Supabase:**
- PostgreSQL real con RLS (Row Level Security) nativo
- Auth + Storage + Realtime incluidos
- Sin necesidad de construir API propia en el MVP
- Free tier generoso, escala bien

---

## 4. ESTRUCTURA DEL PROYECTO

```
gondolapp/
├── CLAUDE.md                    # Este archivo
├── .env.local                   # Credenciales de PRODUCCIÓN (NUNCA commitear)
├── .env.dev.local               # Credenciales de DEV (NUNCA commitear)
├── data/georgalos-piloto.csv    # CSV del piloto, usado por los scripts de seed
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
│
├── app/                         # Next.js App Router
│   ├── (gondolero)/             # Rutas mobile-first para gondoleros y fixers
│   │   ├── layout.tsx           # Layout mobile con nav inferior
│   │   ├── campanas/            # Marketplace de campañas
│   │   ├── misiones/            # Campañas activas del gondolero
│   │   ├── captura/             # Flujo de captura de foto
│   │   ├── perfil/              # Perfil, puntos, canje
│   │   └── mensajes/            # Tablón de campaña
│   │
│   ├── (distribuidora)/         # Panel web desktop para distribuidoras
│   │   ├── layout.tsx           # Layout con sidebar
│   │   ├── dashboard/
│   │   ├── campanas/
│   │   ├── gondoleros/
│   │   ├── alertas/
│   │   └── gondolas/            # Fotos y datos de campañas
│   │
│   ├── (marca)/                 # Panel web desktop para marcas
│   │   ├── layout.tsx
│   │   ├── dashboard/
│   │   ├── campanas/
│   │   ├── gondolas/
│   │   └── reportes/
│   │
│   ├── (admin)/                 # Backend interno de GondolApp
│   │   ├── layout.tsx
│   │   ├── tablero/
│   │   ├── excepciones/
│   │   ├── actores/
│   │   ├── economia/
│   │   └── configuracion/
│   │
│   ├── auth/                    # Login, registro, OTP
│   └── api/                     # Route handlers de Next.js (webhooks, etc.)
│
├── components/                  # Componentes reutilizables
│   ├── ui/                      # shadcn/ui components
│   ├── mobile/                  # Componentes mobile-first
│   ├── desktop/                 # Componentes desktop
│   └── shared/                  # Compartidos entre todas las vistas
│
├── lib/                         # Utilidades y configuración
│   ├── supabase/
│   │   ├── client.ts            # Supabase browser client
│   │   ├── server.ts            # Supabase server client (SSR)
│   │   └── middleware.ts        # Auth middleware
│   ├── hooks/                   # Custom React hooks
│   ├── utils.ts                 # Helpers generales
│   └── validations/             # Schemas de Zod
│
├── types/                       # TypeScript types globales
│   ├── database.ts              # Tipos generados de Supabase
│   └── index.ts
│
└── supabase/
    ├── migrations/              # Migraciones SQL en orden
    └── seed.sql                 # Datos de prueba para el piloto
```

---

## 5. ESQUEMA DE BASE DE DATOS — TABLAS PRINCIPALES

> **Esto es el diseño original de V1 y sirve para entender el modelo, no para
> consultar el schema.** La base creció bastante desde entonces: `comercios`
> tiene `estado`, `telefono`, `encargado`, `campana_id` y `localidad_id`;
> `campanas` tiene `via_ejecucion`, `repositora_id` y varias más; existen tablas
> enteras que no figuran acá (`misiones`, `bloque_campos`, `foto_respuestas`,
> `campana_tokens`, la geografía de tres niveles, todo el actor repositora).
>
> **La fuente de verdad es `docs/schema-real-2026-09.md`**, generado desde
> producción. Ante cualquier duda sobre una columna, ese archivo manda.

### Usuarios y actores

```sql
-- Extiende auth.users de Supabase
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users,
  tipo_actor text CHECK (tipo_actor IN ('gondolero','fixer','distribuidora','marca','admin')),
  nombre text,
  alias text,                    -- Para gondoleros: "Agustín R."
  celular text,
  nivel text DEFAULT 'casual',   -- casual | activo | pro (gondoleros)
  puntos_disponibles integer DEFAULT 0,
  zona_ids uuid[],               -- Zonas declaradas
  distri_id uuid REFERENCES distribuidoras,
  monotributo_verificado boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

distribuidoras (
  id uuid PRIMARY KEY,
  razon_social text,
  cuit text,
  tokens_disponibles integer DEFAULT 0,
  validada boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

marcas (
  id uuid PRIMARY KEY,
  razon_social text,
  cuit text,
  tokens_disponibles integer DEFAULT 0,
  validada boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)
```

### Geografía y comercios

```sql
zonas (
  id uuid PRIMARY KEY,
  nombre text,                   -- "Concordia", "Entre Ríos"
  tipo text,                     -- ciudad | provincia | region
  lat decimal,
  lng decimal
)

comercios (
  id uuid PRIMARY KEY,
  nombre text,
  direccion text,
  lat decimal NOT NULL,
  lng decimal NOT NULL,
  tipo text,                     -- autoservicio | almacen | kiosco | mayorista
  foto_fachada_url text,
  validado boolean DEFAULT false,
  zona_id uuid REFERENCES zonas,
  registrado_por uuid REFERENCES profiles,
  created_at timestamptz DEFAULT now()
)
```

### Campañas

```sql
campanas (
  id uuid PRIMARY KEY,
  nombre text,
  tipo text CHECK (tipo IN (
    'relevamiento','precio','cobertura','pop','mapa','comercios','interna'
  )),
  marca_id uuid REFERENCES marcas,
  distri_id uuid REFERENCES distribuidoras,         -- Si es compartida
  financiada_por text DEFAULT 'marca',              -- marca | distri | gondolapp
  estado text DEFAULT 'borrador',                   -- borrador | activa | pausada | cerrada | cancelada
  fecha_inicio date,
  fecha_fin date,
  fecha_limite_inscripcion date,
  objetivo_comercios integer,
  max_comercios_por_gondolero integer DEFAULT 20,
  min_comercios_para_cobrar integer DEFAULT 3,
  tope_total_comercios integer,
  puntos_por_foto integer DEFAULT 0,
  instruccion text,
  tokens_creacion integer DEFAULT 15,
  presupuesto_tokens integer DEFAULT 0,
  fondo_resguardo_tokens integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

bloques_foto (
  id uuid PRIMARY KEY,
  campana_id uuid REFERENCES campanas,
  orden integer,
  instruccion text,
)

participaciones (
  id uuid PRIMARY KEY,
  campana_id uuid REFERENCES campanas,
  gondolero_id uuid REFERENCES profiles,
  estado text DEFAULT 'activa', -- activa | completada | abandonada
  comercios_completados integer DEFAULT 0,
  puntos_acumulados integer DEFAULT 0,
  joined_at timestamptz DEFAULT now()
)
```

### Fotos y misiones

```sql
fotos (
  id uuid PRIMARY KEY,
  campana_id uuid REFERENCES campanas,
  bloque_id uuid REFERENCES bloques_foto,
  gondolero_id uuid REFERENCES profiles,
  comercio_id uuid REFERENCES comercios,
  url text NOT NULL,
  lat decimal NOT NULL,
  lng decimal NOT NULL,
  timestamp_dispositivo timestamptz,
  timestamp_servidor timestamptz DEFAULT now(),
  device_id text,
  declaracion text CHECK (declaracion IN (
    'producto_presente','producto_no_encontrado','solo_competencia'
  )),
  precio_detectado decimal,
  precio_confirmado decimal,
  estado text DEFAULT 'pendiente',   -- pendiente | aprobada | rechazada | en_revision
  puntos_otorgados integer DEFAULT 0,
  ia_confianza decimal,
  ia_procesada boolean DEFAULT false,
  es_antes boolean,                  -- Para fixers: foto ANTES del par
  par_foto_id uuid REFERENCES fotos, -- Para fixers: la foto DESPUÉS
  created_at timestamptz DEFAULT now()
)
```

### Economía

```sql
movimientos_puntos (
  id uuid PRIMARY KEY,
  gondolero_id uuid REFERENCES profiles,
  tipo text,                     -- credito | debito
  monto integer,
  concepto text,
  campana_id uuid REFERENCES campanas,
  created_at timestamptz DEFAULT now()
)

canjes (
  id uuid PRIMARY KEY,
  gondolero_id uuid REFERENCES profiles,
  premio text,                   -- nafta_ypf | giftcard_ml | credito_celular | transferencia
  puntos integer,
  estado text DEFAULT 'pendiente', -- pendiente | procesado | entregado
  codigo_entregado text,
  created_at timestamptz DEFAULT now()
)

movimientos_tokens (
  id uuid PRIMARY KEY,
  actor_id uuid,                 -- marca_id o distri_id
  actor_tipo text,
  tipo text,                     -- compra | consumo | bloqueo | liberacion
  monto integer,
  concepto text,
  campana_id uuid REFERENCES campanas,
  created_at timestamptz DEFAULT now()
)
```

### Mensajería

```sql
mensajes_campana (
  id uuid PRIMARY KEY,
  campana_id uuid REFERENCES campanas,
  remitente_id uuid REFERENCES profiles,
  remitente_tipo text,           -- marca | distribuidora
  tipo text,                     -- broadcast | pregunta | respuesta
  contenido text,
  publicado boolean DEFAULT false, -- Para Q&A: si se publicó para todos
  pregunta_id uuid REFERENCES mensajes_campana, -- FK a la pregunta original
  created_at timestamptz DEFAULT now()
)
```

---

## 6. REGLAS DE ROW LEVEL SECURITY (RLS) — PRINCIPIOS

**Walled Garden:** cada actor ve solo sus propios datos.

```sql
-- Gondolero: ve solo sus propias fotos y participaciones
-- Distribuidora: ve fotos de campañas donde ella participa
-- Marca: ve fotos de sus propias campañas
-- Admin: ve todo (bypass RLS con service_role key)
```

Implementar RLS en todas las tablas. Nunca deshabilitar RLS en producción. El service_role key solo se usa en el servidor, nunca en el cliente.

---

## 7. CONVENCIONES DE CÓDIGO

### Generales
- **TypeScript estricto** — no usar `any`, siempre tipar correctamente
- **Nombres en español** para variables de dominio (`gondolero`, `campana`, `distri`) — el dominio es argentino
- **Nombres en inglés** para código técnico (`useRouter`, `useState`, `handleSubmit`)
- **Componentes**: PascalCase (`CampanaCard`, `FotoCaptura`)
- **Hooks**: camelCase con `use` prefix (`useCampanas`, `useGondolero`)
- **Archivos**: kebab-case (`campana-card.tsx`, `foto-captura.tsx`)
- Siempre usar `const` sobre `let`. Nunca `var`.
- Arrow functions para componentes React

### Next.js específico
- Usar **App Router** — no Pages Router
- **Server Components** por defecto, Client Components solo cuando necesario
- Agregar `'use client'` solo cuando hay interactividad (useState, useEffect, event handlers)
- Usar `loading.tsx` y `error.tsx` en todas las rutas
- Metadata con `generateMetadata` para SEO básico

### Supabase
- Usar el **server client** en Server Components y Route Handlers
- Usar el **browser client** solo en Client Components
- Siempre manejar errores de Supabase: `const { data, error } = await supabase...`
- Nunca ignorar errores silenciosamente

### Tailwind
- Mobile-first siempre (`sm:`, `md:`, `lg:`)
- La vista del gondolero es **mobile-first priority** — diseñar para 375px primero
- Los paneles de distri y marca son **desktop-first** — diseñar para 1280px

### Formularios
```typescript
// Patrón estándar con React Hook Form + Zod
const schema = z.object({...})
type FormData = z.infer<typeof schema>
const { register, handleSubmit } = useForm<FormData>({ resolver: zodResolver(schema) })
```

---

## 8. ALCANCE DEL MVP — QUÉ SE CONSTRUYE PRIMERO

El MVP es el subconjunto mínimo para testear con Biomega y Georgalos en el campo.

### INCLUIDO EN MVP

**Gondolero (mobile):**
- Registro con email + OTP
- Lista de campañas disponibles por zona (filtro básico por GPS)
- Unirse a una campaña
- Captura de foto con GPS validado (radio 50m del comercio)
- Upload de foto a Supabase Storage
- Declaración de resultado (presente/no encontrado/solo competencia)
- Ver puntos acumulados
- Dar de alta un comercio nuevo (GPS + nombre + foto fachada)

**Distribuidora (panel web):**
- Login con email
- Ver fotos recibidas de sus gondoleros por campaña
- Aprobar o rechazar fotos manualmente
- Ver lista de gondoleros vinculados
- Ver comercios en su zona

**Marca (panel web):**
- Login con email
- Crear campaña simple (tipo, zona, instrucción, fechas, bloques de foto)
- Ver fotos recibidas de su campaña
- Descargar CSV básico con resultados

**Admin (panel interno básico):**
- Login restringido
- Ver todas las fotos pendientes de validación
- Aprobar/rechazar manualmente
- Lista de usuarios por tipo

### EXCLUIDO DEL MVP (V2+)

- Sistema de tokens y compra de tokens
- Economía de puntos y canjes automáticos (manual en MVP)
- IA de reconocimiento de productos (Vertex AI)
- Fixer y pares antes/después
- Mensajería y tablón de campaña
- Notificaciones push
- Fondo de resguardo y penalidades automáticas
- Validación Pro de gondoleros (manual en MVP)
- CRM/funnel comercial
- P&L en tiempo real
- Fraude automático avanzado

---

## 9. VARIABLES DE ENTORNO NECESARIAS

```bash
# .env.local (nunca commitear)

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=GondolApp

# Opcional en MVP
RESEND_API_KEY=                  # Para emails transaccionales
TWILIO_ACCOUNT_SID=              # Para SMS en V2
TWILIO_AUTH_TOKEN=               # Para SMS en V2
```

---

## 10. COMANDOS DEL PROYECTO

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build de producción
npm run build

# Linting
npm run lint

# Supabase migrations (si usás Supabase CLI)
supabase db push
supabase gen types typescript --local > types/database.ts
```

---

## 10b. TIPOS DE LA BASE DE DATOS

`types/database.ts` se genera desde el schema real de Supabase.
Regenerar **SIEMPRE** que cambie el schema:

```bash
npx supabase gen types typescript --project-id xzznzustgsacmfwsupux > types/database.ts
```

Requiere estar logueado (`npx supabase login`). No editar el archivo a mano.

> **Regenerar los tipos es parte de la migración, no un paso aparte.** Si se
> agrega una columna y no se regenera `types/database.ts`, el código local
> compila igual —los `as any` que hay repartidos lo tapan— y **el build revienta
> recién en el deploy**. Pasó el 9/9/2026 con `fotos.campo_id`: dev quedó caído
> hasta regenerar. La secuencia completa es: escribir la migración → aplicarla a
> dev → regenerar los tipos → `npm run build` → recién ahí commitear.

> **Verificar siempre con `npm run build`, no con `tsc --noEmit`.** El build
> corre el chequeo de tipos de Next sobre todo el árbol de rutas, que agarra
> cosas que `tsc` suelto no ve. Dos deploys seguidos se cayeron el 9/9/2026 por
> errores que el build local hubiera detectado.

**Nota:** gran parte del código todavía usa `as any` y anotaciones de tipo
escritas a mano, donde TypeScript no valida contra estos tipos. Sacar esos
casts es deuda pendiente (ver `docs/AUDITORIA-2026-09.md`, sección 9.3).

---

## 11. FLUJOS CRÍTICOS — CÓMO FUNCIONAN

### Flujo de captura de foto (gondolero)

1. Gondolero selecciona campaña → se une → elige comercio
2. App verifica GPS: ¿está dentro de 50m del comercio? → si no, bloquea
3. App abre cámara nativa (`getUserMedia`) → gondolero saca foto
4. Validación en cliente: blur detection básico (si es muy borrosa, advierte)
5. Gondolero declara resultado: presente / no encontrado / solo competencia
6. App hace upload a Supabase Storage con metadata (lat, lng, timestamp, device_id)
7. Crea registro en tabla `fotos` con estado `pendiente`
8. Si hay conexión → sube inmediatamente. Si no → encola localmente (IndexedDB)
9. Admin o distri aprueba/rechaza manualmente en el MVP

### Autenticación y roles

```typescript
// Al login, el middleware verifica el tipo_actor del profile
// y redirige a la interfaz correcta:
// gondolero/fixer → /gondolero/campanas
// distribuidora → /distribuidora/dashboard
// marca → /marca/dashboard
// admin → /admin/tablero
```

### GPS y validación de proximidad

```typescript
// Usar navigator.geolocation.getCurrentPosition
// Calcular distancia con fórmula de Haversine
// Radio por defecto: 50 metros
// Si está fuera → deshabilitar botón de captura con mensaje claro
```

---

## 12. DISEÑO Y UX — PRINCIPIOS

### App del gondolero (mobile)
- Pantallas simples, una acción principal por pantalla
- Botones grandes (mínimo 44px de alto)
- Navegación inferior con tabs: Campañas / Misiones / Perfil
- Colores: verde (#1D9E75) como color primario
- Funciona offline — encolar fotos si no hay internet
- Texto en español rioplatense (vos, hacé, subí)
- Máximo 3 toques para completar cualquier acción

### Paneles web (distri y marca)
- Sidebar de navegación izquierdo
- Topbar con nombre de la empresa y saldo de tokens
- Tablas con paginación para listas largas
- Gráficos simples con recharts
- Color primario: indigo/púrpura (#4F46E5) para marcas, ámbar (#BA7517) para distris

### Admin (backend)
- Dark topbar (#1E1B4B)
- Sidebar compacto
- Tablas densas con mucha información
- Badge de excepciones pendientes siempre visible

---

## 13. CONTEXTO DE NEGOCIO PARA EL CÓDIGO

### Términos del dominio (usar estos en el código)
- `gondolero` = vendedor de campo que fotografía góndolas
- `fixer` = repositor que acomoda góndolas
- `campana` = campaña de relevamiento (con tilde en español, sin tilde en código: `campana`)
- `distri` o `distribuidora` = empresa distribuidora
- `marca` = empresa fabricante cliente de GondolApp
- `comercio` = punto de venta (almacén, kiosco, autoservicio)
- `gondola` = estantería del comercio donde están los productos
- `bounty` = recompensa en puntos por foto válida
- `puntos` = recompensa del gondolero (1 punto = $1 ARS)
- `tokens` = moneda de la plataforma que compran marcas y distris (1 token = U$S 1)

### Reglas de negocio críticas para el código
1. El GPS se valida **al iniciar la misión**, no al explorar campañas
2. La foto sin GPS válido **no se guarda** — bloqueo duro
3. Los puntos se muestran solo cuando están **confirmados** — nunca pendientes
4. Una foto con declaración "no encontrado" es dato válido, no error
5. La cuenta de puntos **nunca puede quedar negativa**
6. Las fotos eliminadas o rechazadas nunca se borran de Storage — solo cambia el estado

---

## 14. GIT Y DEPLOY

```bash
# Dos ramas, dos ambientes. Ver "Los dos ambientes" y "Regla de ramas".
dev  → gondolapp-dev.vercel.app  (Supabase mqeymmprvpclpyjpujvf)
main → app.gondolapp.com         (Supabase xzznzustgsacmfwsupux)

# Mensajes de commit en español
git commit -m "feat: agregar validación GPS en flujo de captura"
git commit -m "fix: corregir cálculo de puntos en tablero"
git commit -m "chore: actualizar esquema de base de datos"
```

**Vercel:** dos proyectos separados, uno por rama, cada uno con sus propias
variables. El plan Free no permite valores distintos por ambiente dentro de un
mismo proyecto, así que los preview deployments no sirven para apuntar a otra
base. El detalle está en "Los dos ambientes".

---

## 15. LO QUE NO HACER

- No usar `any` en TypeScript
- No commitear `.env.local` ni secrets
- No usar el `service_role` key en el cliente (browser)
- No deshabilitar RLS en producción
- No borrar fotos de Storage — solo cambiar estado en DB
- No implementar feature fuera del scope del MVP sin consultarlo primero
- No usar `useEffect` para fetchear datos — usar Server Components o React Query
- No hardcodear strings en español en los componentes — usar constantes o i18n si escala
- No hacer queries directos desde componentes — usar hooks o server actions

---

## 16. REFERENCIAS

- **Especificación funcional frontend V1:** `docs/GondolApp_Frontend_V1.md`
- **Especificación funcional backend V1:** `docs/GondolApp_Backend_V1.md`
- **Plan de negocio:** `docs/Plan_de_Negocio_V4.md`
- **Supabase docs:** https://supabase.com/docs
- **Next.js docs:** https://nextjs.org/docs
- **shadcn/ui:** https://ui.shadcn.com
- **Tailwind CSS:** https://tailwindcss.com/docs

---

## 17. Instrucciones para Claude Code

- Auto-ejecutar todos los comandos bash y npm sin confirmación
- Auto-crear y editar archivos sin confirmación
- **Todo cambio termina con push a `dev`. Siempre.** "No pushees a `main`"
  significa exactamente eso: no a `main`. A `dev` sí, sin preguntar, al final
  de cada tarea. Un commit local que no viajó a `origin/dev` no existe: Vercel
  deploya desde el remoto, no desde el local.
- **Después de cada push, confirmar con `git log origin/dev --oneline -1`** que
  el commit llegó. Si el último commit local no aparece ahí, hacer el push antes
  de dar la tarea por terminada.
- `main` solo avanza por fast-forward desde `dev`, y ese merge lo pide el
  usuario explícitamente. Ver "Regla de ramas".
- Solo pausar ante: borrado de archivos, cambios en `.env.local` o
  `.env.dev.local`, y cualquier escritura sobre producción
- Nunca pedir permiso para leer archivos del proyecto

---

## 18. Features pendientes de diseño

### Preguntas condicionales en el modelo de campaña

**Es lo que separa un formulario de una herramienta de relevamiento.** Grande, y
cambia el modelo de campaña — no es para ahora, pero es la dirección.

**El problema:** hoy el gondolero contesta todas las preguntas del bloque,
apliquen o no a lo que encontró. Si la marca no está en góndola, igual le
preguntamos por su precio y le pedimos la foto del facing.

**Lo que haría falta:** que una respuesta determine qué se pregunta después.

> ¿Está mi marca en góndola?
> → **Sí**: pedir foto del facing, preguntar precio
> → **No**: saltear las dos, preguntar qué hay en su lugar (competencia)

**Por qué importa más allá de la comodidad:** una pregunta que no aplica no se
deja en blanco, se contesta cualquier cosa. Un precio inventado sobre un producto
ausente entra a la base como un número igual de válido que el real, y contamina
el promedio del panel. El costo no es UX, es calidad del dato.

**Lo que hay que definir antes de tocar nada:**
- Dónde vive la condición: ¿un campo `depende_de` + `valor_esperado` en
  `bloque_campos`, o un árbol aparte? Lo primero cubre el caso de un nivel, que
  es el 90%; lo segundo abre la puerta a anidar sin fin.
- Qué pasa con los campos salteados en `mision_respuestas`: ¿no se insertan, o
  se insertan con un marcador de "no aplica"? **No es lo mismo para el panel**:
  sin marcador no se puede distinguir "no correspondía" de "no contestó", y los
  porcentajes del dashboard cambian según cuál sea el denominador.
- Cómo lo edita el que crea la campaña. Los cuatro formularios ya están
  duplicados (ver "Deuda conocida"); meter un editor de condiciones en cuatro
  lugares sin unificarlos antes es multiplicar el problema por cuatro.
- El impacto en `lib/resultados.ts`: los módulos agregan sobre el total de
  misiones. Con campos condicionales el denominador pasa a ser variable por
  campo, y eso toca los cinco tipos de módulo.

Registrado el 15/9/2026.

---

### Misiones de venta desde alertas (Alta prioridad)

**CONCEPTO:**
La distribuidora puede convertir una alerta de quiebre de stock en una "misión de venta" que les llega directamente a sus vendedores.

**DIFERENCIA CON CAMPAÑA NORMAL:**
- No es una campaña de fotos sino una misión de acción
- El vendedor va al comercio a VENDER, no a fotografiar
- Reporta si vendió o no, y el motivo si no pudo

**FLUJO PROPUESTO:**
1. Distri ve alerta "Quiebre de stock en Kiosco El Cid"
2. Toca "Crear misión de venta" desde la alerta
3. Se genera automáticamente una misión con:
   - Comercio pre-cargado (el del quiebre)
   - Productos a ofrecer (los de la distri)
   - Vendedores sugeridos (los que visitaron ese comercio)
4. Los vendedores reciben notificación in-app
5. El vendedor va al comercio y reporta:
   - ✅ Vendió — cantidad y productos
   - ❌ No vendió — motivo (no había encargado, precio alto, prefiere otra marca, local cerrado, etc.)
6. La distri ve el resultado en tiempo real

**DATO CLAVE DE NEGOCIO:**
El motivo de no venta es información de altísimo valor para la marca — es inteligencia competitiva real del campo. Esto justifica el Peldaño 2 del negocio (data para marcas).

**CONSIDERACIONES TÉCNICAS:**
- Nuevo tipo de misión: `'venta'` (distinto a `'foto'`)
- Nueva tabla: `misiones_venta` o extender `campanas` con `tipo = 'venta'`
- Nueva tabla: `resultados_venta` (vendio, motivo, productos, cantidad)
- El vendedor NO necesita sacar foto (opcional)
- Notificación push cuando le llega una misión de venta

**PREGUNTAS PENDIENTES DE DEFINIR:**
- ¿Se pagan puntos por misión de venta? ¿Cuántos?
- ¿Solo van los vendedores que visitaron ese comercio o cualquier vendedor de la zona?
- ¿El resultado de venta lo puede ver la marca también?
- ¿Hay un tiempo límite para completar la misión?

---

### Panel de beneficios segmentados para gondoleros

**CONCEPTO:**
Sistema de beneficios que permite ofrecer premios y recompensas a segmentos específicos de gondoleros, no a todos por igual.

**CASOS DE USO:**
- Beneficio exclusivo para gondoleros de Biomega
- Premio para gondoleros activos en zona Concordia
- Bono para gondoleros que completaron X campañas
- Crédito en cuenta corriente de su distribuidora

**SEGMENTACIÓN POSIBLE:**
- Por distribuidora vinculada (distri_id)
- Por zona de operación (gondolero_zonas)
- Por nivel (casual/activo/pro)
- Por cantidad de fotos aprobadas en un período
- Por campañas completadas
- Por zona geográfica específica

**TIPOS DE BENEFICIO:**
- Puntos extra acreditados directamente
- Premio físico (nafta, gift card, etc.)
- Crédito en cuenta corriente de la distribuidora (la distri le acredita al vendedor en su sistema)
- Descuento en productos de la distribuidora
- Acceso anticipado a campañas premium

**MODELO DE DATOS SUGERIDO:**
- Tabla: `beneficios` (id, nombre, descripcion, tipo, valor, fecha_inicio, fecha_fin, activo)
- Tabla: `beneficio_segmentos` (beneficio_id, tipo_segmento, valor_segmento) — ej: tipo='distri', valor='biomega_id'
- Tabla: `beneficio_gondoleros` (beneficio_id, gondolero_id, estado, otorgado_at) — tracking de quién recibió qué
- La distribuidora puede crear beneficios para sus propios gondoleros desde su panel
- GondolApp puede crear beneficios globales o segmentados desde el panel admin

**FLUJO PROPUESTO:**
1. Admin o distri crea un beneficio con segmentación
2. El sistema identifica qué gondoleros califican
3. Los gondoleros elegibles ven el beneficio en su sección de Actividad o en una nueva sección "Beneficios"
4. Al reclamar el beneficio se registra y se notifica
5. Si es crédito en distri → la distri recibe notificación para acreditarlo en su sistema

**DIFERENCIA CON CANJES:**
Los canjes son iniciativa del gondolero (gasta sus puntos). Los beneficios son iniciativa de la plataforma/distri (se otorgan por cumplir condiciones).

---

### Catálogo de canjes configurable (Media prioridad)

**CONCEPTO:**
Reemplazar los valores hardcodeados de puntos por canje por un catálogo dinámico administrable desde el panel admin.

**ESTADO ACTUAL:**
Los puntos mínimos para cada canje están en la tabla `configuracion` (`puntos_canje_celular`, `puntos_canje_nafta`, etc.) como valores simples.

**LO QUE FALTA:**
- Tabla `premios_catalogo` con cada premio como un registro independiente
- Cada premio tiene: nombre, descripcion, puntos, tipo, imagen, activo, disponible_desde (nivel)
- El admin puede agregar, editar, desactivar premios
- La distri puede agregar premios propios para sus gondoleros (beneficios segmentados — ver feature anterior)
- Los gondoleros ven el catálogo actualizado en tiempo real desde la DB

**RELACIÓN CON BENEFICIOS SEGMENTADOS:**
El catálogo de canjes es la base sobre la que se construyen los beneficios segmentados por distri/zona/nivel.

Eliminar la sección "Economía" del panel de configuración cuando se implemente el catálogo — los valores pasan a vivir en la tabla de premios.

---

### Texto explicativo de la campaña para el gondolero — YA EXISTE

Se planteó el 15/9/2026 como pendiente: que el creador escriba en criollo qué va
a tener que hacer el gondolero ("vas a entrar al comercio, preguntar quién le
provee, completar el precio, una foto y listo"), para que se entere **antes** de
aceptar y no adentro del comercio.

**Está construido de punta a punta.** Se relevó antes de anotarlo como pendiente:

| Pieza | Dónde |
|---|---|
| Columna | `campanas.instruccion`, desde el schema inicial |
| Captura | Los formularios de creación, como "Instrucción general", con placeholder "Qué deben hacer los gondoleros en esta campaña..." |
| Lista del gondolero | `campanas-sections.tsx:190` — bajo el nombre, con `line-clamp-2` |
| Detalle, **antes de unirse** | `gondolero/campanas/[id]/page.tsx:352` — con el encabezado **"¿Qué tenés que hacer?"** |

O sea que el lugar donde se muestra es exactamente el que se pedía, y el texto
del encabezado también.

**Lo que queda por verificar, que es otra cosa:**

- **¿Se está llenando?** Las dos vistas tienen guarda `{c.instruccion && ...}`,
  así que una campaña con el campo vacío no muestra nada **y no se nota**: no hay
  hueco, no hay placeholder, no hay aviso al creador. Si el problema real es que
  los creadores lo dejan vacío, la solución no es una feature nueva sino hacerlo
  obligatorio o mostrar el vacío en el editor.
- **El `line-clamp-2` de la lista.** Un texto de tres renglones se corta sin
  indicar que sigue. En la lista puede estar bien —el detalle lo muestra
  completo— pero conviene decidirlo, no que quede por default.
- **La colisión de nombres es real y es el riesgo que se identificó bien:**
  `campanas.instruccion` (la campaña entera, se ve antes de aceptar) y
  `bloques_foto.instruccion` (qué fotografiar en ese bloque) se llaman igual. En
  el editor hay que distinguirlas o el creador escribe lo mismo dos veces.

**Y en campañas de seguimiento vale más todavía**, que es lo genuinamente nuevo:
el repositor vuelve al mismo comercio muchas veces y necesita saber qué se espera
de **cada visita**, no de la campaña. Eso el campo actual no lo cubre — describe
la campaña, no la visita. Cuando se implemente la modalidad seguimiento hay que
decidir si alcanza con reescribir el texto o si hace falta un campo aparte.

### Catálogo de premios por marca y distribuidora

**Estado: pendiente de producto. No empezar — hay un problema sin resolver que
condiciona todo el modelo de datos.**

**El concepto.** Hoy el catálogo de premios es único y es de GondolApp. La idea
es que cada marca y cada distribuidora pueda cargar el suyo desde su panel, y
armar paquetes de premios seleccionables por campaña. Cada premio con su
descripción, su puntaje y sus datos propios.

Es la evolución del "Catálogo de canjes configurable" de más arriba, que se
queda en un catálogo único administrable; acá cada actor tiene el suyo.

**El problema conocido, que hay que resolver ANTES de construirlo.** Si los
premios son de cada marca o distri, los puntos quedan atados a quien los
entrega, y eso **fragmenta el incentivo del gondolero**. Junta 300 puntos con
una distribuidora y 150 con otra, y quizás con ninguno de los dos llega a nada.

El daño no es contable sino de producto: el gondolero deja de ver un saldo que
crece y pasa a ver varios montoncitos que no alcanzan. Eso toca directamente la
razón por la que sigue usando la app.

**Tres salidas a evaluar cuando se agarre.** Ninguna elegida, ninguna
descartada:

- **Una sola moneda, catálogos distintos.** GondolApp liquida entre las partes.
- **Monedas separadas más un catálogo base de GondolApp** que acepte cualquier
  punto.
- **Cada uno paga lo suyo y listo**, asumiendo la fragmentación.

**Y una pregunta previa que sigue sin respuesta: ¿los premios los paga la
distribuidora o GondolApp?** Mientras no esté contestada, las tres salidas de
arriba no se pueden comparar — cambia quién asume el costo en cada una.

Tocá también, cuando llegue el momento, el "Panel de beneficios segmentados"
de esta misma sección: los beneficios por distri se construyen sobre este
catálogo y heredan el mismo problema.

---

### Privacidad y anonimato en el ecosistema

**1. ALIAS ÚNICO PARA GONDOLEROS**

Cada gondolero tiene un alias único generado automáticamente que es lo que ve toda la plataforma. El nombre real solo lo ve el admin y su distribuidora vinculada.

**Pendiente de definir:**
- Sistema de nomenclatura para el alias (¿random como "Cóndor47"? ¿inicial + apellido? ¿auto-generado al crear cuenta?)
- Quién puede ver el nombre real: solo admin y la distri vinculada, o también las marcas cuyas campañas completó

---

**2. VISIBILIDAD DE CREADOR DE CAMPAÑA**

El gondolero NO ve quién creó la campaña a menos que sea su distribuidora vinculada.
- Si la creó su distri → mostrar nombre de la distri con badge especial "Tu distribuidora"
- Si la creó otra distri o una marca → ocultar el creador, mostrar solo el nombre de la campaña

**Consideraciones técnicas:**
- En `campanas/page.tsx` y `campanas/[id]/page.tsx` filtrar la visibilidad del campo `distri_id` / `marca_id` según el `distri_id` del gondolero en profiles
- Requiere que el gondolero tenga `distri_id` seteado en su perfil

---

**3. ETIQUETA DE DISTRIBUIDORA EN CAMPAÑA**

Las campañas tienen un campo `distri_id`. Solo se muestra el nombre de la distri al gondolero si coincide con su `distri_id` en profiles.

**Implementación sugerida:**
```typescript
// En campanas/page.tsx
const gondoleroDistriId = profile.distri_id
const campanas = campanas.map(c => ({
  ...c,
  distribuidora: c.distri_id === gondoleroDistriId ? c.distribuidora_nombre : null,
  esMiDistri: c.distri_id === gondoleroDistriId,
}))
```

---

**4. RELACIONAMIENTO GONDOLERO ↔ DISTRIBUIDORA**

El campo `distri_id` en `profiles` existe pero no hay un flujo formal de vinculación bidireccional.

**Lo que falta:**
- La distri debería poder ver y gestionar sus gondoleros vinculados (aprobarlos o desvincularlos)
- El gondolero debería poder solicitar vincularse a una distri (o la distri lo invita)
- Estado de vinculación: `pendiente` / `activo` / `suspendido`
- Cuando la distri desvincula a un gondolero, su `distri_id` vuelve a null

**Modelo de datos sugerido:**
- Agregar `distri_vinculacion_estado text DEFAULT 'pendiente'` a profiles
- O tabla separada `gondolero_distribuidoras (gondolero_id, distri_id, estado, created_at, updated_at)`

**Impacto en el negocio:**
Esta vinculación es clave para que la distri pueda asignar campañas exclusivas a "sus" vendedores y para el sistema de beneficios segmentados.

---

### Campañas conjuntas marca ↔ distribuidora
**Concepto:** Una marca y una distribuidora con relación activa pueden crear campañas conjuntas donde ambas partes co-financian o co-gestionan la campaña. La distribuidora aporta la red de gondoleros, la marca aporta el producto y los precios objetivo.

**Flujo propuesto:**
1. Relación marca ↔ distribuidora debe estar en estado `activa`
2. Marca crea campaña conjunta y selecciona la distribuidora socia
3. Sistema genera campaña con `tipo: 'conjunta'`, referenciando ambos IDs
4. Distribuidora recibe notificación y puede aprobar/rechazar participar
5. Si aprueba: campaña queda `activa`, visible para gondoleros de esa distribuidora
6. Si rechaza: marca puede invitar a otra distribuidora
7. Métricas separadas por actor (fotos de gondoleros de esa distri vs. externos)

**Diferencia con modelo actual:** Hoy una campaña tiene `distri_id` O `marca_id` pero no ambos de forma estructurada. Las conjuntas requieren co-ownership con permisos diferenciados.

**Prerrequisitos:** Relacionamiento formal marca ↔ distribuidora completado y con estado `activa`.

### Términos y condiciones en relacionamiento
**Estado:** Checkbox presente en `app/vinculacion-marca/page.tsx` al aceptar una invitación.

**Texto placeholder actual:** "Acepto los términos y condiciones de uso de GondolApp y autorizo el intercambio de información comercial entre las partes."

**Pendiente de legal:** El texto definitivo de los TyC debe ser redactado y aprobado por el equipo legal antes del lanzamiento a producción. El checkbox y la infraestructura (campos `acepto_tyc_marca`, `acepto_tyc_distri` en `marca_distri_relaciones`) ya están implementados.

**Campos en DB:**
- `acepto_tyc_marca boolean DEFAULT false` — se actualiza cuando la marca acepta
- `acepto_tyc_distri boolean DEFAULT false` — se actualiza cuando la distribuidora acepta

---

### Sistema de tokens para distribuidoras (Alta prioridad post-piloto)

**Concepto:**
Las distribuidoras no pagan la plataforma con dinero sino que ganan tokens haciendo acciones que alimentan el ecosistema. Las marcas son las que inyectan tokens al sistema al relacionarse con distribuidoras.

**Fuentes de tokens para distribuidoras:**

1. **Marca paga por vincularse (principal)**
   Cuando una marca se vincula a una distribuidora, paga X tokens que van directo a la cuenta de la distri.
   Lógica: la marca necesita la red de la distri para llegar al canal tradicional — eso tiene valor.

2. **Gondolero completa misión**
   Cuando se aprueba una foto de un gondolero vinculado, la distri gana Y tokens (pequeña fracción).
   Lógica: la distri aportó el gondolero al sistema.

3. **Comercio nuevo validado**
   Cuando la distri valida un comercio nuevo, gana Z tokens.
   Lógica: cada comercio mapeado enriquece el dataset.

4. **Gondolero nuevo vinculado**
   Cuando la distri incorpora un gondolero nuevo, gana W tokens.
   Lógica: ampliar la red de sensores tiene valor.

**Uso de tokens por la distribuidora:**
- Crear campañas internas (ya definido: 15 tokens)
- Solicitar informes especiales
- Acceder a datos de competencia en su zona
- Futuro: publicidad en el mapa de consumidores

**Flujo de tokens al vincularse con marca:**
1. Marca genera link de invitación a distri
2. Antes de generar el link, se muestra el costo: "Vincularte con esta distribuidora cuesta X tokens"
3. Marca confirma y se descuentan tokens de su cuenta
4. Distribuidora acepta la invitación
5. Tokens se acreditan en la cuenta de la distri

**Parámetros configurables (en tabla `configuracion`):**
- `tokens_vinculacion_marca_distri` — costo para la marca al vincularse
- `tokens_gondolero_mision` — tokens que gana la distri por foto aprobada
- `tokens_comercio_validado` — tokens por validar comercio nuevo
- `tokens_gondolero_nuevo` — tokens por vincular gondolero nuevo

**Implementación técnica:**
- Usar tabla `movimientos_tokens` existente en el schema
- La tabla ya tiene: `actor_id`, `actor_tipo`, `tipo`, `monto`, `concepto`
- Agregar los INSERT en `movimientos_tokens` en cada evento
- Actualizar `tokens_disponibles` en `distribuidoras`

**Relación con el modelo de negocio:**
- Las marcas son las que inyectan dinero/tokens al sistema
- Las distribuidoras son incentivadas a crecer la red
- Los gondoleros ganan puntos (no tokens)
- GondolApp retiene una parte de los tokens como take rate

---

### GondIA — Asistente de campañas con IA (V3)

Agente de IA integrado en los paneles de marca y distribuidora.
El usuario le describe su objetivo comercial en lenguaje natural ("quiero mejorar presencia de Flow Cereal en kioscos de Córdoba") y el agente lo orienta, sugiere configuraciones y puede llegar a armar la campaña lista para publicar.

El agente conoce el funcionamiento completo de la plataforma y aprende de los resultados históricos de campañas anteriores para hacer recomendaciones basadas en evidencia real.

**Prerequisito clave:** Requiere masa crítica de data histórica para ser útil — activar cuando haya mínimo 6 meses de campañas reales.

**Capacidades previstas:**
- Interpretar objetivos comerciales en lenguaje natural
- Sugerir tipo de campaña, zonas, bloques de foto y bounty óptimo en base a historial
- Pre-completar el formulario de nueva campaña con la configuración sugerida
- Explicar por qué recomienda cada parámetro ("en kioscos de Córdoba el bounty mínimo efectivo fue de 15 pts")
- Integración con Claude API (claude-opus-4-6 o claude-sonnet-4-6 según latencia requerida)

---

### Módulo de Campañas de Incentivo y Engagement (V2/V3)

#### 1. Campañas de Incentivo Marca → Vendedores (via Distribuidora)

Las marcas pueden crear campañas de incentivo dirigidas a los gondoleros/vendedores de las distribuidoras que las representan.

- **Concursos internos con ranking:** los gondoleros compiten entre sí por cantidad de misiones completadas, fotos aprobadas, cobertura de puntos de venta, etc.
- **Scope configurable:** competencia nacional, por provincia, por distribuidora
- **Ranking especial por campaña de incentivo**, separado del ranking general de la plataforma
- **Premios definidos por la marca** — no son puntos del sistema sino premios físicos o monetarios externos (efectivo, productos, viajes, etc.)
- La distribuidora actúa como canal de comunicación y validación, pero la marca financia y define las reglas del concurso

**Consideraciones técnicas:**
- Nuevo campo `tipo` en campanas: `'incentivo'`
- Nueva tabla `rankings_incentivo` con snapshot periódico de posiciones
- Los premios no pasan por `movimientos_puntos` — son registros informativos para que la marca/distri los gestione externamente
- Integración con el sistema de notificaciones para alertar a gondoleros de su posición en el ranking

#### 2. Campañas de Presencia con Materiales POP

Las marcas pueden crear campañas para distribuir materiales físicos en comercios:

- Remeras, merchandising, exhibidores, material POP, folletería
- El gondolero o fixer confirma la entrega con foto del material instalado en el comercio
- El comercio recibe el material gratis como incentivo a participar
- La marca tiene visibilidad de cuántos puntos de venta tienen su material activo en tiempo real
- Integrable con el sistema de fixers (V2) para instalación de exhibidores con par antes/después

**Consideraciones técnicas:**
- Nuevo `tipo` de bloque de foto: `'confirmacion_pop'`
- Nueva tabla `entregas_pop` (campana_id, comercio_id, gondolero_id, foto_id, estado)
- El mapa de calor de material activo es un output de alto valor para las marcas

#### 3. Campañas Directas a Comercios

Las marcas pueden crear campañas para incentivar a los comercios a participar activamente en GondolApp:

- Incentivos para que el comercio confirme qué marcas y SKUs vende
- Descuentos, bonificaciones o créditos para comercios verificados en la plataforma
- El comercio se convierte en actor activo (no solo pasivo relevado por gondoleros)
- Base para el módulo de **Commerce Offline** (Peldaño 5 del plan de negocio)
- Genera el **efecto red** necesario para que los comercios quieran estar en el mapa de GondolApp
- Datos auto-declarados por el comercio complementan los datos relevados por gondoleros

**Consideraciones técnicas:**
- Nuevo `tipo_actor`: `'comercio'` en profiles, con acceso a una interfaz simplificada
- Los comercios se auto-registran o son invitados por gondoleros/distris
- Nueva tabla `stock_declarado` (comercio_id, marca_id, sku, confirmado_at)
- Prerequisito: el mapa de comercios debe tener masa crítica (≥500 comercios verificados) para que tenga valor para las marcas

---

*Última actualización: Septiembre 2026*
*Versión del documento: 1.3*

---

## Estado al 7/9/2026 — retomando después de 5 meses

Cerrado en esta sesión:
- CHECK de 'terminada' en gondolero_distri_solicitudes y fixer_repo_solicitudes
  (bug de desvinculación abierto desde abril)
- search_path fijo en get_tipo_actor, get_distri_id, get_marca_id
- Registro público cerrado en Supabase (Authentication → Sign In / Providers)
- handle_new_user() con whitelist: solo acepta 'gondolero' desde metadata.
  Cerraba una vulnerabilidad crítica: con la anon key cualquiera podía
  registrarse como admin.
- types/database.ts generado con tipos reales (3230 líneas)
- Bug de campos tipo 'foto': la imagen se guardaba como URL de texto en
  foto_respuestas en lugar de generar su propia fila en fotos.
  Resuelto en 3 etapas + columna fotos.campo_id
  (migración 20260907110057_fotos_campo_id.sql, ex 045).

Documentos de referencia:
- docs/schema-real-2026-09.md — fuente de verdad de la DB. Regenerado desde
  producción el 7/9/2026 después de la reconstrucción; ya no tiene divergencias
  con las migraciones. Se verificó que dev, levantado por separado desde las
  mismas 57 migraciones, produce ese documento byte a byte.
- docs/schema-real-2026-09-pre-incidente.md — el dump anterior al DROP SCHEMA,
  solo como registro histórico. Es el insumo del que salieron los grupos A, B y
  C de la reconciliación de migraciones.
- docs/AUDITORIA-2026-09.md — auditoría completa, con Top 10 de prioridades

Próximos pasos, en orden:
1. ✅ Ambiente dev/prod separado — cerrado el 8/9/2026. Ver sección "Los dos
   ambientes" para la referencia completa (Supabase dev: mqeymmprvpclpyjpujvf,
   rama: dev, deploy: gondolapp-dev.vercel.app).
2. ✅ Migraciones faltantes — cerrado el 7/9/2026. Fueron nueve, no seis
   (aparecieron `bloque_campos` y `foto_respuestas`, que no estaban en la
   auditoría). Producción y dev se levantan desde las 57 migraciones y dan un
   schema idéntico byte a byte. Ver sección 2.6 de la auditoría.
3. Bugs abiertos:
   - draft-actions.ts hace APPEND de bloques al republicar sin borrar los
     anteriores: cada edición duplica bloques
   - ✅ misión con una foto rechazada queda en limbo — cerrado el 9/9/2026
     con la recaptura. La foto rechazada se marca con `reemplazada_por` al
     rehacerla y `actualizarEstadoMision` ya no la cuenta, así que la misión
     puede aprobarse. Queda pendiente el caso de una foto rechazada que el
     gondolero nunca rehace: ahí el bounty sigue retenido y no hay quién lo
     libere.
   (El tercero que figuraba acá —"el campo 'orden' no está en el select de
   captura/page.tsx"— ya está resuelto: `orden` se pide en el select y los
   campos se ordenan con él. Verificado el 8/9/2026.)
4. Eliminar la foto obligatoria del bloque (que la misión sea exactamente
   lo que el creador configuró). Se intentó en abril, terminó en rollback.
   Hacerlo recién con ambiente de dev.
5. RLS por fases: empezar por crear get_repositora_id()

---

## Deuda conocida — formularios de campaña duplicados

Los cuatro formularios de creación de campaña comparten la misma lógica pero
están duplicados en cuatro rutas distintas. Cada cambio en la UX del editor
debe aplicarse en los cuatro archivos. Hasta que se extraigan a un componente
compartido, cualquier modificación al flujo de creación requiere editar:

- `app/(marca)/marca/campanas/nueva/form.tsx` + `nueva/actions.ts`
- `app/(admin)/admin/campanas/nueva/page.tsx` + `nueva/actions.ts`
- `app/(distribuidora)/distribuidora/campanas/nueva/page.tsx` + `nueva/actions.ts`
- (repositora no tiene formulario propio todavía)

El único componente compartido hoy es `components/shared/campos-bloque-builder.tsx`.
La unificación es trabajo de refactor puro — sin cambios de producto.

---

## Pendiente de diseño — Dashboard por campaña

Hoy los reportes están diseñados alrededor de la foto: la pantalla se llama
"Góndolas", muestra tarjetas con imagen, y las respuestas van como texto debajo.
Con el modelo nuevo una campaña puede ser solo preguntas, sin fotos, y ahí no
hay dónde ver los resultados.

**Lo que se necesita:** un dashboard por campaña con métricas agregadas arriba y
galería de fotos abajo cuando las haya. El tipo de visualización varía por campo:

| Tipo | Visualización |
|------|--------------|
| Binaria (sí/no) | Porcentaje sobre total de comercios relevados |
| Número | Promedio, mínimo, máximo, distribución |
| Selección única / múltiple | Distribución por opción |
| Texto libre | Lista (no se agrega) |
| Foto | Galería |

Requiere definición de producto antes de implementar: qué pregunta tiene que
responder cada reporte, y para quién (distribuidora, marca, repositora).

**No empezar sin definición.** Registrado el 9/9/2026.

---

## Limitación conocida — campañas finalizadas (panel gondolero)

La sección "Campañas finalizadas" en `/gondolero/campanas` filtra usando `fecha_fin`
(la fecha planificada de vencimiento de la campaña), no una columna `cerrada_at`
que no existe en el esquema. Esto introduce dos casos imprecisos:

- **Campaña cerrada antes de `fecha_fin`**: sigue apareciendo en "Campañas finalizadas"
  hasta que `fecha_fin` sea mayor a 90 días, aunque ya cerró hace más tiempo.
- **Campaña vencida sin cerrarse** (o cerrada mucho después de `fecha_fin`): puede
  desaparecer de la lista antes de tiempo, o aparecer pasado el límite de 90 días.

El filtro actual (`!fecha_fin || ahora - new Date(fecha_fin).getTime() <= 90 días`) es
la mejor aproximación con los datos disponibles. Si se agrega una columna `cerrada_at`
en el futuro, reemplazar el filtro en `app/(gondolero)/gondolero/campanas/page.tsx`.

---

## Decisión — gráficos del dashboard: a mano, sin librería (14/9/2026)

**Se evaluó Apache ECharts con `renderToSVGString()` en un Server Component, y
se descartó.** No por fallar: funciona.

Lo que dio el spike, medido y no supuesto:

| | |
|---|---|
| ¿Corre en el runtime de Vercel? | **Sí.** `/spike-echarts/svg` devolvió 200, `image/svg+xml`, 2.482 bytes desde el deploy de dev |
| ¿El SVG necesita JavaScript? | **No.** Sin `<script>`, sin handlers `on*`, ni en el archivo crudo ni inline en el HTML |
| ¿Cuánto pesa en el cliente? | **Cero.** First Load JS compartido 87.5 kB antes y después, idéntico. Importado solo desde servidor, no viaja |
| ¿Cuántas líneas costó una barra horizontal? | 28 (cuerpo de la función) |

**Por qué se descartó igual.** El único gráfico que justificaba la dependencia
era el histograma de distribución del módulo `numero`. Y el histograma no
aporta sobre el listado ordenado con contexto que ese módulo ya tiene:

- Un listado ordenado **ya es un gráfico de distribución** — es la función de
  cuantiles escrita en vez de dibujada. Conserva *más* información que un
  histograma, porque mantiene la identidad de cada comercio; pierde solo el eje
  de densidad.
- El caso donde el histograma sí gana es la distribución con dos grupos
  (mayoristas y kioscos, por ejemplo), donde el promedio cae en el medio, en un
  precio que no cobra nadie. Pero con pocos valores ese hueco se ve igual como
  un salto entre dos renglones.
- **Volúmenes reales al 14/9/2026: máximo 26 valores en producción, 29 en dev.**
  El resto de los campos `numero`, 9 o menos. El umbral donde el listado deja de
  leerse y empieza a ser scroll está en torno a los 100.

Los otros tres gráficos —binaria, selección y avance— ya están dibujados con
divs en `components/campanas/modulos/piezas.tsx` (`BarraProporcion`), y
funcionan. Pasarlos a SVG tiene un solo beneficio real: el export autocontenido.
Así que **eso se hace dentro de la etapa del export, cuando el export lo exija**,
y no antes. La "etapa 2 de gráficos" se disolvió.

**Cuándo reconsiderarlo:** si alguna campaña pasa de ~100 valores en un campo
`numero`. El spike funcionó y está documentado acá; rehacerlo es instalar
`echarts` y escribir 28 líneas.

---

## Pendiente de UI — jerarquía de la lista de campañas (panel de marca)

En el panel de marca las campañas cerradas caen al pie de la lista, con poco
peso visual: apenas un texto. La campaña del piloto de Georgalos —que es la que
tiene los datos reales, y la que una marca entra a ver— queda perdida abajo de
todo.

**Lo que hay que revisar:** el criterio de orden. Hoy la lista agrupa por estado
y pone las cerradas últimas
(`app/(marca)/marca/campanas/campanas-filtro.tsx`, donde se arman `activas`,
`pendientes`, `borradores` y `cerradas`). El supuesto es que "activa" equivale a
"importante", y no es cierto: **una campaña cerrada con resultados sigue siendo
relevante, quizás más que una activa que todavía no tiene datos.**

Posibles criterios a evaluar, ninguno decidido: ordenar por volumen de
resultados en vez de por estado, separar "con datos" de "sin datos", o darle a
la cerrada con resultados el mismo tratamiento visual que a una activa.

No implementar sin definir el criterio. Registrado el 9/9/2026.

---

## Deuda conocida — scripts de seed

Detectada al reconstruir producción el 7/9/2026 después de un
`DROP SCHEMA public CASCADE` ejecutado por error. Los scripts corrieron bien y
restauraron el piloto completo, pero tienen dos defectos que hay que conocer
antes de volver a usarlos.

### `scripts/seed-demo-completo.ts`

**1. El encabezado miente: NO es idempotente "en todo".**
Dice *"Idempotente: usa ON CONFLICT DO NOTHING / upsert en todo"*. Es cierto
para marcas, distribuidoras, repositoras, gondoleros, fixers, comercios del
CSV, campañas, bloques, participaciones y para las misiones y fotos de la
campaña 1 (Georgalos) — todos buscan antes de insertar.

**No lo es** para las misiones y fotos de las campañas 5, 6 y 7, que insertan
sin ninguna guarda de existencia. Correr el script dos veces las duplica.

**2. El filtro de comercios ficticios está roto.**
```ts
.from('comercios').select('id').eq('nombre', c.nombre).eq('ciudad' as any, c.ciudad)
```
`comercios` **no tiene columna `ciudad`**. El `as any` silencia a TypeScript;
en runtime PostgREST devuelve 42703, el script no chequea el error, interpreta
"no existe" e inserta igual. O sea que los ~72 comercios ficticios se duplican
en cada corrida.

**Consecuencia práctica:** el script es seguro sobre tablas vacías, que es el
caso para el que se usó. **No lo corras sobre una base ya poblada** sin
arreglar estos dos puntos antes.

Lo que sí funciona bien y conviene no romper: reutiliza las entidades
existentes buscando por `razon_social` exacto, y los usuarios de auth por
email, así que no duplica cuentas. Pero esa reutilización depende de la
coincidencia **exacta** del nombre — cualquier diferencia de acento, puntuación
o espaciado crea una entidad nueva con otro ID.

### `scripts/seed-zonas.ts`

No es idempotente por diseño: **arranca borrando** `campana_localidades`,
`gondolero_localidades`, `localidades`, `departamentos` y `provincias`, en ese
orden. Es inocuo sobre tablas vacías, pero correrlo con datos ya cargados
**borra las zonas asignadas a gondoleros y las localidades de las campañas**,
que no las repone nadie. Ver la nota sobre `gondolero_localidades` más abajo.

---

## Restauración de producción tras un `DROP SCHEMA public CASCADE`

Procedimiento ejecutado el 7/9/2026 después de que se corriera
`DROP SCHEMA public CASCADE` sobre producción por error. Quedó documentado
porque funcionó y porque el paso 2 no está en ninguna migración.

### Qué sobrevive y qué no

**`auth.users` sobrevive.** Vive en el esquema `auth`, no en `public`, así que
el `DROP SCHEMA public` no lo toca: **las cuentas no se pierden**, con sus ids,
emails y contraseñas intactos.

**`public.profiles` sí se pierde**, porque está en `public`. Y con él se pierde
el vínculo entre cada cuenta y su `tipo_actor`, `distri_id`, alias y puntos.
Resultado: usuarios que pueden loguearse pero no tienen perfil, así que la app
no sabe qué son y el middleware no los puede redirigir.

Storage tampoco se toca — las fotos siguen ahí. En este proyecto además las del
piloto están en Google Drive, no en Storage.

### Orden de ejecución

Los pasos son secuenciales y ninguno es opcional.

**1. Aplicar las migraciones** (57 al 7/9/2026)

```bash
node scripts/aplicar-migraciones.mjs --ref <project-ref>
```

Requiere `PGURL` en el entorno y `npm install --no-save pg`. El `--ref` se
valida contra la connection string: es la guarda para no aplicar DDL al
proyecto equivocado.

**2. Reponer los GRANT del esquema — EL PASO QUE FALTA EN TODAS LAS MIGRACIONES**

`DROP SCHEMA public` se lleva los permisos de los roles de Supabase junto con el
esquema, y **ninguna migración los repone** porque los crea Supabase al
provisionar el proyecto, no el versionado del schema.

Sin esto la app **no lee absolutamente nada** aunque los datos estén todos: cada
query devuelve `permission denied for schema public`. Es el fallo más
desconcertante de todos, porque la base se ve perfecta desde el SQL Editor —
que corre como `postgres` y no necesita estos grants.

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA public TO anon, authenticated, service_role;

-- Para que los objetos que se creen DESPUÉS también queden accesibles:
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES  TO anon, authenticated, service_role;
```

> Los `GRANT ALL` son amplios a propósito: replican lo que Supabase configura de
> fábrica. Lo que efectivamente limita el acceso de `anon` y `authenticated` es
> la RLS, no estos permisos. No los restrinjas sin revisar antes toda la RLS.

**3. Restaurar entidades y perfiles**

SQL manual a partir de un CSV de `profiles` exportado de antes del incidente.
Restaura las filas de `profiles` con sus ids originales — que siguen siendo
válidos porque `auth.users` no se perdió — más las entidades
(`distribuidoras`, `marcas`, `repositoras`) con sus ids originales.

Restaurar las entidades con **los mismos ids** es lo que evita que el seed
cree duplicados.

**4 a 7. Poblar los datos**

Un solo comando: ver "Poblar un ambiente desde cero".

```bash
GONDOLAPP_PROD=1 npx tsx scripts/poblar-ambiente.mjs --ref xzznzustgsacmfwsupux
```

Encadena geografía, seed del piloto y los cuatro fix, y **verifica al final**.
Es lo que evita el modo de falla de esta restauración: el 7/9 se corrieron los
pasos sueltos, faltaron dos, y el ambiente quedó con presencia 0% y las fotos
sin cargar sin que nada avisara.

Todos los scripts exigen `--ref`, buscan las credenciales por ese ref entre los
`.env*.local`, y piden `GONDOLAPP_PROD=1` cuando el destino es producción.
Requiere `npm install --no-save pg tsx`.

### Lo que este procedimiento NO restaura

`gondolero_localidades` queda vacía: ningún script la puebla, porque cada
gondolero elige sus localidades desde su propio perfil. Mientras esté vacía, el
filtro de campañas por zona es fail-open — el gondolero ve todas las campañas y
la UI le muestra un aviso para que las configure. No bloquea la operación, pero
la segmentación por gondolero no funciona.

`campana_localidades` **sí** se puebla, desde el 8/9/2026, en el séptimo paso.


### Nunca canalizar un comando destructivo o largo

Aprendido el 7/9/2026 aplicando las migraciones a dev:

```bash
# MAL — head cierra el pipe y le manda SIGPIPE a node, que muere a mitad
node scripts/aplicar-migraciones.mjs --ref <ref> --reset --grants | head -45

# BIEN — redirigir a archivo y leerlo después
node scripts/aplicar-migraciones.mjs --ref <ref> --reset --grants > /tmp/corrida.log 2>&1
cat /tmp/corrida.log
```

Con el pipe, el `--reset` alcanzó a borrar el esquema y la corrida murió cerca
del archivo 37 de 57. La base quedó a medias y sin GRANTs.

Peor que el corte fue lo que vino después: **el log truncado no dice dónde se
detuvo la ejecución, solo dónde se dejó de mostrar.** Reanudar con `--desde`
tomando el último archivo visible del log falla con errores confusos —
`policy ... already exists`— porque en realidad se habían aplicado unos cuantos
más. Si una corrida se corta, el punto de reanudación se determina
**consultando la base**, no leyendo el log. Y si la base es descartable, lo
determinista es un `--reset` limpio y volver a empezar.

---

## Los dos ambientes

Montado el 7/9/2026, después de que un `DROP SCHEMA` sobre producción dejara en
claro que no había dónde probar.

| | Producción | Dev |
|---|---|---|
| Rama | `main` | `dev` |
| Proyecto Supabase | `xzznzustgsacmfwsupux` | `mqeymmprvpclpyjpujvf` |
| Proyecto Vercel | el original | uno **separado**, con Production Branch = `dev` |
| Credenciales locales | `.env.local` | `.env.dev.local` |

### Por qué dos proyectos de Vercel y no Preview Environments

El plan Free no permite valores distintos por ambiente dentro de un proyecto:
el selector de Environments está deshabilitado. Pero sí permite varios
proyectos, y cada uno tiene sus propias variables. Dos proyectos esquivan la
limitación sin pelearla.

La alternativa era elegir credenciales en el código según
`VERCEL_GIT_COMMIT_REF`. Se descartó: mete lógica de selección de credenciales
en la app, donde un bug apunta producción a dev o —peor— dev a producción. Y
como `NEXT_PUBLIC_*` se inlinea en build time, la selección tendría que vivir
en `next.config.js` para no terminar embebiendo los dos juegos de credenciales
en el bundle del cliente. Es volver frágil algo que puede ser trivial.

### Variables en Vercel

De las 20 variables, **solo tres cambian entre ambientes**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Las otras 17 se copian igual. `PGURL` **no va a Vercel**: es solo para los
scripts locales.

`NEXT_PUBLIC_APP_URL` sí hay que cambiarla en el proyecto de dev, apuntándola a
su propia URL de deploy. Si queda con la de producción, los links de invitación
generados desde dev mandan a la gente a producción. Ver "Deuda: URLs con
fallback a producción" más abajo.

Y hay que agregar la URL del deploy de dev a las **Redirect URLs** del proyecto
Supabase de dev (Authentication → URL Configuration), o el login no vuelve.

### Regla de trabajo

1. Se desarrolla contra `dev`: rama `dev`, base de dev, su propio deploy.
2. Se prueba ahí, incluido lo que solo anda en un celular real — GPS, cámara,
   giroscopio, el validador de inclinación. Esas APIs exigen contexto seguro:
   **no funcionan por `http://` contra una IP de la LAN**, solo por HTTPS o
   `localhost`. Por eso el deploy de dev, y no exponer el `npm run dev`.
3. Cuando está probado, se mergea `dev` → `main`, y eso deploya a producción.
4. Los cambios de schema van como migración en `supabase/migrations/`, se
   aplican primero a dev con `aplicar-migraciones.mjs --ref <dev>`, y recién
   después a producción.

### Cómo se arman los links que salen de la app

Los links de invitación y de recuperación de contraseña necesitan saber a qué
ambiente apuntar. Hay dos formas, según dónde corra el código:

**En servidor** (server actions y server components): `appUrl()` de
`lib/app-url.ts`, que lee `NEXT_PUBLIC_APP_URL` y **tira error si falta**.

**En cliente**: `window.location.origin`, que se adapta solo y no depende de
ninguna variable. Ver `app/auth/recuperar/page.tsx`.

Por qué el helper tira error en vez de tener un default: hasta el 7/9/2026
había 11 lugares con un fallback a un dominio de producción hardcodeado —siete
a `gondolapp-delta.vercel.app` y cuatro a `gondolapp.com`, sin criterio claro.
Con dos ambientes eso es peligroso: si falta la variable en el deploy de dev,
los links generados desde dev apuntan en silencio a producción y quien los abra
se vincula contra datos reales creyendo que está en dev. **No falla, cruza de
ambiente sin avisar**, que es el peor modo de falla posible. Un error explícito
en el deploy de dev se ve y se arregla en minutos.

Si aparece ese error en un deploy, la causa es siempre la misma: falta
`NEXT_PUBLIC_APP_URL` en ese proyecto de Vercel.

---

## Poblar un ambiente desde cero

**Un comando:**

```bash
npx tsx scripts/poblar-ambiente.mjs --ref <project-ref>
```

Encadena los siete pasos, se niega a correr sobre un ambiente ya poblado
(`seed-demo-completo` no es idempotente — ver "Deuda conocida") y, sobre todo,
**verifica al final y falla si quedó incompleto**.

Esa verificación es lo que justifica el script. **El seed solo no alcanza**, y
un ambiente a medias NO se queja: da **presencia 0% y las fotos sin cargar**,
síntomas que parecen bugs de la app y mandan a cazar errores que no existen.
Pasó en producción tras la reconstrucción y volvió a pasar en dev.

Los siete pasos, si hace falta correr alguno suelto:

```bash
npx tsx scripts/seed-zonas.ts                    --ref <project-ref>
npx tsx scripts/seed-demo-completo.ts            --ref <project-ref>
npx tsx scripts/fix-localidad-comercios.mjs      --ref <project-ref>
npx tsx scripts/fix-declaracion-georgalos.mjs    --ref <project-ref>
npx tsx scripts/fix-fechas-piloto.mjs            --ref <project-ref>
npx tsx scripts/fix-foto-urls-v2.mjs             --ref <project-ref>
npx tsx scripts/asignar-campana-localidades.mjs  --ref <project-ref>
```

Requisitos: `npm install --no-save pg tsx` (ojo, instalarlos **juntos**: un
`npm install --no-save X` borra los `--no-save` anteriores), un
`.env.<nombre>.local` con las credenciales del proyecto, y `GONDOLAPP_PROD=1`
adelante si el destino es producción.

Qué aporta cada uno, y qué se rompe si falta:

| Paso | Aporta | Si falta |
|---|---|---|
| `seed-zonas` | 24 provincias, 524 departamentos, 942 localidades | Todo lo demás falla: los comercios no tienen dónde ubicarse |
| `seed-demo-completo` | Entidades, usuarios, comercios, campañas, misiones, fotos, puntos | No hay nada |
| `fix-localidad-comercios` | `comercios.localidad_id` | El filtrado por zona queda inerte y el paso de `campana_localidades` del seed no asigna nada |
| `fix-declaracion-georgalos` | `fotos.declaracion` desde el CSV | **Presencia 0%**: sin declaración no hay producto presente que contar |
| `fix-fechas-piloto` | `created_at` real del relevamiento (11–14/3/2026) | Todo el piloto aparece con fecha del seed |
| `fix-foto-urls-v2` | URLs de Drive en formato `thumbnail` | **Fotos sin cargar**: el seed escribe `/uc?export=view` y `next.config.js` solo admite `/thumbnail` |
| `asignar-campana-localidades` | `campana_localidades` | Todos los gondoleros ven todas las campañas: el filtro por zona trata a la campaña sin zona como abierta |

El CSV del piloto está **versionado en el repo**, en `data/georgalos-piloto.csv`,
y `scripts/lib/csv-piloto.mjs` es lo único que sabe dónde vive. Hasta el
8/9/2026 los scripts lo leían de una ruta de OneDrive, lo que hacía que el
procedimiento no fuera reproducible fuera de una máquina.

Por qué `asignar-campana-localidades` va al final y no dentro del seed: se
derivan de los comercios relevados, así que necesita que
`fix-localidad-comercios` ya haya corrido. Cuando vivía dentro del seed (paso 2)
siempre asignaba cero.

### Cómo verificar que quedó completo

Los síntomas son silenciosos, así que conviene chequear a mano:

- **Presencia** distinta de 0% en el detalle de la campaña Georgalos
- **Fotos** que cargan, y sus URLs con `thumbnail` y no con `uc?export=view`
- **Fechas** de las misiones entre el 11 y el 14 de marzo de 2026
- `comercios` con `localidad_id IS NULL` en **cero**
- `campana_localidades` con filas: si está vacía, el filtro por zona no
  discrimina y todos ven todas las campañas

### Regla de ramas: `main` nunca recibe commits directos

Todo trabajo entra por `dev`. `main` solo avanza por merge desde `dev`, y como
nunca tiene commits propios ese merge es **siempre fast-forward**: no hay
conflictos ni divergencia posible.

```
trabajo → dev → (se prueba en el deploy de dev) → main → producción
```

Para verificar que están alineadas, dos comandos:

```bash
git log --oneline dev..main    # commits en main que no están en dev
git log --oneline main..dev    # commits en dev que no están en main
```

- **Los dos vacíos**: alineadas.
- **Solo el segundo con contenido**: normal, `dev` está adelante. Falta mergear.
- **El primero con contenido**: alguien commiteó directo a `main`. Hay que
  traerlo a `dev` antes de seguir, o el próximo merge deja de ser fast-forward.

Esto no es teórico: el 7/9/2026 se perdió un rato buscando en `dev` unos fixes
de CSP que en realidad ya tenía, porque no había forma rápida de saber el
estado. Los dos comandos de arriba lo responden en un segundo.

### Idea pendiente: unificar vista de góndolas entre paneles

Hoy cada panel tiene su propio layout para mostrar las fotos:
- Marca y admin: vista de tarjetas (foto grande, grid).
- Repositora y distribuidora: vista de lista (thumbnail pequeño + detalle en tabla).

La idea es agregar un selector "Tarjetas / Lista" en todos los paneles, de modo
que el usuario pueda alternar según su preferencia. El estado podría vivir en
localStorage (por panel) para que persista entre sesiones sin servidor.

No implementar hasta definir si las dos vistas deben ser idénticas entre paneles
o si cada rol tiene restricciones distintas (p. ej. el panel de repositora no
tiene botones de aprobar/rechazar, solo lectura).

---

### La CSP y los redirects de imágenes

Cuando se agrega un origen de imágenes a `img-src`, hay que permitir **el
dominio de entrada y el de destino** de cualquier redirect. La CSP se evalúa
contra la URL final, así que permitir solo el primero no alcanza — y el error
menciona un dominio que no aparece en ninguna parte del código, que es lo que
lo hace difícil de diagnosticar.

Ya pasó tres veces:

| Se pide | Redirige a | Hay que permitir |
|---|---|---|
| `drive.google.com/thumbnail` | `lh3.googleusercontent.com` | `*.googleusercontent.com` |
| `picsum.photos` | `fastly.picsum.photos` | `*.picsum.photos` |

Alternativa de fondo, para no seguir enumerando: servir toda imagen remota por
`next/image`. El browser pide `/_next/image?url=...`, que es mismo origen, y
entonces `img-src 'self'` alcanza para cualquier dominio. La lista de orígenes
permitidos queda solo en `images.remotePatterns` de `next.config.js`, que es
server-side y **no le afectan los redirects**: el servidor los sigue solo.

---

## MERGE dev → main (pendiente, requiere sesión dedicada)

No mergear hasta tener tiempo de probar producción inmediatamente después.

**Lo que acumula `dev` respecto a `main`:**
- Refactor completo del flujo de captura (foto implícita eliminada, misiones
  con campos configurables)
- Panel de resultados unificado (`lib/resultados.ts` + `ResultadosView.tsx`)
- Fix del limbo de misiones: Casos A (survey-only) y B (todas aprobadas)
- `mision_respuestas`: unificación de respuestas (migración Etapa 1 corrida
  en dev, pendiente en producción)
- `motivo_rechazo` en fotos + aviso de recaptura en la app del gondolero

**Antes del merge — aplicar en producción (Supabase xzznzustgsacmfwsupux):**
1. Migración `fotos_campo_id` (columna `campo_id` en `fotos`)
2. Migración `mision_respuestas` (tabla nueva + Etapa 1 SQL de migración de datos)
3. Migración `fotos_motivo_rechazo` (columna `motivo_rechazo` en `fotos`)
4. Migración `20260909170000_fotos_reemplazada_por.sql` (columna
   `reemplazada_por` en `fotos`). **Sin ella la recaptura rompe en producción**:
   la app filtra por esa columna en el aviso de fotos rechazadas y en
   `actualizarEstadoMision`. Aplicada en dev el 9/9/2026.
5. Migración `20260909190000_misiones_estado_descartada.sql` (agrega
   `'descartada'` al CHECK de `misiones.estado`). **Sin ella el descarte de
   recaptura falla con error de constraint**, porque el UPDATE escribe un
   estado que la base no acepta.
6. Cualquier otra migración pendiente entre ambos proyectos Supabase
7. Correr el script de diagnóstico de misiones en limbo y decidir si repararlas
   (script de conteo — solo lectura, ver pendientes)

**Después del merge — verificar en producción:**
- Flujo de captura completo con un gondolero real
- Campañas existentes siguen pidiendo las mismas fotos que antes
- Los cuatro paneles de resultados (marca, distri, repositora, admin)
- Contador de misiones completadas en todos los paneles
- Campañas de solo preguntas muestran respuestas

**Script de diagnóstico de misiones en limbo** (solo lectura, correr antes del merge):
```sql
-- Misiones pendientes con todas las fotos resueltas (Caso B sin disparar, o Caso C en limbo)
SELECT
  m.id          AS mision_id,
  m.estado,
  m.gondolero_id,
  m.campana_id,
  m.created_at,
  COUNT(f.id)                                          AS total_fotos,
  COUNT(f.id) FILTER (WHERE f.estado = 'aprobada')    AS aprobadas,
  COUNT(f.id) FILTER (WHERE f.estado = 'rechazada')   AS rechazadas,
  COUNT(f.id) FILTER (WHERE f.estado IN ('pendiente','en_revision')) AS pendientes
FROM misiones m
JOIN fotos f ON f.mision_id = m.id
WHERE m.estado = 'pendiente'
GROUP BY m.id
HAVING COUNT(f.id) FILTER (WHERE f.estado IN ('pendiente','en_revision')) = 0
ORDER BY m.created_at;

-- Misiones pendientes sin fotos (survey-only que no se auto-aprobaron)
SELECT m.id, m.gondolero_id, m.campana_id, m.created_at
FROM misiones m
LEFT JOIN fotos f ON f.mision_id = m.id
WHERE m.estado = 'pendiente'
  AND f.id IS NULL
ORDER BY m.created_at;
```

---

## 20. Decisiones de arquitectura — offline y Background Sync

### registrarMision debe vivir en un único lugar

Cuando se implemente Background Sync (el SW envía misiones offline con la app
cerrada), el SW no puede llamar Server Actions — son POST a `/_next/action` con
headers que Next.js valida y que no funcionan desde un contexto de SW.

El SW necesitará un Route Handler convencional (`app/api/gondolero/sync-mision/route.ts`)
que acepte el payload y registre la misión. El problema que esto introduce: si
la lógica de registrar una misión vive duplicada en el Server Action (`actions.ts`)
y en el Route Handler, cada fix o cambio de regla tiene que aplicarse en dos
lugares — que es exactamente el patrón que nos mordió tres veces esta semana
(comercios_cache, respuestas de retake, búsqueda de comercios).

**La regla para cuando llegue ese momento:** extraer la lógica de registro a una
función pura en `lib/misiones/registrar.ts` (o similar) que recibe el payload
tipado y devuelve el resultado. Tanto el Server Action como el Route Handler la
llaman — no la duplican. El Route Handler solo maneja auth y parsing del request;
el Action solo adapta el input del formulario. La lógica de negocio (crear filas
en misiones, fotos, mision_respuestas, acreditar puntos) va en la función compartida.

Este patrón aplica a cualquier operación que deba ser accesible tanto desde la
UI como desde el SW.

### TRAMO PROPIO — Background Sync, con la extracción de registrarMision adentro

Anotado el 23/9/2026, después de arreglar el drenaje en primer plano.

**Qué queda sin resolver.** El drenaje ahora se dispara al volver la app al
frente (`visibilitychange` + `focus`, con la condición en estado), lo que cubre
"el gondolero vuelve a abrir la app". **No cubre "la cerró y no la volvió a
abrir en todo el día"**: sin pestaña viva no hay nadie que pregunte.

Background Sync es la única API que despierta al service worker sin pestaña
abierta cuando vuelve la conexión.

**Lo que hay que hacer, en orden:**

1. **Extraer `registrarMision` a `lib/misiones/registrar.ts`** — es el
   prerrequisito y es la mitad del trabajo. El SW **no puede llamar Server
   Actions**: son POST a `/_next/action` con headers que Next valida y que no
   se pueden reproducir desde un contexto de SW. Hace falta un Route Handler
   (`app/api/gondolero/sync-mision/route.ts`) y que los dos —el Action y el
   Handler— llamen a la misma función. Duplicar la lógica es el patrón que ya
   mordió tres veces en este proyecto.
2. **Registrar el `sync` desde la app** cuando se guarda una misión en la cola.
3. **El handler `sync` en `public/sw.js`**: leer IDB —`idb-keyval` es accesible
   desde el SW, los blobs también— y postear al Route Handler.

**Límites conocidos, para no prometer de más:**

- **Es solo Chromium.** En iOS no existe Background Sync. Para esa parte de la
  flota el arreglo del 23/9 es todo lo que va a haber.
- El evento `sync` lo agenda el browser, no nosotros: dispara "cuando vuelva la
  conectividad", con su propio criterio de cuándo.
- Necesita que el SW haya sido registrado con una pestaña abierta antes.

**Por qué va después y no antes**, que fue la decisión del 23/9: si el drenaje
en primer plano no es confiable, un bug en el SW es imposible de aislar — no se
puede distinguir "Background Sync no disparó" de "disparó y falló" de "no hacía
falta porque el otro camino ya lo había mandado".

---

## 19. Bugs conocidos / pendientes de pulido

### motivo_rechazo se guarda pero no se muestra en notificación
El campo `fotos.motivo_rechazo` se escribe correctamente cuando el revisor rechaza.
El gondolero lo ve en la pantalla de retake (`retake-intro` en captura).
**Bug pendiente:** la notificación enviada al gondolero SÍ incluye el motivo en el
texto, pero la pantalla de Actividad donde se lee esa notificación no lo formatea
de manera destacada. Solución: revisar `app/(gondolero)/gondolero/actividad/` y
asegurarse de que el campo `body` de la notificación se muestre completo, no
truncado.

### Notificaciones: marcar como leídas individualmente
Hoy al entrar a la sección de notificaciones se marcan **todas** como leídas de
una. Si el gondolero tenía cinco nuevas y abrió una sola, pierde el rastro de
las otras cuatro: no tiene forma de saber cuáles no había visto.

Debería marcarse cada notificación al abrirla o tocarla, no al entrar a la
lista. Las no leídas en negrita y las leídas en normal, como cualquier bandeja
de entrada.

Aparte, evaluar un botón de "marcar todas como leídas" para el que quiera
limpiar de una — pero como acción explícita, no como efecto de entrar.

Registrado el 9/9/2026.

### Actualizar la PWA sin que el usuario abra la app — no tiene solución hoy

Pregunta planteada el 15/9/2026: ¿se puede precachear la versión nueva en
background, sin que el gondolero abra la app con señal?

**Respuesta corta: no de forma confiable, con la flota que tenemos.** Las tres
APIs que parecen servir, y por qué ninguna alcanza:

| API | Por qué no |
|---|---|
| **Periodic Background Sync** | Solo Chromium — **no existe en iOS/Safari**. Exige que la PWA esté *instalada* en el home screen, permiso `periodicsync`, y la frecuencia la decide el browser según el "site engagement score": el intervalo que uno pide es una sugerencia. Puede no dispararse en días |
| **Background Sync (one-shot)** | Es un mecanismo de **reintento**, no un planificador. Dispara al recuperar conexión, pero solo para un `sync` registrado mientras había una pestaña abierta. No cubre "el dispositivo nunca abrió la app después del deploy" |
| **Web Push** | Es el único realmente iniciado desde el servidor: un push despierta al SW y el SW podría cachear. Pero necesita servidor de push, suscripciones y VAPID; en iOS requiere 16.4+ **y** la PWA instalada. Push ya está en V2 (ver la nota de abajo) |

O sea que la única vía técnicamente correcta es Web Push, que es un proyecto en
sí mismo y arrastra el requisito de PWA instalada justamente en la plataforma
donde menos control tenemos.

**Lo que sí se puede hacer, en orden de costo:**

1. **Arreglar el bump de `CACHE_NAME`** (ver la nota del Service Worker más
   arriba). Hoy el problema no es que falte una vía automática: es que **la vía
   manual tampoco corre**, porque el SW nunca se reinstala. Esto es lo primero y
   es barato.
2. **Mostrarle al gondolero cuándo se sincronizó por última vez**, antes de que
   salga a la calle. No actualiza nada solo, pero convierte una falla silenciosa
   en una decisión informada: "abrí la app con señal hoy" vs. "estoy saliendo con
   la versión del martes".

Lo segundo no está diseñado. No empezar sin definir dónde va y qué dice: un
cartel permanente de estado de sincronización es ruido que se aprende a ignorar,
que es exactamente el modo de falla que ya documentamos con el aviso de fotos
rechazadas.

### Notificaciones push — pendiente V2
La app es una PWA. Supabase Realtime + badge en navbar es el canal actual para
avisar al gondolero. Las push notifications nativas del browser (Service Worker +
Web Push API) están en V2. Ver sección "EXCLUIDO DEL MVP" en §8.
Antes de implementar: evaluar soporte en iOS Safari (requiere iOS 16.4+ y que
el usuario haya instalado la PWA en el home screen).

### comercios_checks: el check pisa el distri_id histórico

`registrarChecksGPSInterno` hace `upsert` con `onConflict: 'comercio_id,gondolero_id'`
y **sin** `ignoreDuplicates`, que en supabase-js por defecto es `false`. O sea
que resuelve como `merge-duplicates` → `ON CONFLICT DO UPDATE`: el `distri_id`
**sí se actualiza** en cada visita posterior (verificado en
`node_modules/@supabase/postgrest-js`, `upsert(values, { ignoreDuplicates = false })`
→ `Prefer: resolution=merge-duplicates`).

El problema real es el opuesto al que parece: como el check se reescribe, deja
de ser una foto del momento. Si un gondolero cambia de distribuidora, su check
viejo pasa a figurar con la distri nueva. La validación automática cuenta
`distri_id` distintos, así que eso puede **bajar** el conteo y bloquear una
validación que antes se habría disparado (dos checks que eran de distris
distintas quedan los dos con la misma).

Aparte: un check de un gondolero con `distri_id` null no suma nunca, porque el
conteo filtra los nulos.

Ninguna de las dos cosas es del descarte de recaptura — son de la validación
por doble GPS. No tocar sin decidir antes si el check tiene que ser un registro
histórico (y entonces no pisarse) o el estado actual. Registrado el 9/9/2026.

### Descarte de recaptura — la regla

Implementado el 9/9/2026. El gondolero puede descartar la recaptura pendiente
de una misión cuando ya no puede volver al comercio. Es una decisión de
producto, no se deduce del código:

- La misión queda `estado='descartada'` y `bounty_estado='anulado'`.
- **No** acredita puntos, y **no** cuenta ni para el mínimo para cobrar ni
  para el máximo de misiones por gondolero: le queda el cupo libre.
- `comercios_relevados` de la campaña baja en uno.
- El comercio queda disponible para hacerlo de nuevo. Nunca estuvo bloqueado:
  no hay UNIQUE en `misiones(campana_id, comercio_id, gondolero_id)`.
- **No se borra nada.** Las fotos aprobadas y las respuestas siguen visibles
  para la marca, y el check GPS de `comercios_checks` se conserva: es
  evidencia de que el gondolero estuvo físicamente ahí, y eso pasó igual.

Por qué existe: el gondolero se entera del rechazo horas o días después, ya
lejos del comercio. Sin salida, la foto rechazada queda para siempre y el aviso
se vuelve ruido — y el que aprende a ignorar ese aviso ignora el próximo.

Guarda a no romper: `actualizarEstadoMision` sale temprano si la misión está
descartada. Sin eso, aprobar una foto que había quedado pendiente le pisa el
estado con 'aprobada' y le paga los puntos que resignó.

### Aprobación parcial de fotos — CORREGIDO el 26/9/2026

> **⚠️ La nota vieja de este lugar estaba mal, y conviene saber por qué antes de
> volver a abrirlo.** Decía que la aprobación parcial *"no tiene estado
> terminal"* y que *"los puntos se pagan todos y tarde por arrastre"*. Lo
> segundo fue cierto y **se arregló el 16/9/2026** —un día después de
> escribirla— cuando `aprobarMisionCore` sumó `.eq('estado','aprobada')` a la
> barrida. Lo primero nunca fue cierto: el estado parcial **es transitorio a
> propósito** y tiene dos salidas terminales.
>
> Se deja el rastro porque una nota que dice "hay un agujero" sobrevive a su
> agujero, y alguien la reabre.

Campaña con dos campos foto, una aprobada y una rechazada. Lo que pasa,
releído entero el 26/9/2026:

1. El revisor rechaza la foto B, sale la notificación con el motivo y el texto
   *"podés retomar la misión y rehacer esa foto"*.
2. En el mismo acto se llama a `actualizarEstadoMision`, que lee las fotos
   **vigentes** (`reemplazada_por IS NULL`): `aprobadas(1) !== total(2)`, así
   que no entra en ninguna rama y sale.
3. La misión queda `pendiente` + `retenido`.
4. La foto A queda con su `bounty_estado='retenido'`, **pero una foto con
   `mision_id` nunca se paga sola**: `fotoEsUnidadDePago` devuelve `false`, y
   `cerrarCampana` aplica el mismo filtro.

**Nadie cobra y nadie pierde nada.** No es un limbo: es "tenés una foto para
rehacer", con dos salidas terminales que existen y se usan —`registrarRecaptura`
(5 usos en dev, 1 en prod) y `descartarRecaptura`—.

**El `else` que falta es deliberado**, y está argumentado en `lib/misiones.ts`:
el rechazo llama a esta misma función en el mismo acto, así que un `else`
mataría la misión **antes** de que el gondolero pueda recapturar, justo cuando
acaba de recibir la notificación que le dice que puede.

Medido el 26/9/2026:

```
misiones mixtas (≥1 aprobada y ≥1 rechazada)   dev 1 (ya descartada)   prod 0
esperando recaptura, campaña vigente           dev 1 · 50 pts          prod 0
esperando recaptura, campaña VENCIDA           dev 0                   prod 0
```

#### Lo que sí quedó abierto, que es otra cosa

Tres cosas, ninguna es la aprobación parcial en sí:

1. **`rechazarComercio` no toca una misión ya aprobada** — hay 200 puntos de
   producción parados ahí. Ver la sección propia más abajo.
2. **El vencimiento con recaptura pendiente**: la salida existe en el servidor y
   es inalcanzable por la UI.
3. **Los puntos retenidos de una misión pendiente no se muestran** en el detalle
   de campaña.

### Los 200 puntos de producción: `rechazarComercio` y la misión ya aprobada

Encontrado el 26/9/2026 midiendo, no leyendo. En **producción**:

```
misión   estado 'aprobada'    bounty 'acreditado'   200 pts
foto     estado 'rechazada'   bounty 'anulado'      "Mal ubicado en el mapa"
```

La secuencia, por los timestamps: el comercio se validó, la misión se aprobó y
**los 200 puntos se pagaron el 17/9 a las 11:17** (movimiento `Foto aprobada ·
Alta comercios zona norte`). A las **15:58 del mismo día** alguien rechazó el
comercio: la foto pasó a `rechazada` + `anulado`, y la misión no se tocó.

La causa es una línea sin comentario en `lib/validacion-comercio.ts`:

```ts
.update({ estado: 'descartada', bounty_estado: 'anulado' })
.neq('estado', 'aprobada')     // ← una misión ya aprobada NO se descarta
```

Se lee como "no toques lo ya liquidado", que es defendible —los puntos ya están
en el saldo y pueden estar canjeados—, pero **es una decisión de producto que
nadie escribió**, y mientras tanto la base se contradice: misión aprobada y
pagada con su única foto rechazada.

**Decidir antes de tocar.** Revertir un pago que ya está en el saldo no es un
arreglo de código.

#### DECIDIDO el 26/9/2026 — la misión se cierra y la plata no se toca

**El argumento: el gondolero no hizo nada mal.** Le pagamos y después
rechazamos el comercio. La base deja de mentir; la contabilidad no se toca.

##### La medición: quién lee `descartada + acreditado`

Se midió antes de escribir, porque la pregunta era si convenía un estado propio
(`anulada_pagada`) o la combinación. **Ganó la combinación, y no por poco.**

`descartada` es el centinela establecido del proyecto para "esta misión no
cuenta para nada", y **todos los lectores están escritos como "todo menos
descartada"**. Ninguno interpreta mal la combinación: los tres caminos de pago
exigen `estado='aprobada'` —`aprobarMisionCore` para contar el mínimo y para la
barrida, `cerrar-vinculacion` y `misiones-trabadas` para sus barridas— y
`descartada + acreditado` no entra en ninguno.

Un estado nuevo, en cambio, **fallaría ABIERTO en quince lugares y en silencio**:

| Lector | Con `descartada` | Con un estado nuevo |
|---|---|---|
| `panel_series` / `panel_visitas` / `panel_pdv` (6 filtros SQL) | excluida | **el comercio rechazado cuenta como cobertura** |
| índice `misiones_campana_comercio_uniq` | libera el comercio | **lo bloquea para siempre** |
| guarda de `actualizarEstadoMision` | no reabre | **reabre y vuelve a pagar** |
| `puntos-retenidos.ts` | excluida | cuenta el comercio "en revisión" |
| `comercios-relevados.ts` ×2, `cobertura-seguimiento`, `linea-comercio` | no ocupan cupo | ocupan cupo |
| `captura/page.tsx:991` | no pide fotos | **vuelve a pedir fotos** |
| `ESTADO_MISION` | "Descartada" | muestra el string crudo |

Más una migración para el CHECK y otra que recree las tres funciones del panel.
**Quince lectores que hay que acordarse de tocar contra cero**, y el modo de
falla del olvido es incluir, no excluir.

> **Lo que se pierde, y cómo se compensa.** Un estado propio dice lo que pasó;
> una combinación inédita hay que ir a deducirla. Se compensa donde se puede
> mirar: un `COMMENT ON COLUMN misiones.bounty_estado` que la nombre, el
> comentario en el único lugar que la escribe, y esta sección.

##### La puerta que el cambio ABRE, y que hay que cerrar en el mismo commit

Encontrada midiendo, no leyendo, y es plata otra vez:

`validarComercioYCrearMision` decide si ya pagó con
`find(m => m.estado !== 'descartada')` — o sea **"hay misión viva"**. Hoy la
misión rechazada sigue en `aprobada`, así que revalidar el comercio cae en el
`if (viva.estado === 'aprobada') return` y no vuelve a pagar.

**Al pasarla a `descartada`, deja de haber misión viva**: una revalidación
—camino contemplado, el código hasta limpia el `motivo_rechazo` de un rechazo
anterior— crearía una misión nueva y pagaría **de nuevo**. 400 puntos por un
comercio.

El arreglo es cambiar el criterio de la guarda por el que corresponde:
**"este comercio ya se pagó"** (`bounty_estado = 'acreditado'` en cualquier
misión suya) en vez de "hay una misión viva".

##### GUARDAR POR EL INVARIANTE, NO POR SU CONSECUENCIA

Vale más que este caso, y es la misma forma que **"la lista ES el permiso"** de
`lib/campanas-de.ts` y que el filtro del lector de `aprobarMisionCore`.

> **Lo que no puede pasar** es pagar dos veces el mismo comercio. Eso es el
> invariante. **"Hay una misión viva"** era una forma de saberlo: cierta
> mientras nadie cerrara una misión ya pagada.

Una guarda escrita sobre la consecuencia se rompe cuando la consecuencia deja
de seguirse del invariante — **y se rompe en silencio, porque nada falla: se
paga de nuevo y la función devuelve `ok`**. Acá el que la rompió fue un cambio
en OTRO archivo, al cerrar la misión del comercio rechazado. Esa es la firma
del patrón: la guarda vive en un lado y su premisa en otro.

La versión por invariante no depende del estado de la fila, así que ningún
estado que se agregue mañana la puede burlar.

Es la misma familia que "el cableado es lo que falla, no la función": las dos
piezas estaban bien y el acuerdo entre ellas no.

##### HECHO el 26/9/2026

Las cuatro piezas, en un commit:

| | Qué |
|---|---|
| `validacion-comercio.ts` · guarda | el criterio pasa a ser "ya se pagó". La búsqueda de misión viva queda, pero ya **no decide el pago**: decide si se reutiliza la fila o se crea otra |
| `validacion-comercio.ts` · `rechazarComercioConMotivo` | **dos updates y no uno**. No acreditada → `descartada` + `anulado`. Ya acreditada → `descartada` y el bounty **no se toca**: ponerle `anulado` sería decir que no se pagó |
| `20261007100000` | cierra la fila de prod. Su verificación central es que **no se movió un peso**: compara `movimientos_puntos` y los saldos antes y después |
| `COMMENT ON COLUMN misiones.bounty_estado` | la combinación explicada donde se la encuentra, sin tener que dar con el commit |

Dos controles, y los dos se verificó que muerden:

- `probar-migracion-comercio-rechazado.mjs` — verde en dev y prod. En dev no
  hay ni un comercio rechazado, así que el caso 6 arma el escenario entero
  para tener qué arreglar.
- `probar-pago-unico-alta.mts` — el camino completo contra dev: validar,
  rechazar, **revalidar**. **Con la guarda vieja repuesta a propósito da 400
  puntos, dos misiones y dos movimientos.** Es el segundo pago reproducido.
  Y el caso 4 es el control del control: un comercio nuevo SÍ se paga, porque
  "no paga dos veces" lo cumple igual de bien una guarda que no paga nunca.

### Formato de `mision_respuestas.valor` — normalizado el 14/9/2026

`valor` es `jsonb` y **cada tipo de campo tiene un tipo JSON que le corresponde**:

| Tipo de campo | Formato correcto | Ejemplo |
|---|---|---|
| `binaria` | boolean | `true` |
| `numero` | number | `2500` |
| `seleccion_multiple` | array | `["Arcor","Georgalos"]` |
| `seleccion_unica` | string | `"Arcor"` |
| `texto` | string | `"La góndola estaba..."` |

Hasta el 14/9/2026 convivían dos formatos para los tres primeros. **La causa era
el seed, no la app**: `seed-demo-completo.ts` escribía `'si'`/`'no'`, `String(n)`
y `JSON.stringify(array)`. Ese último era doble serialización — `stringify`
devuelve un string de JS que el driver vuelve a serializar, y en `jsonb` queda un
string que *contiene* un array. El panel lo descartaba entero
(`Array.isArray()` daba `false`), así que el 76% de las respuestas múltiples no
se veía. Y `'si'` sin tilde caía en el `else` de la binaria y se contaba como
"No".

La app siempre escribió bien (`captura/page.tsx`: boolean, array, `Number()`).
Hay exactamente **dos escritores** de la tabla: `captura/actions.ts` y el seed.

Corregido en las dos puntas: el seed escribe tipos nativos, y lo histórico se
normalizó con `UPDATE` (dev el 14/9). El normalizador de lectura que pueda haber
en el panel es **red de seguridad, no el arreglo**.

> Al escribir un seed o un fixture: el tipo lo pone el valor de JS, no una
> conversión a mano. `String(n)` y `JSON.stringify(arr)` sobre una columna
> `jsonb` son siempre un error.

### `foto_respuestas` está condenada — ya sin lectores

Tabla legacy: nadie la escribe y, **desde el 14/9/2026, nadie la lee**. Solo
falta el `DROP TABLE`, que se hace cuando el cambio esté verificado en
producción.

Se leía en **cuatro** lugares, no en uno —una corrección a lo que decía esta
misma nota—, y los cuatro tenían el mismo bug: cargaban `foto_respuestas`,
después `mision_respuestas`, y apilaban las dos listas en el mismo mapa **sin
deduplicar**. Cada respuesta se mostraba repetida:

- `lib/resultados.ts` — popup del lightbox
- `app/(admin)/admin/fotos/page.tsx`
- `app/(distribuidora)/distribuidora/gondolas/page.tsx`
- `app/(marca)/marca/gondolas/page.tsx`

**Por qué se sacó la fuente en vez de deduplicar con un `Set`:** con las dos
lecturas vivas, el día que los valores difieran —porque alguien corrige uno
solo— el `Set` elegiría en silencio el que llegó primero. Se verificó antes de
sacarla que las 47 filas de `foto_respuestas` tienen equivalente en
`mision_respuestas` **con el valor idéntico**, en dev y en producción: 0 filas
sin equivalente, 0 valores distintos.

### El backfill de la Etapa A duplicó filas en dev por no tener guarda

Detectado el 14/9/2026 al diagnosticar el lightbox, que en dev mostraba la misma
respuesta **tres** veces: dos por la doble lectura, y una tercera porque
`mision_respuestas` tenía **48 pares `(foto_id, campo_id)` con dos filas
propias**.

Las dos filas de cada par son idénticas salvo el `created_at`: una del 7/9 (el
seed) y otra del 9/9 (el backfill de la Etapa A, que copió `foto_respuestas` a
`mision_respuestas`). El backfill **reinsertó sin verificar si la fila ya
existía**.

> Es el mismo error que la idempotencia de las misiones evita en el flujo
> normal. **Un backfill que reinserta sin guarda de existencia es un backfill
> roto**: se corre una vez y parece bien, se corre dos y duplica. Todo script
> de migración de datos tiene que ser `ON CONFLICT DO NOTHING`, o un `INSERT ...
> SELECT ... WHERE NOT EXISTS`, o chequear antes. No alcanza con "lo corro una
> sola vez": la próxima persona no sabe que ya corrió.

Producción no quedó afectada porque allá el backfill fue la única fuente.
Limpiado en dev con un `DELETE` que conserva la fila más vieja de cada par.

### Pendiente — conectar los schemas de Zod que nadie llama

Detectado el 16/9/2026 rastreando por qué había campañas sin `fecha_fin` aunque
`schemaCampanaPaso2` la declara obligatoria.

**`zodResolver` aparece dos veces en todo el repo, las dos en
`app/auth/page.tsx`.** Ese es además el único archivo que importa de
`lib/validations`. Las server actions leen `formData` crudo y castean con `as`,
que no valida nada en runtime.

O sea que el patrón que la sección 7 de este mismo documento declara estándar
del proyecto —React Hook Form + Zod con `zodResolver`— corre en **una** pantalla.

**Siete de los nueve schemas están muertos.** Lo que cada uno deja de validar:

| Schema | Qué no se valida hoy |
|---|---|
| `schemaComercio` | Nombre 2-100, **lat −90..90, lng −180..180**, tipo del enum |
| `schemaCampanaPaso1` | Nombre 3-100, instrucción 10-500, puntos 0-10.000 / 0-100.000, al menos una zona, al menos un bloque |
| `schemaCampanaPaso2` | Las tres fechas obligatorias, **fin > inicio**, **límite ≤ fin**, **mínimo ≤ máximo** |
| `schemaDeclaracion` | Enum de declaración, precio > 0 |
| `schemaCanje` | Premio del enum, puntos entero > 0 — **redundante, ver abajo** |
| `schemaPerfil` | Nombre 2-100, formato de celular |
| `schemaEmpresa` | Razón social 2-150, **formato de CUIT** |

`schemaLogin` y `schemaRegistro` sí corren.

**`schemaCanje` es el único que no hace falta conectar:** `solicitarCanje` no
recibe los puntos —salen de la constante `COSTO_CANJE` del servidor— y la tabla
`canjes` ya tiene `CHECK (premio IN (...))` y `CHECK (puntos > 0)` desde el
schema inicial. Está cubierto dos veces.

**Los dos que más pesan** son `schemaComercio` (valida lat/lng, y venimos de dos
días arreglando comercios mal ubicados que nadie podía alcanzar) y los dos
`refine` de fechas de `schemaCampanaPaso2`, que hoy permiten crear una campaña
con fin anterior al inicio.

**Por qué no se hizo junto con la fecha:** conectar un schema activa TODAS sus
reglas de golpe, y no se sabe qué formularios que hoy pasan dejarían de pasar
hasta probarlos uno por uno. Siete schemas por tres editores duplicados es
superficie que no se puede verificar en una sesión. La obligatoriedad de
`fecha_fin` se resolvió aparte, con validación explícita.

> **SE INTENTÓ CONECTAR `schemaCampanaPaso2` EL 16/9/2026 Y NO SE PUEDE.**
> El schema exige `fecha_limite_inscripcion` y `es_abierta`, y **ninguno de los
> tres editores manda esos campos**: ni los formularios los piden ni las actions
> los insertan (se quedan con el default de la base). `safeParse` fallaría el
> 100% de las creaciones, en los tres paneles.
>
> **El schema describe un formulario que ya no existe.** Se escribió en abril,
> nunca se llamó, y los editores siguieron evolucionando sin él. Eso es lo que
> hace que "conectar los schemas" no sea un trabajo de plomería: hay que decidir
> primero, para cada uno, si la regla sigue valiendo o si el schema quedó viejo.
>
> Presumir que los otros seis están al día sería el mismo error. Cada uno hay que
> contrastarlo contra el formulario que dice validar **antes** de enchufarlo.
>
> Lo que sí se rescató de `schemaCampanaPaso2` es la regla de que el fin sea
> posterior al inicio, que vive ahora en `lib/campana-fechas.ts` junto con la
> obligatoriedad de `fecha_fin`.

**Ojo con el orden cuando se agarre:** los formularios de campaña están
duplicados en tres rutas (ver "Deuda conocida"). Conectar los schemas sin
unificarlos antes es escribir la misma conexión tres veces.

### Pendiente — `solicitarCanje` escribe el saldo dos veces

`app/(gondolero)/gondolero/perfil/actions.ts` inserta el movimiento de débito
—que dispara el trigger `on_movimiento_puntos`, el cual ya descuenta— y
**además** hace un `UPDATE` manual sobre `profiles.puntos_disponibles`.

No es doble cobro: el update manual escribe un valor absoluto calculado sobre la
lectura previa, y coincide con lo que dejó el trigger. Pero es una **lectura
perdida** esperando ocurrir:

> Gondolero con 1000 puntos pide un canje de 300. Entre la lectura y el update
> manual, se le acredita una misión de 500. El trigger deja 1200. El update
> manual escribe 1000 − 300 = 700. **Los 500 acreditados desaparecen.**

La ventana es corta pero las aprobaciones se hacen en lote desde el panel, que es
exactamente cuando se acredita a varios gondoleros a la vez.

El arreglo es borrar el `UPDATE` manual: el trigger es el escritor único de
`puntos_disponibles`. Detectado el 16/9/2026.

### Pendiente — borrar `campanas.comercios_relevados`

**La columna no debería existir.** `lib/campana-avance.ts` la cita como EL
ejemplo de por qué no se guarda estado derivado: *"se guardó, se desincronizó, y
tuvo una alerta rota durante meses sin que nadie lo notara"*. Y
`lib/resultados.ts:107` dice *"No usar `campanas.comercios_relevados`: está
inflado por doble incremento"*. El propio código la señala dos veces.

Lo correcto es borrarla y que cada consumidor cuente
`COUNT(DISTINCT comercio_id)` sobre `misiones`. Mientras tanto,
`lib/comercios-relevados.ts` la mantiene honesta recalculándola en los tres
puntos de escritura.

**EL TAMAÑO REAL: 17 archivos la leen, no dos.** Esto está escrito acá porque el
15/9/2026 se estimó en "dos consumidores" y sobre ese número se tomó la decisión
de borrarla; al inventariar aparecieron 17 y hubo que dar marcha atrás. El
próximo que lo agarre tiene que empezar sabiendo el tamaño.

**Tres son lógica de negocio, no carteles:**

| Archivo | Qué decide |
|---|---|
| `gondolero/captura/actions.ts` | El auto-cierre por `tope_total_comercios` |
| `gondolero/campanas/[id]/actions.ts:136` | **Bloquea unirse** cuando se llenó el cupo |
| `distribuidora/alertas/page.tsx:205` | **Dispara la alerta** de campaña atrasada (`< minimo * 0.5`) |

> **Los dos últimos fallan en silencio.** Una barra de progreso en cero se ve; un
> gate que deja de bloquear inscripciones al llegar al tope, o una alerta que no
> salta, no se ven hasta que alguien los sufre. Si se borra la columna, esos dos
> son los que hay que verificar a mano en producción, no los gráficos.

**Los otros catorce son presentación:** el detalle de campaña del gondolero (la
usa nueve veces: progreso, cupos restantes, "sin cupos"), `campanas-sections`,
los dashboards de distribuidora y repositora, las listas de campañas de los
cuatro paneles, los detalles de relación de marca/distri/admin, y los cuatro
`resultados/page.tsx`.

**El orden, cuando se haga:** código que deja de usarla → deploy → verificar en
producción → `DROP COLUMN`. Igual que con `objetivo_comercios`. Con 17 archivos
de por medio, la ventana entre el deploy y el DROP importa más, no menos: es
donde se detecta la barra que quedó en cero.

Hace falta además un índice en `misiones (campana_id, comercio_id)`: el que
existe es `(gondolero_id, campana_id, estado)` y no sirve para agrupar por
campaña.

### El Service Worker no se actualiza solo: `CACHE_NAME` se bumpea a mano

Detectado el 15/9/2026, después de que un cambio deployado no apareciera en modo
avión.

**El mecanismo de actualización está bien construido y no es el problema.**
`public/sw.js` hace `skipWaiting()` en install y `clients.claim()` en activate;
`components/shared/sw-updater.tsx` llama `registration.update()` al montar,
escucha `controllerchange` y recarga sola —difiriendo el reload si el gondolero
está en captura, para no perderle la foto—. Cuando se dispara, funciona.

**El problema es que no se dispara.** El browser instala un SW nuevo solo si los
**bytes de `sw.js` cambiaron**, y `CACHE_NAME = 'gondolapp-v11'` está escrito a
mano en la línea 1. Un deploy que toca código de la app pero no `sw.js` deja el
archivo byte a byte idéntico: no hay install, no hay activate, no se purga el
cache viejo, no hay `controllerchange` y no hay reload.

Al 15/9/2026: `public/sw.js` no se toca desde el **11/9** (`b28c2ee`), y desde
ese commit entraron **39 commits a dev**. Ninguno de esos deploys reinstaló el
SW en ningún dispositivo que ya lo tuviera.

**Por qué igual parece funcionar con señal:** el fetch handler hace
stale-while-revalidate para navegaciones, y los chunks JS tienen nombre con hash
de contenido — un build nuevo produce URLs nuevas, que no están en cache, así
que se piden a la red y se cachean. O sea que **online el código nuevo llega
igual**, y por eso el bug es invisible en desarrollo.

**Dónde muerde:** el precache de install, que es lo único que prepara al
dispositivo para trabajar sin señal, **no corre desde el 11/9**. Y ahí está el
detalle más engañoso: `scripts/generate-sw-manifest.js` escribe
`public/sw-manifest.json` en **cada build** y lo imprime en el log
(`[generate-sw-manifest] OK — 17 chunks escritos`). El archivo se genera bien.
Pero **nadie lo lee**, porque el único que lo consume es el handler de install, y
install no vuelve a correr. Un no-op que se reporta como éxito en todos los
builds.

Consecuencia práctica para el gondolero: si sale a la ruta sin haber abierto la
app con señal **y navegado a las pantallas que va a usar** después del deploy,
trabaja con la versión anterior. Con una feature nueva es molesto; con un fix de
bug, sigue con el bug sin saberlo.

**La solución no es agregar un aviso de "hay versión nueva":** la maquinaria para
actualizar ya existe y es buena. Es **hacer que `sw.js` cambie en cada deploy**,
inyectando un id de build en `CACHE_NAME` desde `generate-sw-manifest.js`, que ya
corre en build time y ya escribe en `public/`. Con eso el resto de la cadena
—update → skipWaiting → claim → controllerchange → reload— se encadena sola.

**Lo que NO tiene solución hoy:** que el dispositivo se actualice sin que el
gondolero abra la app. Ver "Actualizar la PWA sin que el usuario abra la app" más
abajo.

### Toda distribuidora ve todos los comercios del sistema

Detectado el 15/9/2026 relevando la corrección de ubicación de comercios.

`app/(distribuidora)/distribuidora/comercios/page.tsx` arma la lista así:

```ts
.from('comercios')
.select('id, nombre, direccion, tipo, validado, registrado_por, created_at, foto_fachada_url')
.order('nombre', { ascending: true })
.limit(200)
```

**Sin un solo `.eq()`.** El `distriId` y los `gondoleroIds` se calculan más
arriba pero no filtran nada: se usan en un único lugar, para decidir
`puedeValidar` (solo se pueden validar los comercios registrados por gondoleros
propios). O sea que la distribuidora **ve todo el padrón y solo actúa sobre lo
suyo**.

Puede ser deliberado —el mapa compartido es el activo del negocio— pero no está
escrito en ningún lado, y choca con el "Walled Garden: cada actor ve solo sus
propios datos" de la sección 6. Una de las dos cosas está mal: o el principio o
la query.

Aparte, el `limit(200)` alfabético es el mismo tope silencioso que ya
documentamos en la búsqueda de comercios del gondolero: arriba de 200 comercios,
los de nombres con letras tardías desaparecen de la lista sin ningún aviso.

**Por qué importa más desde ahora:** con el bloqueo duro de 200m en producción,
mover el pin de un comercio es una acción que puede **impedir el trabajo de
gondoleros de otra distribuidora**. Antes de ese bloqueo, ver de más era un tema
de privacidad; escribir de más pasa a ser un tema de integridad. La decisión
tomada para la corrección de ubicación fue que cualquier distri pueda corregir
cualquier comercio, con rastro visible como control — pero esa decisión es sobre
la escritura, y **el scoping de la lectura sigue sin definirse**.

No tocar sin decidir antes cuál de los dos es la regla.

### distri_id null en gondoleros de dev
El seed no vincula automáticamente los gondoleros de dev a Biomega. Solución:
correr el bloque SQL al final de `supabase/seed.sql` después de crear los usuarios
en Supabase Auth. Ver comentario "VINCULAR GONDOLEROS DE DEV A BIOMEGA" en el seed.

### Agujero de onboarding: localidades nunca se configuran en el registro
El registro de gondolero no pide ni configura localidades en ningún momento, y
nadie empuja al gondolero a hacerlo. La tabla `gondolero_localidades` queda vacía
indefinidamente (todos los gondoleros de dev tienen cero filas, verificado 10/9/2026).
El filtro de campañas es fail-open cuando no hay localidades —el gondolero ve todo—
pero la segmentación por zona no funciona y la precarga de comercios cae al fallback
de `limit(1500)` sin filtro. Es un agujero de onboarding que hay que resolver: definir
cuándo y cómo se completa este paso (¿en el onboarding inicial? ¿al entrar a la
lista de campañas con un banner? ¿obligatorio antes de poder unirse a una campaña?).

### `codigo_gondolero` — un solo generador (resuelto 16/9/2026)

**El agujero de fondo:** `handle_new_user()` no asignaba código. Todo gondolero
que se registraba por `/auth` nacía sin código — 24 en dev y 24 en prod. La
migración retroactiva de abril no los alcanzó porque corrió antes de que
existieran; el `seed-demo-completo.ts` los creó después.

**Había cuatro generadores con reglas distintas**, ninguno con chequeo de
colisión pese a que la columna es UNIQUE (`profiles_codigo_gondolero_key`):

| Origen | Prefijo | Rango | Limpieza |
|---|---|---|---|
| `20260404120258` (SQL) | `alias` → `nombre` → `GOND` | 1000-9999 | ninguna |
| `20260404140924` (SQL) | igual | **0000-9998** | ninguna |
| `20260408174732` (SQL) | `FIXR` fijo | 1000-9999 | N/A |
| `admin/usuarios/actions.ts` (TS) | solo `nombre` | **0000-9998** | `[^a-zA-Z]` |

El `FIXR-` de la migración de fixers nunca se usó: los dos fixers de prod tenían
`FIXE-`, derivado de "Fixer 1"/"Fixer 2" por el generador de TypeScript.

**Cómo quedó.** La única implementación del formato es la función SQL
`generar_codigo_gondolero()` (migración `20260916180000`). La llaman dos lugares:
`handle_new_user()` al registrarse y `backfill_codigos_gondolero()` desde el
botón "Asignar códigos" de `/admin/usuarios`. **El TypeScript ya no genera
códigos**; `lib/codigo-gondolero.ts` solo *reconoce* el formato, para el
placeholder de los paneles de vinculación y para el contador de pendientes.

**Formato: `GND-NNNN-NNNN` con dígitos 2-9.** 8^8 = 16.777.216 combinaciones.
Sin letras en la parte variable y sin 0 ni 1 porque el código se dicta por
teléfono — hay un botón de WhatsApp en el perfil del gondolero. Sacar solo `I` y
`O` no alcanzaba: en castellano be/de/pe/te/ve/e riman entre sí, así que la
confusión auditoria sobrevive a cualquier alfabeto que incluya letras.

El prefijo es **fijo y no deriva del nombre**. Derivarlo filtraba el nombre real
de la persona a cualquiera que tuviera el código, y daba prefijos de ancho
variable (el TS borraba lo que no fuera `[a-zA-Z]` *antes* de cortar a 4, así que
"Ñuñez" daba `UEZ-`, de tres letras). Es el mismo prefijo para gondoleros y
fixers: comparten la columna, el UNIQUE es global, y las tres búsquedas por
código (`distribuidora/gondoleros`, `distribuidora/fixers`, `repositora/fixers`)
filtran por `tipo_actor`, no por prefijo.

**Tres decisiones de diseño que conviene no revertir sin leer esto:**

1. **Si el trigger agota los 10 reintentos, inserta con `codigo_gondolero` NULL y
   deja entrar al usuario.** Un código faltante lo repara el botón del panel; un
   registro abortado es una persona que no pudo entrar a la app y no vuelve.
   Queda registrado con `RAISE WARNING` en los logs de Postgres, y el botón de
   `/admin/usuarios` muestra el contador de pendientes.
2. **El reintento va dentro de un bloque `BEGIN/EXCEPTION`**, que en plpgsql abre
   una subtransacción: capturar `unique_violation` ahí no aborta el alta. Y se
   filtra por `CONSTRAINT_NAME`, porque `unique_violation` también se dispara si
   el `id` ya existe — reintentar eso sería un loop garantizado a fallar diez
   veces y a tragarse un error real.
3. **El backfill apunta a los que no tengan el formato nuevo**, no a "todos": así
   reescribe los 5 códigos viejos de prueba y al mismo tiempo es idempotente.

**Arruga de la whitelist.** `handle_new_user()` fuerza `tipo_actor='gondolero'`
para cualquier alta (es lo que impide registrarse como admin con la anon key), así
que también le genera código a marcas, distris y repositoras creadas desde el
panel admin. El `UPDATE` posterior de `crearUsuario` les pone
`codigo_gondolero: null` junto con el `tipo_actor` correcto. La alternativa
—decidir mirando el `tipo_actor` crudo de metadata— se descartó porque deja sin
código a quien se registre públicamente eligiendo "Marca" y termine convertido en
gondolero por la whitelist.

**De paso, un bug vecino que se arregló acá:** la versión 052 de
`handle_new_user()` (7/9/2026) había perdido `celular` del INSERT. El formulario
de registro lo sigue mandando en metadata y el perfil lo sigue leyendo, así que
todo celular cargado desde esa fecha se descartaba en silencio. Restaurado.

### Pendiente de producto — el registro público está abierto y sin aprobación

`middleware.ts` lista `/auth` como ruta pública y el botón **"Registrarme"** de
`app/auth/page.tsx` se renderiza sin ninguna condición, con `gondolero` como
primera opción. Cualquiera que abra la URL se da de alta como gondolero.

**Verificado en vivo el 16/9/2026: registro hecho en producción, con entrada a
la app sin que nadie aprobara nada.** No es una lectura del código, es una
cuenta real que existe.

Y no termina en el alta. El que se registra **entra, ve las campañas abiertas,
puede relevar y puede cobrar puntos** sin que ninguna distribuidora ni ningún
admin lo valide. La cadena completa —darse de alta, tomar misiones, acumular
puntos, canjearlos— corre sin un solo control humano. Eso lo vuelve un tema de
plata, no solo de higiene de cuentas.

Salió a la luz relevando `codigo_gondolero`: el agujero de "nace sin código" no
era latente a la espera de que se abriera el registro, estaba drenando. Eso ya
está cerrado, pero **queda la decisión de producto**, y no es un bug: es una
decisión. Lo que hay que definir:

- ¿Un gondolero puede darse de alta solo, o solo por invitación de una
  distribuidora? El segundo es el flujo que sugieren `vinculacion_tokens` y los
  tres paneles de invitación, que ya existen y funcionan.
- Si el alta abierta se conserva, ¿qué puede hacer una cuenta no aprobada?
  Podría entrar pero no ver campañas, o ver pero no relevar, o relevar pero no
  cobrar hasta estar vinculada a una distribuidora.
- ¿Qué pasa con las cuentas que ya se registraron así?

**Nota operativa:** la cuenta de prueba creada el 16/9 en producción está en la
base. Cuenta para el backfill de `codigo_gondolero` — si el conteo de perfiles
sin código en prod da uno más de lo esperado, es esa.

### Pendiente — SMTP propio (mail de confirmación: marca, plantilla y límite)

Empezó como un problema de marca y resultó ser uno de disponibilidad. **Las tres
cosas se resuelven con la misma decisión: poner un SMTP propio.**

**1. La plantilla es la de fábrica.** El mail que recibe un gondolero al
registrarse tiene remitente y asunto genéricos, y el cuerpo dice **"an
application powered by Supabase"**. GondolApp no aparece por ningún lado. Es el
**primer contacto** de la persona con el producto, antes de que haya visto una
sola pantalla de la app.

**2. El remitente no es nuestro.** Sale del dominio de Supabase, no de GondolApp.

**3. El servicio de mail de Supabase tiene un límite fijo que no se puede subir
sin SMTP propio.** Verificado el 16/9/2026: en dev se llegó al **429 después de
unos pocos registros seguidos**.

**El riesgo concreto para producción:** si una distribuidora consigue veinte
altas de gondoleros el mismo día, los últimos **no reciben el mail de
confirmación y no pueden entrar**. No hay reintento, no hay cola, y desde la app
el síntoma es indistinguible de "el mail no llegó".

Precisión sobre qué camino es el que está en riesgo, porque no son todos:

| Camino de alta | ¿Manda mail? | ¿Pega contra el límite? |
|---|---|---|
| Registro público por `/auth` (`signUp`) | **Sí** | **Sí** |
| Panel admin (`auth.admin.createUser` con `email_confirm: true`) | No | No |

O sea que el alta desde el panel admin es inmune —la cuenta nace confirmada—
pero ese **no** es el flujo de una distribuidora: la distri reparte link de
invitación o código, y cada gondolero se da de alta solo por `/auth`. Veinte
gondoleros entrando por la invitación de una misma distri son veinte `signUp`
seguidos, que es exactamente el caso que revienta.

**Relevamiento pendiente para cuando se agarre:**
- Qué opciones hay (Resend, SendGrid, SES) y cuánto cuesta cada una
- Qué hay que tocar en Supabase (Auth → SMTP Settings, Auth → Email Templates)
- Qué hay que tocar en el código, si algo
- Verificación de dominio / SPF / DKIM para no caer en spam
- **En los dos proyectos**, dev y prod

Relacionado con el pendiente de arriba: si el registro pasa a ser por
invitación, el mail que hay que escribir es otro. Conviene definir qué flujo
queda antes de redactar el texto definitivo — pero **el SMTP no espera a esa
decisión**, porque el límite pega igual con cualquier flujo que mande mails.

### Pendiente — nueve copias del mapa de tipos de comercio

`comercios.tipo` tiene seis valores fijados por `comercios_tipo_check`
(`almacen`, `kiosco`, `autoservicio`, `dietetica`, `mayorista`, `otro`), y el
mapa `tipo → etiqueta` está escrito a mano **nueve veces**:

| Archivo | Etiquetas | Colores |
|---|---|---|
| `app/(admin)/admin/comercios/page.tsx` | sí | sí |
| `app/(admin)/admin/comercios/pendientes/page.tsx` | sí | sí |
| `app/(admin)/admin/tablero/page.tsx` | sí | — |
| `app/(distribuidora)/distribuidora/comercios/page.tsx` | sí | sí |
| `app/(distribuidora)/distribuidora/comercios/pendientes/page.tsx` | sí | sí |
| `app/(distribuidora)/distribuidora/comercios/[id]/page.tsx` | sí | sí |
| `app/(distribuidora)/distribuidora/dashboard/page.tsx` | sí | — |
| `app/(gondolero)/gondolero/captura/page.tsx` | sí (+ emoji) | — |
| `app/(gondolero)/gondolero/comercios/nuevo/page.tsx` | sí (+ emoji) | — |

**Dos ya divergieron**, que es el síntoma de siempre:

- `app/(marca)/marca/dashboard/page.tsx:237` — su `TIPO_LABELS` tiene cuatro
  valores: le faltan `dietetica` y `otro`. Un comercio de esos tipos cae al
  fallback y se muestra crudo o vacío.
- `lib/validations/index.ts:67` — el enum de Zod tenía cinco: **le faltaba
  `dietetica`**. Corregido el 16/9/2026. Era un bug esperando: el schema no se
  llama desde ningún lado todavía (ver "conectar los schemas de Zod que nadie
  llama"), así que el día que se conectara habría empezado a rechazar dietéticas
  que la base sí acepta.

`lib/tipos-comercio.ts` existe desde el 16/9/2026 con las etiquetas en singular
y plural — el plural porque la distribución de la cabecera de resultados se lee
como frase ("42 kioscos, 18 almacenes"), y "42 Kiosco" no es una frase. Lo usa
**solo** `components/campanas/ResultadosView.tsx`. Migrar las nueve pantallas es
un tramo aparte; lo que el archivo evitó fue que fueran diez.

Al migrarlas hay que decidir qué pasa con los colores (seis de las nueve tienen
su propio mapa de clases de Tailwind, y hay que chequear si coinciden entre sí)
y con los emojis de las dos pantallas de gondolero.

### El default `'almacen'` de `comercios.tipo` (pendiente de decisión)

La columna es `text NULL DEFAULT 'almacen'`. Un insert que no mande `tipo` queda
como almacén sin que nadie lo haya clasificado, y **un default se ve igual que
una observación**. Desde que la cabecera de resultados muestra la distribución
por tipo, eso deja de ser cosmético: infla una categoría real con comercios que
nadie miró.

Las tres fuentes de valor silencioso, relevadas el 16/9/2026:

1. El `DEFAULT 'almacen'` de la columna.
2. `scripts/seed-demo-completo.ts:118` — el mapeo del CSV termina en `?? 'otro'`,
   así que todo tipo no contemplado cae ahí. Y el map traduce
   `'supermercado' → 'autoservicio'` pero **no incluye `'autoservicio'`**, con lo
   cual una fila del CSV que diga literalmente "autoservicio" termina en "otro".
3. `app/(gondolero)/gondolero/comercios/nuevo/page.tsx:33` — el selector arranca
   preseleccionado en `'autoservicio'`. La action exige el campo, pero ya viene
   lleno: alcanza con no tocarlo.

La distribución de la cabecera muestra los `null` como "sin clasificar" y no los
filtra, justamente para que se vean. Pero eso solo sirve si los no clasificados
**son** null, y hoy el default los disfraza de almacén.

### La interfaz `Comercio` de `types/index.ts` no la usa nadie

Verificado el 16/9/2026 con `grep` sobre todos los imports: **ninguna pantalla
importa `Comercio`**. Lo que sí se importa es `TipoComercio`, la unión de los
seis valores, en nueve archivos.

Se descubrió al hacer nullable `Comercio.tipo` para acompañar el `DROP DEFAULT`
de la columna: el cambio era correcto y `tsc --noEmit` pasó sin un solo error,
que es exactamente el síntoma de que nadie lo lee. Las pantallas declaran su
propia forma de fila (`ComercioRow`, o un objeto inline dentro del `.map`), y
esas son las que importan de verdad.

Al 16/9/2026, después del ajuste, todas declaran `tipo` como nullable. La única
que decía `TipoComercio` a secas era
`app/(distribuidora)/distribuidora/comercios/page.tsx:16`; su badge hacía
`TIPO_LABEL[c.tipo] ?? c.tipo`, que con `null` habría renderizado un badge en
blanco —sin romper nada y sin que nadie lo notara—. Ahora usa `etiquetaTipo()`.

**Antes de confiar en `types/index.ts` para algo, chequear si la interfaz tiene
lectores.** Varias de esas interfaces pueden estar en la misma situación: se
escribieron al principio del proyecto y las pantallas siguieron por su cuenta.

### `docs/schema-real-2026-09-pre-incidente.md` NO es la base viva

El nombre lo dice y aun así se usó como fuente de verdad el 16/9/2026, con
consecuencia: se escribió un embed `localidades(provincia:provincias(nombre))`
apuntando a `localidades.provincia_id`, una columna que **el dump tiene —con FK
e índice `idx_localidades_provincia`— y la base viva no**. El embed apuntaba a
una columna inexistente y la provincia no se resolvía.

El dump se tomó **antes** del `DROP SCHEMA public CASCADE` y de la
reconstrucción. Lo que se restauró no quedó idéntico, y esa diferencia no está
anotada en ningún lado más que acá.

**Regla:** el dump sirve para orientarse —qué tablas existen, cómo se llaman las
cosas— pero **cualquier columna de la que dependa código se verifica contra la
base** antes de escribir:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'la_tabla'
ORDER BY ordinal_position;
```

Diferencias confirmadas hasta hoy:

| Dice el dump | Dice la base viva |
|---|---|
| `localidades.provincia_id` existe | **No existe** |
| `bloques_foto.tipo_contenido` acepta `'ninguno'` | **Solo acepta `propios`, `competencia` y `ambos`** |

La segunda costó un bug de meses: la reconstrucción desde las migraciones
angostó el CHECK sin que nadie lo notara, el código se siguió escribiendo contra
la base de antes —`BLOQUE_ALTAS` forzaba `'ninguno'`—, los INSERT rebotaban, y
como nadie chequeaba el error la campaña de altas se creaba **sin bloque**.
Detectada el 21/9/2026 al sacar la columna.

La jerarquía geográfica real es de cuatro niveles:

```
comercios.localidad_id → localidades.departamento_id
                       → departamentos.provincia_id → provincias.nombre
```

`localidades` tiene `(id, nombre, departamento_id)` y `departamentos` tiene
`(id, nombre, provincia_id)`. Cero localidades sin departamento al 16/9/2026,
así que la cadena está completa y llegar a la provincia no pierde filas por ese
salto.

`lib/resultados.ts` la resuelve en **dos consultas** y no en un embed de cuatro
niveles: corta en `localidades`, así cada consulta anida como mucho dos, que es
la profundidad que el helper `uno()` maneja en el resto del archivo. Los embeds
anidados de PostgREST devuelven objeto o array según el caso, y a cuatro niveles
eso deja de ser manejable.

## Zona horaria — el servidor corre en UTC y Argentina es GMT-3

**Tema transversal, no de un módulo.** Todo lo que compare fechas o calcule días
corre **tres horas adelantado** respecto de la hora local argentina. Entre las
21:00 y la medianoche hora de acá, el servidor ya está en el día siguiente.

No está resuelto en ningún lado. Se anota el 16/9/2026 porque **el día que una
campaña cierre un día antes de lo que dice, sin esto escrito es muy difícil de
diagnosticar**: no falla, no tira error, simplemente contesta distinto según la
hora a la que se mire.

### Dos lugares donde ya puede estar pasando

**1. El gate de campañas vencidas.** `lib/campana-vigencia.ts` compara con
`diaDe()`, que arma la fecha con `getFullYear/getMonth/getDate` — o sea la hora
local **del proceso**, que en el server es UTC:

```ts
function diaDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
```

Una campaña con `fecha_fin = 30` deja de aceptar misiones **a las 21:00 del 29**
hora argentina. El gondolero que releva a las 22:00 del 29 ve su misión
rechazada por vencimiento un día antes de lo que dice la campaña — y eso es
plata que no cobra por trabajo hecho en plazo.

**2. La semana lunes a domingo de las campañas de seguimiento**, cuando se haga.
Con este criterio el lunes empezaría a las 21:00 del domingo, y las visitas de
esas tres horas contarían para la semana equivocada.

**3. `diasRestantes()` de `lib/utils.ts`** hace `new Date(fechaFin)` contra
`new Date()`. `new Date('2026-09-30')` se parsea como medianoche **UTC**, así
que el cálculo arrastra el mismo corrimiento. Lo usa la cabecera de resultados
para el "quedan N días" y para pintarlo en rojo bajo los 3 días.

### Qué relevar cuando se agarre

- Todos los usos de `CURRENT_DATE`, `now()` y `CURRENT_TIMESTAMP` en las
  migraciones (27 archivos los mencionan) y cuáles de esos alimentan **una
  decisión de negocio** y no solo un `created_at`.
- Todos los `new Date()` del lado servidor que terminen en una comparación de
  fechas: `lib/campana-vigencia.ts`, `lib/utils.ts:diasRestantes`, y lo que
  aparezca.
- Los `DEFAULT now()` de las columnas están bien como están: un `timestamptz`
  guarda el instante, no el día, y no tiene ambigüedad. El problema aparece
  cuando ese instante se **convierte a un día** para compararlo con un `date`.

### Las tres salidas, a decidir

1. **Constante `America/Argentina/Buenos_Aires`** en un solo lugar y derivar el
   "día de hoy" siempre a través de ella. Es lo más simple y cubre el 100% del
   negocio actual, que es un solo país.
2. **Zona por campaña**, si alguna vez hay operación fuera de Argentina. Más
   correcto y más caro; hoy no hay caso que lo justifique.
3. **Normalizar en el cliente**, mandando el día local del gondolero. Se
   descarta de entrada para el gate de vencimiento: el cliente ya manda
   `capturadoAt` y ahí el incentivo para falsearlo es directo — plata. Un dato
   con el que se decide si se paga no puede venir del que cobra.

La 1 es la recomendación, con la salvedad de que cambiarlo **mueve la frontera
de un día**: hay que mirar antes si hay campañas cuyo cierre caiga justo en esa
ventana.

### Una foto rechazada NO cierra la misión — y por qué el `else` que "falta" no va

`lib/misiones.ts` tuvo durante unas horas del 16/9/2026 un `else` que cerraba la
misión en `rechazada` cuando no quedaban fotos pendientes y alguna estaba
rechazada. **Se revirtió el mismo día porque rompía la recaptura**, y queda
escrito para que no se vuelva a agregar.

El encabezado del archivo describía un "Caso C — misión con alguna foto
rechazada y ninguna pendiente: se rechaza", y el código no lo hacía. Parecía un
`else` faltante. **Estaba mal el encabezado, no el código.**

`rechazarFoto` (`app/(admin)/admin/fotos/actions.ts`) marca la foto y llama a
`actualizarEstadoMision` **en el mismo acto**. En ese instante no hay ninguna
foto pendiente y hay una rechazada, así que el `else` se dispara siempre, al
toque, y mata la misión — justo después de mandarle al gondolero la
notificación que dice *"Podés retomar la misión y rehacer esa foto"*.

Peor: `registrarRecaptura` no mira `misiones.estado` (solo exige que la foto
esté `rechazada` y sin reemplazar) y el flujo de retake de
`captura/page.tsx` solo bloquea `descartada`. Así que el gondolero **podía**
rehacer la foto, y al aprobarse la misión pasaba a `aprobada` con
`bounty_estado='anulado'` — fuera del filtro de liberación. Rehacía el trabajo y
no cobraba nunca.

La regla verdadera está en la migración
`20260915140000_misiones_unico_por_comercio.sql`:

> El descarte libera el comercio; una foto rechazada NO lo libera, porque la
> misión sigue viva y el gondolero la puede rehacer.

**La salida terminal ya existe y es `descartarRecaptura()`**: el gondolero la usa
cuando no puede volver al comercio, y cierra con `estado='descartada'` +
`bounty_estado='anulado'`.

### TRAMO PROPIO — no pagar el alta hasta que el comercio esté firme

Anotado el 26/9/2026. Sin empezar. **Es el único que evita el caso en vez de
limpiarlo**, y por eso va anotado aparte del arreglo de los 200 puntos.

Hoy el alta se acredita **al validar**, y validar es reversible: el mismo
comercio se puede rechazar cinco horas después. De ahí salen los 200 puntos
pagados por un comercio mal ubicado.

**Y el incentivo es real, que es lo que lo hace un tramo y no una curiosidad:
dar de alta comercios mal ubicados sale gratis si el pago llega rápido.** El
rechazo posterior no tiene ninguna consecuencia económica, así que la única
defensa contra el alta descuidada es que alguien la mire a tiempo — y el que
mira es la distri, que no gana nada mirando más rápido.

Dos formas, las dos con costo:

- **Una ventana corta antes de liquidar.** Simple, pero elige un número
  arbitrario y sigue pagando lo que se rechace después de la ventana.
- **Liquidar recién al cerrar la campaña.** Cierra el agujero entero y rompe
  la promesa que hoy existe: el gondolero cobra el alta al instante, y eso es
  parte de por qué carga comercios.

**El costo de las dos es el mismo y es de producto**, no técnico: hoy el alta
paga rápido, y eso es un incentivo tan real como el que se quiere corregir. Al
agarrarlo hay que medir cuántas altas se rechazan DESPUÉS de validarse — si son
una en cien, el remedio es peor.

### Campaña que vence con una recaptura sin hacer — RESUELTO el 26/9/2026

Su disparador NO era el rechazo de la foto sino el vencimiento. Y al releerlo
entero apareció que era **peor de lo que decía esta nota**, por una razón que
no estaba escrita:

> El gate de `estaVencida` en `captura/page.tsx` bloqueaba el retake, y con él
> la pantalla `retake-intro` — **que es la única que tiene el botón "Descartar
> la misión"**. O sea que la salida quedaba tan cerrada como la entrada. No era
> "no puede rehacer": era **no puede terminar la misión de ninguna manera**.
>
> Y la salida existía del lado del servidor: `descartarRecaptura` **nunca tuvo
> gate de vigencia**. La action funcionaba; era inalcanzable.

Tampoco la rescataba nada: "Destrabar misiones" exige misión **sin ninguna
foto** y campaña **sin campos de foto**, y las dos condiciones la excluyen.
`cerrarCampana` no la toca (`fotoEsUnidadDePago` deja afuera las fotos con
`mision_id`). Quedaba `pendiente` + `retenido` para siempre.

#### La decisión: una prórroga que la pone la CAMPAÑA

`DIAS_GRACIA_RECAPTURA = 7` en `lib/campana-vigencia.ts`, con
`puedeRecapturar(fechaFin, ahora)`.

**Por qué hay plazo y no queda abierto para siempre:** porque la campaña tiene
que poder cerrar. Una misión completable cualquier día de cualquier año
significa que la distri o la marca nunca saben cuándo terminaron de pagar, y
`cerrarCampana` puede liquidar una campaña que todavía debe trabajo.

**Por qué se cuenta desde `fecha_fin` y no desde el rechazo:** una ventana por
foto es más justa mirada de a una y hace **imposible saber cuándo cierra la
campaña** — la fecha real de cierre pasaría a depender del último rechazo que
alguien emita. Colgada de `fecha_fin`, el cierre es `fecha_fin + 7` y se puede
calcular antes de que pase nada.

**Y por qué NO sale de `DIAS_TTL_COLA`, aunque hoy los dos valgan 7:** aquéllos
dos números son *la misma regla* mirada desde los dos lados, y por eso uno sale
del otro. Éste responde otra pregunta —cuánto tarda una persona en volver a un
comercio, contra cuánto sobrevive un payload en IndexedDB—. Aliasarlos haría
que subir el TTL offline le cambie en silencio el plazo al gondolero.

#### Las cuatro piezas

| | Qué |
|---|---|
| `lib/campana-vigencia.ts` | `puedeRecapturar` — terminar algo abierto y empezar algo nuevo son dos permisos distintos |
| `captura/page.tsx` | el gate usa `puedeRecapturar` cuando hay `?retake=`, y la pantalla avisa en rojo cuántos días quedan |
| `captura/actions.ts` | **la misma guarda en `registrarRecaptura`**: la UI decide qué se muestra, no qué se puede escribir. `descartarRecaptura` NO la lleva, a propósito: bloquear la salida segura es lo que creó el problema |
| `campanas-sections.tsx` | la tarjeta de "Finalizadas" muestra el aviso y el link, que antes vivían solo en la tarjeta activa y desaparecían justo cuando empezaba a correr el reloj |

`scripts/probar-prorroga-recaptura.ts`, con TZ=UTC exigido. **El control de
bordes encontró un off-by-one que la lectura no**: sin el `+ 1` del día de hoy
—que vale entero, igual que `fecha_fin`— el corte se adelantaba un día y le
comía la última jornada a alguien que volvió al comercio en plazo. Verificado
que los dos bordes muerden, moviendo el plazo un día para cada lado.

### Los puntos de una misión no aprobada, invisibles — arreglado el 26/9/2026

En el detalle de campaña la línea de puntos salía **solo con `estado ===
'aprobada'`**. Una misión en revisión o descartada mostraba su badge y **nada
sobre su plata**: 50 puntos en dev que no aparecían en ninguna pantalla.

El silencio no es neutro. "En camino", "trabados" y "perdidos" se veían igual,
y son tres cosas distintas. Ahora `pendiente` dice "N pts en revisión · se
acreditan cuando aprueben tus fotos" y `descartada` dice "N pts no acreditados"
en gris — el resultado ya está decidido y fue él quien lo decidió.

## PARA LA SESIÓN DE SEGURIDAD — server actions que confían en el middleware

Relevado el 25/9/2026, a partir de un hallazgo puntual en las actions de admin.
**El hallazgo puntual resultó ser la mitad chica del problema.**

### La superficie

```
archivos con 'use server'                                    65
actions exportadas                                          161
actions que ESCRIBEN, reciben un id del cliente,
  no miran `tipo_actor` y no se acotan a `user.id`           54
```

> **Cómo se midió, para que el próximo no lo tome como evangelio.** El número
> sale de un clasificador estático: trocea cada archivo por `export async
> function`, mira si el cuerpo escribe, si la firma toma un id y si algo se
> acota con `user.id`. **Sobre-reporta**: `asignarLocalidadDistri` aparece en la
> lista y sí chequea —vía `puedeTocar`, que el regex no ve—. O sea que 54 es un
> techo, no una cuenta. **Dos se verificaron leyendo el código**, y son las que
> fundan las dos clases de abajo.

### CLASE 1 — el admin, que depende de una sola capa

`aprobarComercio` y `rechazarComercio` de `/admin/comercios/pendientes` solo
llaman `requerirSesion()`: que haya alguien logueado. Ninguna mira `tipo_actor`.

**Hoy las cubre el middleware**, y eso está verificado: su matcher toma todas
las rutas, `RUTAS_PERMITIDAS` no incluye `/admin` para ningún actor que no sea
admin, y **una server action postea a la ruta de su propia página**, así que un
gondolero rebota antes de ejecutarla.

Pero es **una capa sola**. El día que alguien toque el matcher, mueva la
pantalla de ruta o agregue un Route Handler que llame a la misma función, estas
actions quedan abiertas a cualquier autenticado **sin que nada falle
visiblemente**.

Son **14 actions de admin** en esa situación, y las que más pesan no son las de
comercios:

```
procesarCanje(canjeId, codigo)          entrega un premio
aprobarFotoAdmin(fotoId)                paga puntos
cerrarCampana(campanaId)                barre y paga bounties
validarDistribuidora / validarMarca     habilita un actor
eliminarZona(id)                        borra
```

### CLASE 2 — cross-tenant, y el middleware NO la cubre

**Ésta es la que importa más, y no estaba en el pedido.**

El middleware chequea `pathname.startsWith('/distribuidora')`. **No chequea
CUÁL distribuidora.** Así que cualquier acción que reciba un id y no verifique
que ese id le pertenece al llamador es cross-tenant, y ninguna capa la tapa.

Verificado leyendo el código:

```ts
// (distribuidora)/distribuidora/gondolas/actions.ts
export async function aprobarFoto(fotoId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const { data: foto } = await adminClient.from('fotos')
    .select('*, campanas(...)').eq('id', fotoId).single()
  // ← nunca se pregunta de quién es la campaña de esa foto
```

**Cualquier distribuidora autenticada puede aprobar la foto de la campaña de
otra, y eso ACREDITA PUNTOS.** No hay ni un `.eq()` contra su `distri_id`.

Y el caso de libro, también verificado:

```ts
export async function marcarNotificacionesDistriLeidas(distriId: string) {
  // el distriId lo manda el cliente y se usa tal cual
```

Por firma, la clase alcanza a **19 actions de distri, 9 de marca y 8 de
gondolero** —éstas últimas cross-USER: `marcarLogrosVistos(gondoleroId)` y las
seis de `distri-actions.ts`, que aceptan o rechazan la vinculación de OTRO
gondolero—. Esas no se leyeron una por una.

### Lo que ya existe y muestra que la forma correcta está inventada

No hay que diseñar nada nuevo: el proyecto ya tiene las tres piezas.

| | Qué hace |
|---|---|
| `puedeTocar` (comercios pendientes de distri) | deriva el `distriId` de la SESIÓN y verifica que el comercio le corresponda |
| `getDistrisDeActor` / `contextoAcceso` | la pertenencia, leída de la tabla de vínculos |
| `idsDe` de `lib/campanas-de.ts` | intersecta lo pedido contra lo permitido: **la lista ES el permiso** |

La regla que sale de las tres, y que es la que hay que aplicar: **el id de la
entidad del que llama nunca viene por parámetro — se deriva de la sesión.** Una
action que recibe `distriId: string` ya perdió, porque el cliente lo elige.

### Por dónde empezaría

1. **Las que mueven plata**, en cualquier panel: `aprobarFoto` × 3 paneles,
   `procesarCanje`, `cerrarCampana`. Son las que convierten un IDOR en un cobro.
2. **Las que reciben el id de la propia entidad** (`distriId`, `marcaId`,
   `gondoleroId`) — se arreglan borrando el parámetro y derivándolo, y eso
   además hace imposible el error a futuro.
3. **Las 14 de admin**, que hoy están cubiertas: es poner la segunda capa, no
   tapar un agujero abierto.

No se tocó nada en este relevamiento: es material para la sesión de seguridad.
Lo único que se cambió en el día fue `asignarLocalidadAdmin`, que nació
mirando `tipo_actor` en vez de heredar el patrón.

### Tramo propio — 137 escrituras que no chequean el error (33 críticas)

**El patrón:** `supabase-js` NO lanza excepción ante un error de Postgres. Lo
devuelve en `.error` del resultado. Entonces esto:

```ts
await admin.from('movimientos_puntos').insert({ ... })
```

falla en silencio: sin excepción, sin log, sin rastro, y el código sigue como si
hubiera funcionado. Salió a la luz el 16/9/2026 porque los cuatro pasos de
`aprobarMisionCore` lo tenían, y eso dejó 3 misiones survey-only trabadas en dev
sin que nadie se enterara.

**Para medir el avance:** `node scripts/escrituras-sin-chequear.js`. La
heurística es un statement que arranca con `await` pelado y hace `.insert(` /
`.update(` / `.upsert(`. Si el resultado se captura, se asume que alguien mira
el error — **no verifica que lo mire**, así que el número es un piso.
`retirarFoto` captura `movError` y solo lo pasa por `console.log`.

| | Al 16/9/2026 |
|---|---|
| Total sin chequear | **137** |
| Que tocan plata o estado de misión | **33** |

Los 33 críticos, por tabla:

| Tabla | Casos | Por qué importa |
|---|---|---|
| `fotos` | 16 | El estado de la foto decide si la misión se aprueba y si se paga |
| `movimientos_puntos` | 12 | **Único escritor de `profiles.puntos_disponibles`**, vía el trigger `on_movimiento_puntos`. Si el insert falla, los puntos no existen |
| `participaciones` | 4 | Avance del gondolero en la campaña |
| `canjes` | 1 | `admin/canjes/actions.ts:21` |

Concentrados en cinco archivos: `admin/fotos/actions.ts` (7),
`distribuidora/gondolas/actions.ts` (7), `marca/gondolas/actions.ts` (4),
`admin/comercios/pendientes/actions.ts` (3),
`distribuidora/comercios/pendientes/actions.ts` (3).

### La asimetría que ordena la prioridad

**Un crédito que falla le cuesta plata al gondolero, que reclama — así que se
descubre. Un débito que falla le cuesta plata a la empresa, y no reclama nadie.**

Por eso los débitos fueron primero. **Hay uno solo de débito en todo el repo** —
verificado con `grep "'debito'"`: `app/(gondolero)/gondolero/perfil/actions.ts`,
el del canje. Arreglado el 16/9/2026: chequea el error y, si falla, borra el
canje que acababa de crear. Antes, si ese insert fallaba, el canje quedaba
registrado y el gondolero conservaba los puntos: premio gratis, sin traza.

Los 12 `movimientos_puntos` que quedan son **todos créditos**, y por eso pueden
esperar al tramo: si fallan, el gondolero ve que no le pagaron y avisa.

Queda una operación con forma de débito que el script no marca:
`gondolero/misiones/actions.ts:79` (`retirarFoto`) borra los
`movimientos_puntos` de la foto y captura `movError`, pero solo lo loguea. La
salva una FK: si el borrado falla, el `DELETE` de `fotos` que sigue también
falla y ese sí corta.

### Las tres respuestas, y por qué la parte difícil no es agregar el chequeo

Chequear el error es una línea. **Lo difícil es elegir qué hacer con él**, y hay
tres respuestas distintas según el caso:

1. **Tirar** — cuando el llamador puede reintentar sin duplicar nada.
2. **Devolver `{ error }`** — cuando hay una pantalla adelante que lo muestre.
3. **Loguear fuerte y seguir** — cuando el trabajo del usuario ya está guardado y
   fallar perdería más de lo que salva.

La 3 es la de `resolverMisionDirecta`: no re-lanza a propósito, porque tirar
haría que la cola offline reintente una misión que se grabó bien, y se perdería
trabajo del gondolero por un fallo de contabilidad.

**La 3 solo es aceptable si existe una forma de reparar después.** Para las
misiones trabadas es el botón "Destrabar misiones" de `/admin/campanas`. Para
los demás casos hay que inventarla, o elegir la 1 o la 2. Ahí se va el trabajo
del tramo, no en los chequeos.

Un cuarto camino que conviene evaluar para los pares que tienen que pasar
juntos —canje + débito, aprobación + acreditación—: **una función SQL que haga
las dos cosas en una transacción**. Elimina la clase de problema en vez de
angostar la ventana. Hay precedente de RPC en el repo
(`backfill_codigos_gondolero`, `incrementar_puntos`).

### Pendiente — una campaña de seguimiento cerrada no se va nunca de "finalizadas"

La sección "Campañas finalizadas" del panel del gondolero
(`app/(gondolero)/gondolero/campanas/page.tsx`) corta a los 90 días **medidos
desde `fecha_fin`**, y tiene esta guarda:

```ts
!c.fecha_fin || ahora - new Date(c.fecha_fin).getTime() <= NOVENTA_DIAS_MS
```

Sin `fecha_fin` → se muestra siempre. Eso está bien para una puntual antigua sin
fecha, pero una campaña de **seguimiento** nunca tiene `fecha_fin` por diseño:
una vez cerrada a mano, le va a seguir apareciendo al gondolero **para siempre**.

No es urgente —con pocas campañas no molesta— pero acumula. Para arreglarlo hace
falta saber **cuándo se cerró efectivamente**, que es un dato que hoy no existe:
`fecha_fin` es la fecha *planificada* de vencimiento, no la de cierre real. Ya
está anotado como limitación en el comentario de esa función. La solución
probablemente sea una columna `cerrada_at` que se escriba al pasar a 'cerrada',
y entonces el corte de 90 días se mide sobre eso en las dos modalidades.

### Etapa 5 de seguimiento — medir la semana (pendiente)

`visitas_por_semana` hoy **solo se muestra**: en la lista de distri, la tarjeta
del gondolero y la cabecera de resultados. Barrido el 17/9/2026, no hay una sola
línea que lo mida. Una campaña de seguimiento acepta 0 visitas o 50 en la semana
y el sistema no nota la diferencia: declara una frecuencia que nadie verifica.

**Es la diferencia entre "se puede crear y capturar" y "funciona"** — y es
justamente lo que la distribuidora está comprando.

Lo que hay que definir y construir:

- **Qué es la semana.** Lunes a domingo, según se decidió. Pero el servidor corre
  en UTC y Argentina es GMT-3, así que el lunes empezaría a las 21:00 del
  domingo y las visitas de esas tres horas contarían para la semana equivocada.
  **No se puede hacer bien sin resolver antes la zona horaria** (ver la sección
  "Zona horaria" de este archivo).
- **Qué ve el gondolero.** Hoy no tiene forma de saber cuántas visitas le faltan
  esta semana ni en qué comercio. Sin eso, la frecuencia es una regla que solo
  conoce quien creó la campaña.
- **Qué ve la distribuidora.** Cumplimiento por comercio y por semana, que es el
  dato por el que paga.
- **Qué pasa si no se cumple.** ¿Se avisa? ¿Afecta el pago? Es una decisión de
  producto, no una consecuencia técnica.
- **Contra qué se mide.** El denominador natural es
  `comercios asignados × visitas_por_semana`, pero "asignados" no existe como
  concepto: hoy el gondolero toma los comercios que quiere hasta el máximo.

### Los Server Actions redactan el mensaje de las excepciones en producción

Cuando un Server Action **lanza** una excepción que nadie atrapa, Next.js
reemplaza el mensaje por uno genérico en los builds de producción:

> An error occurred in the Server Components render. The specific message is
> omitted in production builds to avoid leaking sensitive details.

El texto real queda solo en los logs de Vercel, con un digest. **Un valor
DEVUELTO no se redacta.**

Hasta el 17/9/2026 `registrarMision` tenía seis mensajes cuidados —vencimiento,
cupo, distancia, comercio duplicado, campaña inexistente, campaña inactiva— y
**ninguno era legible** para el gondolero. Donde más dolía era la cola offline,
que guarda el mensaje como `motivoRechazo` en IndexedDB y se lo muestra con los
botones Reintentar y Descartar: el gondolero decidía entre los dos leyendo el
error de Next. El bloqueo por distancia parecía funcionar solo porque el cliente
lo frena antes, en el paso de GPS, con su propio texto.

**La regla, en `registrarMision` y en cualquier action nueva:**

| Tipo | Qué hace | Por qué |
|---|---|---|
| Rechazo de **negocio** — terminal, el usuario puede entenderlo | `return { ok: false, motivo }` | El texto llega entero |
| Error de **infraestructura** — transitorio | `throw` | Se reintenta; el texto no importa |

La distinción no es estética: es la que usan los llamadores para decidir si la
misión se marca rechazada o queda pendiente. Al cambiar una action a este
contrato, **todos sus llamadores van en el mismo commit**. Si deja de lanzar y
un llamador sigue esperando la excepción, toma el rechazo como éxito — en la cola
eso significa `borrarMisionDeCola`, o sea el trabajo del gondolero borrado sin
registro. `components/gondolero/cola-sync-offline.tsx` lleva un `continue` en la
rama de rechazo que es exactamente esa guarda.

`lib/error-infra.ts` traduce lo que igual llegue ilegible. Y desde este cambio,
un error inesperado en la cola **deja la misión pendiente en vez de marcarla
rechazada**: los rechazos reales ahora llegan por el `return`, así que lo único
que cae en el `catch` es transitorio y descartarlo sería tirar trabajo válido.
El reintento está acotado por el TTL de 7 días de `lib/mision-queue.ts`.

### `profiles.alias` es privacidad, no decoración

**No cambiar el fallback del ranking a `nombre`.** Parece lo obvio y expone datos
personales. Casi lo hago el 17/9/2026.

Tres evidencias de que el alias existe para que un gondolero NO vea el nombre
real de otro:

1. **La query del ranking excluye `nombre` a propósito.**
   `app/(gondolero)/gondolero/logros/page.tsx` pide `id, alias, distri_id` para
   los OTROS gondoleros y, doce líneas más arriba en la misma función, pide
   `alias, nombre` para el perfil PROPIO. Misma persona, mismo archivo,
   decisiones opuestas: es deliberado.
2. **El alias dejó de ser una abreviatura.** El schema de abril lo definía como
   `-- "Agustín R." para gondoleros`, un nombre real acortado. Pero
   `lib/aliases.ts` genera **"NarutoVeloz"**: 600 personajes de anime cruzados
   con adjetivos. Eso no abrevia un nombre, lo reemplaza. El comentario del
   schema quedó viejo.
3. **Los paneles de empresa traen los dos campos, siempre.** Doce queries en
   distribuidora, marca, admin y repositora piden `nombre, alias` juntos: la
   distri contrata al gondolero y le paga, tiene que saber quién es. El panel
   del gondolero es el único que trae solo el alias.

**El ranking de logros es la única pantalla donde un gondolero ve a otro**, y es
NACIONAL: el público es cualquier gondolero del sistema, no solo los de su
distri. O sea la superficie de exposición más amplia que tiene la app.

Cuando falta el alias se usa `aliasAnonimo(id)` de `lib/aliases.ts` →
`"Gondolero 7F2"`. El sufijo sale del `id` y no del puesto en el ranking porque
el puesto ya se muestra en la columna de al lado y además cambia: quien mirara el
lunes y el jueves vería a "Gondolero #4" convertirse en "#6" y pensaría que es
otra persona.

El alias faltante se repara con el botón "Asignar alias" de `/admin/usuarios`, o
con `npx tsx scripts/asignar-alias.mjs --ref <project-ref>` donde no haya acceso
de admin. **Nunca con un UPDATE en SQL:** `generarAlias` chequea unicidad contra
los alias ya escritos, y un UPDATE a mano que no lo replique genera repetidos —
dos personas con el mismo nombre en el ranking es peor que el problema original.

### Pendiente — mover `generarAlias` del cliente a una server action

Hoy el alias del registro público se genera **en el browser**, antes del
`signUp`: `app/auth/page.tsx` llama a `generarAlias(supabase)` con el cliente
**anónimo**.

**La promesa de unicidad es de mentira.** Adentro, `generarAlias` chequea así:

```ts
const { data } = await supabase.from('profiles').select('id').eq('alias', alias)
if (!data) return alias
```

Eso corre **sin sesión** —es anterior al alta— y la policy de `profiles` es
`(id = auth.uid()) OR get_tipo_actor() = 'admin'`. Un anónimo probablemente no
vea ninguna fila, así que `!data` da verdadero **siempre** y la función devuelve
el primer candidato sin haber verificado nada. Falla abierta y en silencio: el
mismo modo que ya mordió con `comercios_relevados` y con el scoping de comercios.

Hay un `catch` vacío alrededor —sin siquiera un `console.error`— cuyo comentario
dice *"se puede asignar después"*, pero nadie se entera de que hay que hacerlo.
Es la misma frase que justificaba el `catch` de `resolverMisionDirecta`.

**Todavía no dejó rastro**: al 17/9/2026 prod tiene 29 perfiles con alias y
**cero repetidos**. El espacio de nombres lo explica —600 personajes × cientos de
adjetivos— así que las colisiones son improbables aunque nadie las chequee. Los
24 sin alias que había en dev venían del seed, que nunca llamaba a la función;
eso ya está arreglado.

**El arreglo es una server action de diez líneas** que llame a `generarAlias` con
service role: ahí el chequeo ve todas las filas y la promesa se vuelve cierta. Es
prevención barata, no reparación.

**Se descartó moverlo a `handle_new_user`**, a diferencia de
`codigo_gondolero`. No es el mismo caso: el generador del código son ocho
dígitos y cabe en SQL, pero el del alias son 600 personajes y cientos de
adjetivos, y duplicar esas listas en SQL contradice todo lo demás. Si alguna vez
se reconsidera, primero hace falta un índice UNIQUE sobre `alias` —hoy no lo
tiene— porque sin él el reintento del trigger no tendría contra qué chocar.

### Si aparece "Listo para cobrar, esperando aprobación", la liberación falló

`lib/puntos-retenidos.ts` marca una campaña con `listoPeroRetenido` cuando el
gondolero **ya alcanzó el mínimo** y todavía tiene puntos de misiones APROBADAS
en `bounty_estado='retenido'`.

**No debería pasar nunca.** `aprobarMisionCore` corre la barrida de liberación en
CADA aprobación, así que alcanzado el mínimo no puede quedar nada aprobado
retenido. Si aparece, la barrida no corrió cuando debía — probablemente un error
en el camino de aprobación.

Queda un `console.warn` con el `gondoleroId` y las campañas afectadas. **Si se ve
en los logs de producción, hay que mirarlo**: significa plata que el gondolero
ganó, que el sistema reconoce como ganada, y que no le llegó al saldo.

La pantalla muestra *"Listo para cobrar, esperando aprobación"* — es la verdad y
no promete una acción que no existe, porque no hay nada que el gondolero pueda
hacer al respecto.

### El mínimo se mide en comercios distintos, y hay tres pantallas que lo dicen

`min_comercios_para_cobrar` se compara contra **comercios DISTINTOS con misión
aprobada**, que es lo que cuenta `aprobarMisionCore` para decidir el pago. En
modalidad puntual da lo mismo que contar misiones —el índice único garantiza una
misión viva por comercio— pero en seguimiento no: tres visitas al mismo comercio
son tres misiones y un solo comercio.

Lo dicen tres superficies, y el 17/9/2026 dos ya habían divergido:

| Pantalla | Qué muestra |
|---|---|
| Logros | Bloque "puntos en camino", junto al saldo |
| Actividad | El mismo bloque, arriba de los movimientos |
| Detalle de campaña | "a N comercios de cobrar", por misión retenida |

Las tres derivan de `lib/puntos-retenidos.ts`, salvo el detalle de campaña, que
calcula el suyo con los datos que ya tiene en pantalla pero **con la misma
definición**. Si se toca una, revisar las tres.

**No usar `participaciones.comercios_completados`** para esto: es un contador
guardado y lo encontramos desincronizado por herencia del seed. Un número que
promete plata no puede salir de una columna que puede estar vieja.

### PENDIENTE — una campaña sin fotos paga sin que nadie mire el dato

**Error conceptual, no un bug puntual. Toca el modelo de revisión entero.**

Una campaña de solo preguntas se aprueba **al registrarse**:
`registrarMision` llama a `resolverMisionDirecta()` cuando `params.fotos.length
=== 0`, que marca la misión `'aprobada'` en el acto. Después, al llegar a
`min_comercios_para_cobrar`, `aprobarMisionCore` libera el bounty. **En ningún
punto de esa cadena interviene una persona.**

Hoy la ÚNICA puerta de control de calidad es la aprobación de fotos. Las
campañas sin foto no tienen ninguna: el gondolero contesta lo que quiera, y con
suficientes comercios cobra.

**Hay que definir quién y cómo valida una misión de solo preguntas.** No alcanza
con "que la revise la distri": no existe pantalla para eso —los paneles de
revisión están construidos sobre `fotos`, no sobre `mision_respuestas`— así que
es diseño nuevo, no un ajuste.

Dos consecuencias laterales que conviene tener a la vista al decidir:

- **El mínimo no es un control de calidad, es un umbral de cantidad.** Hoy es lo
  único que separa "contestó" de "cobró", y no mira el contenido.
- **Una campaña sin fotos no sube de nivel.** `incrementar_fotos_aprobadas` se
  llama al aprobar una FOTO, y el nivel del gondolero sale de ahí. O sea que ese
  trabajo paga puntos pero no cuenta para su progresión. Puede estar bien o no,
  pero hoy es un efecto accidental de dónde está el gancho, no una decisión.

Relacionado: "Pendiente — SMTP propio" y el botón "Destrabar misiones", que
reintenta la aprobación automática de estas mismas misiones.

### El comercio propio SÍ se bloquea en campaña puntual (resuelto 18/9/2026)

En `lib/comercio-seleccionable.ts`, la exención de "comercio propio" vale **solo
para el cupo**, no para "ya relevado":

```ts
if (ctx.relevadosPorOtros.has(comercioId)) return 'ya_relevado'   // sin exención
if (!esPropio && cupoPropioLleno(ctx))     return 'cupo_propio'   // con exención
```

`relevadosPorOtros` se llena SOLO en campañas puntuales, y ahí el índice único
`misiones_campana_comercio_uniq` prohíbe una segunda misión viva sobre el mismo
par (campaña, comercio) **sea de quien sea, incluido él**. El cupo es otra cosa:
volver a un comercio propio es lo que una campaña de seguimiento pide, y el gate
del servidor ya lo permite con `esComercioNuevo`.

Entre el 17 y el 18/9/2026 la exención estaba en las dos líneas, y el efecto era
el rechazo tardío de siempre: la lista mostraba el comercio elegible, el
gondolero sacaba la foto y completaba el formulario, y recién al enviar lo
rechazaba el índice — con el único mensaje que ese camino sabe dar, *"otro
gondolero relevó este comercio antes que vos"*, que además era falso.

La revalidación del paso de GPS en `captura/page.tsx` tenía la misma exención y
se corrigió igual. Ahí ahora se distingue el motivo: *"Ya relevaste ese comercio
en esta campaña"* si es suyo, *"Otro gondolero relevó ese comercio mientras lo
elegías"* si no.

**Queda pendiente un tercer factor, menor:** el set de relevados se carga en un
efecto que depende de `[campana?.id, campana?.modalidad]`, así que dentro de una
misma sesión no se refresca después de registrar una misión. La revalidación del
paso de GPS lo tapa, pero conviene refrescarlo al volver a la lista.

### El nivel cuenta misiones aprobadas del mes (17/9/2026)

`lib/nivel-mensual.ts` es la única fuente: **misiones aprobadas del mes en
curso**, derivadas al leer. Lo usan la pantalla de Logros (nivel, barra de
progreso, ranking) y el perfil del gondolero.

Antes contaba filas en `fotos`, y eso dejaba a las **campañas de solo preguntas**
fuera de la progresión: pagaban puntos y no sumaban nada al nivel. No era una
decisión de producto, era un efecto de dónde había quedado el gancho — el único
incremento estaba en el camino de aprobación de FOTO.

Los umbrales (`fotosCasualAActivo`, `fotosActivoAPro` en la config) **no
cambiaron**: en las campañas con foto hay casi siempre una foto por misión, así
que el número se mueve poco.

El ranking cuenta lo mismo que el nivel. Si ordenara por fotos y la insignia
saliera de misiones, cada fila mostraría dos medidas que no cuadran.

### `incrementar_fotos_aprobadas` NO EXISTE en la base

Verificado en dev el 17/9/2026: `pg_proc` no devuelve nada para ese nombre, y
tampoco hay triggers ni funciones que la mencionen.

**Y sin embargo las tres actions de aprobación de foto la llaman** —
`admin/fotos/actions.ts`, `distribuidora/gondolas/actions.ts`,
`marca/gondolas/actions.ts`— con un `if (rpcFotosError) console.error(...)`. O sea
que **cada aprobación de foto viene fallando en silencio desde siempre**, y
`profiles.fotos_aprobadas` nunca se incrementó en ningún ambiente.

Consecuencias, que importan para el tramo siguiente:

- **`profiles.nivel` nunca se actualizó por la app.** `calcularNuevoNivel` lee el
  contador, que está en cero, así que nunca sube a nadie. Lo que hay en dev lo
  escribió el seed a mano (`nivel: 'activo'` literal) o es el DEFAULT `'casual'`.
- **`tasa_aprobacion` tampoco**, si era esa función quien la recalculaba. El
  perfil del gondolero y el detalle de usuario del admin la muestran igual.

**Esto se descubrió después de tres afirmaciones mías sobre la base que no se
verificaron contra la base.** Antes de afirmar que algo existe en Postgres —una
columna, una función, un trigger— hay que consultarlo. El dump
`docs/schema-real-2026-09-pre-incidente.md` no alcanza, y el código que llama a
algo tampoco prueba que ese algo exista.

### Los gates usan el máximo alcanzado (18/9/2026)

Hay **dos** niveles y no son el mismo número:

| | Quién lo calcula | Qué mide | Dónde se usa |
|---|---|---|---|
| **Del mes** | `lib/nivel-mensual.ts` | misiones aprobadas del mes en curso | lo que se MUESTRA: Logros, perfil, ranking, las 9 insignias de los paneles |
| **Máximo alcanzado** | `lib/nivel-maximo.ts` | el mejor mes de toda su historia | los 4 GATES |

**El privilegio ganado no se pierde.** Un Pro de marzo que no trabaja en abril no
puede quedarse sin acceso a las campañas Pro ni sin poder canjear una
transferencia con los puntos que ya ganó. Si algún día se quiere penalizar la
inactividad va a ser con una regla explícita, no como efecto lateral de cómo se
calcula el nivel.

Los cuatro gates —eran **cuatro**, no tres: el del canje se venía contando mal—:

1. `gondolero/campanas/page.tsx` — el chip "Requiere nivel X"
2. `gondolero/campanas/[id]/page.tsx` — ídem, en el detalle
3. `gondolero/campanas/[id]/actions.ts` — **el control real**, el de unirse
4. `gondolero/perfil/actions.ts` — el canje de transferencia, solo Pro

**`null` no es `casual`.** `nivelMaximoAlcanzado` devuelve `null` cuando la
consulta falla, y eso NO se aplasta a "casual": decirle "requiere nivel Pro" a un
gondolero que ES Pro porque Supabase devolvió un 500 es el rechazo tardío de
siempre disfrazado de regla de negocio. Las actions devuelven un error de
infraestructura que dice "probá de nuevo"; las pantallas no bloquean, porque
informan y el control real vuelve a medir.

**El catálogo de canjes es un gate, no una insignia.** `CanjeCatalogo` recibía el
nivel del MES mientras `solicitarCanje` miraba `profiles.nivel`: la pantalla
escondía la transferencia a alguien a quien la action se la concedía. Ahora los
dos miran el máximo.

### Se borraron `profiles.nivel` y `profiles.fotos_aprobadas` del código (18/9/2026)

Las columnas **siguen en la base**: el DROP está escrito en
`supabase/migrations/20260918140000_drop_nivel_y_fotos_aprobadas.sql` y se corre
cuando este deploy esté verificado en producción. El orden es ese y no el
inverso — si se dropean primero, cada pantalla que las pedía tira error de
PostgREST.

Qué se tocó, que eran **19 lecturas + 5 escrituras**:

| Tipo | Cuántos | Con qué quedó |
|---|---|---|
| Gates | 4 | `lib/nivel-maximo.ts` |
| Escrituras muertas | 5 | se borraron (ver abajo) |
| Selects ya muertos | 2 | `logros/page.tsx`, `perfil/page.tsx` traían `nivel` sin usarlo |
| Insignias | 9 | el nivel del mes, derivado |
| Columna "Fotos aprobadas" | 5 tablas | `lib/fotos-aprobadas.ts`, contando contra `fotos` |
| Seed | 2 | dejó de escribir `nivel` |

**Las 5 escrituras de `profiles.nivel` existían pero estaban muertas**, que no es
lo mismo que "nadie las escribía": las tres pantallas de aprobación de foto
tenían el mismo bloque copiado —`incrementar_fotos_aprobadas` + leer el contador
+ `calcularNuevoNivel` + `update({ nivel })`— y nunca subió a nadie porque el
contador que comparaban estaba clavado en cero. Se perdió la notificación
"¡Subiste al nivel X!", que tampoco se envió nunca: con el nivel derivado hace
falta otro disparador y es un tramo propio.

**`verificarLogros` ya no recibe `fotosAprobadas` por parámetro**: lo cuenta
adentro, con las filas de `fotos` que ya traía. Que lo cuente la función y no el
llamador es lo que impide que tres pantallas vuelvan a pasar tres números
distintos — era exactamente eso lo que pasaba, y por eso el logro
`primera_foto` **no se desbloqueó nunca** por ese camino.

### Lo medido el 17/9/2026, que es lo que hizo que este tramo fuera gratis

```
                        PROD           DEV
nivel = activo        22 de 29       19 de 24
nivel = pro            1              1
fotos_aprobadas > 0      5 (máx: 6)     0
campañas con nivel_minimo != casual   0        0
canjes de transferencia pedidos         0        0
```

En prod, **8 de los 22 activo no habían hecho nunca una misión**: ocho accesos a
campañas de nivel Activo regalados por el seed. Y como no hay ninguna campaña con
requisito de nivel ni se pidió nunca una transferencia, **los cuatro gates están
inertes**: el cambio no le sacó acceso a nadie en la práctica.

### Una campaña vencida ya no se ofrece ni deja entrar (18/9/2026)

`campanas.estado` es ADMINISTRATIVO y **nada lo cierra por fecha**. Una campaña
cuya `fecha_fin` pasó sigue diciendo 'activa' para siempre, y hasta el 18/9/2026
eso la dejaba en tierra de nadie: la lista del gondolero la mostraba en "En
curso" o en "Disponibles" (filtran por `estado=activa`) y "Finalizadas" no la
tomaba (filtra por `estado IN (cerrada, suspendida, pausada)`). El gondolero la
abría, hacía la misión entera y recién al enviar recibía *"esta campaña terminó
el 2026-04-30 y ya no acepta misiones"*.

`estaVencida` existía en `lib/campana-vigencia.ts` desde el 16/9 y **no la
llamaba nadie**. La regla estaba escrita y sin cablear.

El filtro por fecha ahora está en **tres capas**:

1. **Listado** — `listaActivas` se parte en `vigentes` / `vencidasActivas`. "En
   curso" y "Disponibles" salen de `vigentes`; las vencidas que el gondolero
   trabajó bajan a "Finalizadas".
2. **Conteo** — `totalActivas` sale de esos dos grupos, así que ya no cuenta las
   vencidas.
3. **Captura** — `captura/page.tsx` corta ANTES de montar el primer paso. Para
   eso `fecha_fin` entró a `CAMPANA_CACHE_SELECT`: sin ella el dato no estaba en
   el dispositivo. Los caches viejos no la tienen y ahí no se bloquea nada —
   `estaVencida(undefined)` es false y el gate del servidor sigue estando.

**La ventana de 90 días NO se aplica a las vencidas**, a propósito. Esa ventana
esconde campañas que alguien cerró, o sea que el gondolero las vio terminar. Una
vencida nunca apareció en "Finalizadas" porque nadie la cerró: aplicarle la
ventana la haría desaparecer de la pantalla en el mismo deploy que la saca de
"Disponibles". La de prod venció hace 140 días — con ventana no iría "abajo de
todo", se esfumaría.

### El texto de vigencia sale de un solo lugar

`diasRestantes` tenía `Math.max(0, …)`, así que una fecha de hace cinco meses
daba **0**, y las pantallas leen 0 como "hoy": "Último día", "Hoy", "vence en 0
días", en rojo urgente. Eran **17 call sites en 6 paneles** y la condición
`dias === 0 ? 'Último día' : …` estaba copiada en cinco archivos, ninguno de los
cuales contemplaba una fecha pasada. El `marca/dashboard` tenía encima su propia
cuarta copia calculando los días a mano.

Ahora:

- `diasHastaFin` devuelve **días con signo** y compara DÍAS CALENDARIO en hora
  local. Antes `new Date('YYYY-MM-DD')` se parseaba como medianoche **UTC** y se
  comparaba contra `new Date()` local: en Argentina eso corría el límite tres
  horas y el último día empezaba a las 21:00 del anterior.
- `etiquetaVigencia` devuelve `{ texto, vencida, dias }` y es lo que usan las
  pantallas: *"Terminada hace 140 días"* / *"Último día"* / *"13 días"*, con
  `corto: true` para los chips.
- `diasRestantes` queda como alias numérico y su docstring manda a la etiqueta.

### El rechazo de una misión viene con código, no solo con texto (18/9/2026)

`ResultadoMision` devolvía `{ ok: false, motivo: string }` y nada más. La cola
offline, que decide si ofrecer "Reintentar", no tenía con qué: mostraba los dos
botones siempre. Con una campaña vencida, Reintentar vuelve a subir todas las
fotos para recibir el mismo rechazo — un bucle con el trabajo del gondolero
adentro, sobre datos móviles.

Ahora `{ ok: false, codigo: CodigoRechazoMision, motivo: string }`:

- **`motivo` es para que el gondolero LEA.** Se va a seguir editando.
- **`codigo` es para que el cliente DECIDA.** No cambia.

No se clasificó matcheando el texto, y la razón es el modo de falla típico de
este proyecto: **la regla quedaría escrita dos veces y una se rompería en
silencio**. Alguien mejora un mensaje y el botón de Reintentar reaparece donde no
debe, sin que nada falle visiblemente ni ningún test se ponga rojo; se descubre
tres semanas después. Agregar un `return { ok: false }` nuevo ahora **no compila
sin elegir un código**.

`lib/rechazo-mision.ts` tiene los siete códigos y `rechazoEsDefinitivo`. Los dos
que NO son definitivos: `cupo_propio_lleno` (si descarta otra misión se libera un
lugar) y `fuera_de_radio` (solo se rechaza en vivo; desde la cola entra marcada).

**`rechazoEsDefinitivo(undefined)` es `false` a propósito.** Las entradas ya
rechazadas en el IDB de alguien no tienen código, y ante la duda van los dos
botones: esconder "Reintentar" por un campo ausente le sacaría la única salida a
alguien cuyo rechazo sí era transitorio. Por eso tampoco se bumpeó
`MisionPendienteIDB.version`.

### El TTL de 7 días no se aplica a los rechazos definitivos

El TTL existe para que la cola no crezca sola: protege del caso "una misión que
se reintenta para siempre". Una misión con rechazo definitivo **no se reintenta
nunca** —no hay botón que la mande— así que no hay nada de qué proteger, y
borrarla tiene un costo real:

> Si la única acción posible es descartar y la descartamos nosotros por él, le
> sacamos el único registro de que trabajó y de por qué no le sirvió. Un día va a
> mirar la lista y no va a estar.

Esa entrada se queda hasta que el gondolero la descarte. Las reintentables sí
vencen, que es donde el TTL hace su trabajo. Y como la única acción que queda
borra el trabajo, la tarjeta ahora lo dice de frente en vez de ofrecer un tacho
sin explicación.

### Medido el 18/9/2026 — el problema no era una campaña

```
                                   PROD        DEV
activas con fecha_fin vencida      1           1     (la misma, del seed, -140d)
activas vigentes                   5           12
próxima en vencer                  31/12       30/09 (en 13 días)
```

La de prod tiene **10 participaciones y 27 misiones**: para esos 10 gondoleros
aparecía en "En curso", no solo en "Disponibles". Y como nada cierra por fecha,
toda campaña que llegue a su `fecha_fin` se convierte en una de estas: el 1/1 en
prod habrían sido 6.

### `npm run db:types` NO FUNCIONA en esta máquina

`supabase gen types typescript` necesita **Docker** para `--db-url`, y Docker no
está instalado acá. Con `--linked` tampoco: no hay proyecto linkeado (no existe
`supabase/config.toml` ni `supabase/.temp/project-ref`). La alternativa
`--project-id` pide `SUPABASE_ACCESS_TOKEN`.

**Mientras tanto, para tocar `types/database.ts` con seguridad**: el paquete `pg`
está en node_modules y `PGURL` está en los dos `.env`, así que se puede leer el
schema real e ir a lo seguro —

```js
const { rows } = await c.query(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema = public ORDER BY table_name, ordinal_position`)
```

— y comparar contra los bloques `Row:` del archivo. Es lo que se hizo el
18/9/2026 al borrar `nivel` y `fotos_aprobadas`: se editó a mano solo esas seis
líneas (Row/Insert/Update × 2) y se verificó que `profiles` quedara idéntico a la
base, columna por columna.

### Deriva conocida entre `types/database.ts` y la base (medida 18/9/2026)

El archivo está generado y **viene atrasado desde antes de este tramo**. Contra
dev:

| Tabla | Falta en types |
|---|---|
| `comercios` | `motivo_rechazo` |
| `misiones` | `unico_por_comercio` (ya está en las dos bases; falta solo en el archivo) |
| `comercios_reportes_ubicacion` | la tabla entera |
| `comercios_ubicacion_historial` | la tabla entera |

No rompe nada porque casi todo el código castea a `any` en esas tablas, pero es
deuda: se arregla con una regeneración de verdad, que necesita Docker o un token.

### La migración `20260915140000` se corrió en prod el 18/9/2026 — tres días tarde

`misiones.unico_por_comercio`, el índice parcial `misiones_campana_comercio_uniq`
y el trigger `misiones_set_unico_por_comercio` **faltaban en producción desde el
15/9**. Se detectó comparando `information_schema` de las dos bases: dev tenía
417 columnas y prod 416, y esa era la única diferencia.

Durante esos tres días, en prod **nada impedía dos misiones vivas sobre el mismo
par (campaña, comercio)**: dos gondoleros podían relevar el mismo comercio en una
campaña puntual y cobrar los dos.

**Y había un duplicado real, que bloqueó la migración hasta resolverlo.** El
índice es único: no se crea si los datos ya lo violan. El par era:

| | Creada | Estado | Bounty | Puntos |
|---|---|---|---|---|
| Misión 1 | 12/9 20:11 | aprobada | acreditado | 80 |
| Misión 2 | 16/9 23:50 | **descartada** | anulado | 80 |

Mismo gondolero (ReinerIndomable), mismo comercio ("LB sin conex"), misma campaña
puntual ("Encuesta presencia Suprante"), **cuatro días de diferencia**. Se
descartó la segunda —`estado=descartada`, `bounty_estado=anulado`— y recién
ahí el índice pudo crearse. Verificado después: 0 pares con más de una misión
viva en las dos bases.

**Lo que esto enseña sobre el orden de las cosas**: una migración que crea un
índice único no es idempotente respecto de los datos. Correrla tarde significa
que el período sin protección pudo generar exactamente las filas que después la
bloquean, y alguien tiene que decidir a mano cuál de las dos sobrevive. Acá el
duplicado era del mismo gondolero, así que no hubo que elegir entre dos personas;
si hubieran sido dos, la decisión habría sido de plata.

Relacionado: el rechazo `comercio_duplicado` de `lib/rechazo-mision.ts` **depende
de este índice**. Entre el 15 y el 18/9 ese código existía en prod y no se
disparaba nunca.

### Cortar el vínculo cierra el trabajo en curso (18/9/2026)

> **CORRECCIÓN (22/9/2026): este párrafo decía que un gondolero pertenece a UNA
> distribuidora a la vez y quedó viejo.** El Walled Garden protege los DATOS de
> cada ejecutor —que A no vea lo que se hizo para B—, no la exclusividad de la
> persona. Un gondolero o un fixer puede estar vinculado a varias distribuidoras
> y repositoras a la vez, y el código ya lo hace: `getDistrisDeActor` devuelve un
> `string[]` leído de la tabla de solicitudes, y `ContextoAcceso.misRepoIds`
> también es un array.
>
> Lo que sigue valiendo del tramo del 18/9 es todo lo demás: **cortar un vínculo
> cierra el trabajo en curso DE ESE vínculo**. Eso no dependía de la
> exclusividad.

Desvincular no sacaba al gondolero de las campañas de esa distribuidora en las
que ya estaba, así que seguía relevando para ella después del corte. Lo
verificado:

- `misCampanas` en campanas/page.tsx filtra por participación o misiones y **no
  aplica `tieneAcceso`** — la campaña seguía en "En curso".
- `captura/page.tsx` no chequea el vínculo.
- `registrarMision` tampoco: sus siete rechazos no incluyen "ya no pertenecés".

`lib/cerrar-vinculacion.ts` hace las dos cosas, y lo usan los **tres** caminos:
la distri desvincula, el gondolero se va, y la distri desvincula un fixer.

**1. Cierra las participaciones activas** con estado `cerrada` (migración
20260918170000, que amplía el CHECK). `completada` afirmaría un trabajo que no
terminó y `abandonada` le echaría la culpa a él.

**2. Paga los bounties retenidos que estén APROBADOS**, aunque no se haya llegado
a `min_comercios_para_cobrar`. El mínimo es un umbral de CANTIDAD, no de calidad.
Y la liberación normal la dispara **la siguiente aprobación** de una misión de esa
campaña: si el gondolero ya no puede trabajar ahí, esa próxima aprobación no llega
nunca y los puntos quedan retenidos para siempre — la misma forma de falla que
`lib/misiones-trabadas.ts`, pero sin reintento posible porque no falló nada.

El filtro `estado = aprobada` **no es opcional**: es un segundo escritor sobre
las mismas filas que `aprobarMisionCore`, y si el filtro no fuera idéntico
volvería el agujero que se cerró el 16/9 —pagar trabajo sin revisar— por la
puerta de al lado.

**El guard viejo se reemplazó, no convive.** `verificarDesvincularGondolero`
devolvía `campanasBloqueantes` y hacía imposible desvincular con trabajo en
curso. Eso quedó al revés del Walled Garden: dejaba al gondolero atrapado, o lo
empujaba al camino del perfil, que **no tenía ningún guard** y dejaba todo
colgado igual. Ahora `previsualizarCierre` cuenta lo mismo para **avisarlo** en
la confirmación, y el texto dice qué campañas se cierran y cuántos puntos se
pagan antes de apretar.

### Quién corta decide si los retenidos se pagan

```
iniciadoPor = 'distri'     → los retenidos aprobados SE PAGAN
iniciadoPor = 'gondolero'  → QUEDAN RETENIDOS
```

**Las participaciones se cierran igual en los dos casos.** Lo que cambia es el
dinero, no el estado del trabajo: una campaña a la que ya no puede entrar tiene
que cerrarse venga de donde venga el corte.

El argumento que justifica el pago es que la desvinculación **no es decisión del
gondolero**: dejarle plata retenida por algo que no controla es la peor versión
del sistema. **Cuando es él quien se va, sí la controla, y el argumento no le
aplica.**

Sin esa distinción, desvincularse es una forma de cobrar por debajo del mínimo:
una misión de una campaña con mínimo 3, se desvincula, cobra, pide que lo
re-inviten y repite. El mínimo pasaría a ser optativo para cualquiera dispuesto a
desvincularse.

La primera versión del 18/9 pagaba en los dos caminos, con el argumento de que un
solo comportamiento para el mismo hecho es mejor que dos. **Se corrigió el mismo
día**: el hecho NO es el mismo, porque en un caso la decisión es suya y en el
otro no.

**Y la decisión tiene que ser informada ANTES de confirmar.** El gondolero que se
va ve, en la misma pantalla y antes de apretar:

> *"Si te vas ahora, los 150 puntos que tenés retenidos en esa campaña se quedan
> retenidos, porque no llegaste al mínimo para cobrarlos."*

El **porqué** va en el texto a propósito: sin él parece un castigo arbitrario, y
no lo es — esos puntos se liberan al completar el mínimo, y él eligió irse antes.
Enterarse después, por un saldo que no se movió, sería la misma trampa del
rechazo tardío que sacamos de todo el resto del sistema.

Los textos viven en `lib/mensaje-desvinculacion.ts` y **no se escriben en cada
pantalla**: son tres caminos que cortan el mismo vínculo y dicen cosas OPUESTAS
según quién corta. La condición es `resumen.seLiquidan`, que la calcula
`cerrarVinculacion` — la pantalla no la deduce.

### Lo único reversible es el vínculo

Los dos botones de desvincular de la distri —gondoleros y fixers— cerraban su
confirmación con *"esta acción puede revertirse si el gondolero solicita
vinculación nuevamente"*. **Era falso en las dos mitades que importan:**
revincular no reabre las participaciones `'cerrada'` ni vuelve a retener los
puntos ya acreditados. Prometía reversibilidad justo sobre lo que no lo es.

Ahora dice: *"Podés volver a vincularlo después, pero las campañas cerradas no se
reabren."*

El texto entero de esa confirmación vive en `descripcionConfirmarDesvincular()`
de `lib/mensaje-desvinculacion.ts` y lo usan los dos botones. Estaba copiado, y
por eso la misma mentira estaba escrita dos veces.

**De paso salió un bug que yo mismo había dejado:** el botón de fixers seguía
llamando a `verificarDesvincularFixer` —el guard que BLOQUEA— mientras su action
ya cerraba el trabajo en curso. El commit que cableó `cerrarVinculacion` en el
camino de fixers agregó `previsualizarDesvincularFixer` y **no enchufó el botón**.
La función vieja se borró para que no vuelva a usarse por error.

### Los CHECK que importan para esto (medidos 18/9/2026)

```
movimientos_puntos.concepto  → SIN CHECK, texto libre  ✓ el concepto nuevo no
                                                         necesita migración
movimientos_puntos.monto     → CHECK (monto > 0)       ⚠ no insertar con 0
participaciones.estado       → CHECK IN (activa, completada, abandonada)
                                                        ⚠ cerrada NO entraba
```

El que bloqueaba era el de `participaciones`, no el del concepto. **La migración
20260918170000 va ANTES del deploy**, al revés que el DROP de columnas: acá el
código nuevo escribe un valor que la base rechazaba.

### Un DROP se verifica con un grep DESPUÉS de escribir el código, no antes

El 18/9/2026, horas después de correr el DROP de `profiles.nivel` en dev y prod,
el perfil del gondolero mostraba **"Gondolero"** en vez del alias y **"Sin código
asignado. Contactá al administrador"** a alguien que tenía código. Los dos datos
estaban en la base.

La causa: `perfil/page.tsx` seguía pidiendo `nivel` en su select. En el
relevamiento del tramo yo mismo había escrito *"selects ya muertos (2):
logros/page.tsx y perfil/page.tsx traían `nivel` sin usarlo"* — y saqué el de
logros y no el de perfil. **Confié en haber hecho el cambio en vez de volver a
verificarlo.**

**La regla: después de terminar el código y ANTES de decir que está listo, se
vuelve a grepear el nombre de la columna.** El grep previo sirve para dimensionar
el trabajo; el posterior es el único que prueba que se hizo. Ni el typecheck ni
el build lo agarran, porque un nombre de columna es un string.

### PostgREST rechaza la consulta ENTERA por una columna inexistente

Esto es lo que hace que el bug no se parezca a su causa, y vale para cualquier
DROP futuro:

```
.select('nombre, alias, nivel, codigo_gondolero, tipo_actor')
  → data : null
  → error: column profiles.nivel does not exist
```

**No devuelve la fila sin esa columna: no devuelve nada.** Así que el síntoma no
es "falta un dato" sino **"no existe el perfil"**, y todos los
`profile?.x ?? fallback` de la pantalla se disparan a la vez. Lo que se ve es un
nombre genérico, un alias que no aparece, un código que "no está" y —lo que menos
se nota— `tipo_actor === 'fixer'` dando false para un fixer, que le muestra las
secciones del gondolero.

Buscar el bug en los fallbacks es buscarlo donde no está: los fallbacks están
funcionando bien sobre una fila nula.

### Y el error de la lectura no se miraba

`profileRes.error` no se chequeaba en ningún lado, así que el fallo fue
**invisible durante 24 horas**. Es el mismo patrón de las 137 escrituras sin
chequear —supabase-js devuelve el error en `.error` y no lo lanza— pero en una
LECTURA, que es una superficie que ese inventario ni siquiera cuenta.

Ahora el perfil loguea con el `userId` y el mensaje. **Al tocar un select de una
pantalla que depende de una sola fila, chequear el `.error` no es opcional**: sin
eso, un fallo de consulta es indistinguible de un registro vacío.

### Pendiente de producto — el umbral de 50 misiones es inalcanzable

`configuracion.nivel_fotos_casual_a_activo` vale **50** en las dos bases (no el 20
que está como default en `lib/config.ts`). El nivel cuenta misiones aprobadas en
un mes calendario, y el mejor mes de cualquier gondolero fue **12 en prod y 20 en
dev**.

O sea que **activo no lo alcanza nadie**, ni por el nivel del mes ni por el
máximo. La primera campaña que se cree con `nivel_minimo = activo` no va a
admitir a nadie, y el gondolero va a ver "Requiere nivel Activo" sin ninguna vía
para conseguirlo. Hay que decidir el umbral antes de que exista esa campaña.

### Pendiente — cachear el máximo alcanzado si crece el volumen

`nivelMaximoAlcanzado` trae las misiones aprobadas de toda la vida del gondolero
y agrupa por mes en JS. Hoy son ~10 filas (prod tiene 137 misiones aprobadas EN
TOTAL entre 29 gondoleros), así que esperar a que haya un problema de performance
es lo correcto.

**La señal para volver**: lo que vuelve crece para siempre. Un Pro sostenido a 100
misiones por mes son 2.400 filas en dos años. Cuando moleste, las dos salidas son
`cache()` de React —por request, sin invalidación que mantener— o materializar la
agregación en una vista `niveles_por_mes` leída por PostgREST. Una vista sigue
siendo derivada: no guarda estado. No se hizo una RPC a propósito, porque la
regla quedaría escrita en dos lenguajes y porque el proyecto ya tiene tres casos
de código llamando a funciones que no existen en la base.

### Pendiente de producto — el incentivo por categoría debería ser pagar más, no restringir

Hoy el nivel funciona **quitando** acceso: una campaña con `nivel_minimo = 'pro'`
deja afuera a los Casual, y la transferencia bancaria es solo para Pro.

La idea a evaluar es al revés: que los niveles altos **cobren un porcentaje más
de puntos por la misma misión**. Los que más aportan a la comunidad ganan más por
el mismo trabajo, en vez de que los que menos aportan pierdan el acceso.

No está diseñado ni decidido. Lo que sí conviene saber es que las dos formas de
incentivo no son equivalentes: restringir reduce la oferta de gondoleros para una
campaña, y pagar más la aumenta.

### Campañas `tipo='comercios'` — cuatro roturas encadenadas (relevado 17/9/2026)

Relevado contra **prod en vivo** sobre la campaña `0ef27396` "Alta comercios zona
norte", con tres altas reales hechas a las 11:15, 11:16 y 11:16.

**1. La misión no se crea nunca.** No hay una sola línea en el repo que inserte
en `misiones` para una campaña de este tipo. Ni el alta (`crearComercioNuevo`),
ni la validación del comercio, ni la aprobación de la foto. No es un problema de
momento —"la misión llega cuando la distri valida"— porque no llega nunca.

No es el patrón de `resolverMisionDirecta`: ahí había una escritura que fallaba y
un `catch` que la tapaba. Acá **no hay escritura**. No aparece en ningún log
porque nada da error.

El comentario de `actions-comercios.ts` que dice *"Acá arriba se acaba de crear
una misión en 'pendiente'"* es falso: se escribió asumiendo una misión que ese
flujo nunca escribió, y el `sincronizarComerciosCompletados` de la línea
siguiente recalcula sobre una tabla que este camino no toca.

**Consecuencia:** `min_comercios_para_cobrar` cuenta comercios distintos con
misión **aprobada**. En una campaña de altas ese número no puede subir nunca. El
gondolero ve "1 de 3" para siempre, haga 3 altas o 300. El 1 es del seed.

**2. Sin foto de fachada, el alta no deja rastro cobrable.** El insert en `fotos`
está detrás de `if (bloqueId && params.fachadaUrl)`. Sin foto no hay fila, no hay
nada en ninguna cola de revisión, y cuando la distri valide el comercio el loop
de `bounty_estado='retenido'` no va a encontrar nada que pagar. El trabajo queda
invisible. Dos de las tres altas de prod están así.

**3. Con foto, se paga por el camino equivocado.** La fila de `fotos` sale con
`mision_id = null`, así que `aprobarFoto` toma la rama legacy y acredita al
instante, **salteándose `min_comercios_para_cobrar`**. En prod: crédito de 200 a
las 11:17:18, 31 s después del alta. Y `bounty_estado` queda en `'retenido'`
porque esa rama no lo limpia — así que el barrido de `cerrarCampana` lo va a
acreditar **otra vez** al cerrar. Doble pago latente.

**4. `puntos_por_foto` vs `puntos_por_mision`.** Esta campaña tiene
`puntos_por_foto = 0` y `puntos_por_mision = 200`. `aprobarFoto` tiene el
fallback de una a la otra; las dos actions de validación de comercio
(`aprobarComercio` y `aprobarComercioDistri`) leen **solo `puntos_por_foto`**.
Aunque mañana existiera la misión, ese camino seguiría pagando 0 acá.

### `comercios.validado` y `comercios.estado` — dos columnas para lo mismo

**La app tiene CUATRO escrituras de "validar un comercio" y solo dos escriben las
dos columnas.**

| Action | Pantalla | Escribe | Acredita bounty |
|---|---|---|---|
| `aprobarComercio` | `/admin/comercios/pendientes` | `estado` + `validado` | sí |
| `aprobarComercioDistri` | `/distribuidora/comercios/pendientes` | `estado` + `validado` | sí |
| `toggleValidarComercio` | `/admin/comercios` | **solo `validado`** | no |
| `validarComercio` | `/distribuidora/comercios` | **solo `validado`** | no |
| (auto por checks GPS) | `registrarChecksGPS` | `estado` + `validado` | no |

**Y las dos columnas alimentan pantallas distintas.** Las colas de pendientes
—`/admin/comercios/pendientes`, `/distribuidora/comercios/pendientes` y el badge
del layout de distribuidora— filtran por `estado='pendiente_validacion'`. Las
listas, los contadores del tablero y los dos toggles filtran por `validado`.

Así que un comercio "validado" desde la lista queda `validado=true` con
`estado='pendiente_validacion'`: aprobado en una pantalla, pendiente en la otra,
y con el bounty de su foto sin acreditar. **El 17/9/2026 pasó en prod con los
tres comercios de la campaña `0ef27396`** — `updated_at` a las 12:27, ningún
`movimientos_puntos` nuevo y el `bounty_estado` de la foto intacto, que es la
huella que distingue cuál de las cuatro actions corrió.

La trampa de navegación: `/admin/comercios` tiene un filtro llamado **"Sin
validar (N)"** con un botón **"Validar"**. Es una lista de pendientes que no es
*la* lista de pendientes, y el botón que parece el de aprobar es el que menos
hace.

Query para medir el desacuerdo:

```sql
SELECT estado, validado, count(*)
FROM comercios
GROUP BY estado, validado
ORDER BY count(*) DESC;

SELECT id, nombre, estado, validado, campana_id, updated_at
FROM comercios
WHERE (validado = true  AND estado <> 'activo')
   OR (validado = false AND estado =  'activo')
ORDER BY updated_at DESC;
```

Medido el 17/9/2026: **prod 4 en desacuerdo** (los tres de la campaña más
"Kiosco EN" del 11/9, que muestra que el toggle viene produciendo esto desde
antes), **dev 0**. Dev no lo tiene porque ahí nadie usó el toggle, no porque el
código sea distinto.

### La bandeja de comercios pendientes de la distri no mostró NUNCA un comercio

Reportado el 25/9/2026: un comercio en `pendiente_validacion`, con geocoding
resuelto, no aparecía en la bandeja de la distri.

**El alcance real es mucho mayor que el caso reportado.** Medido en las dos
bases antes de tocar nada:

```
                pendiente_validacion   los veía la distri   INVISIBLES
dev                     7                      0                7
producción              8                      0                8
```

**Cero visibles, en las dos.** No es que algunos se escapen: **esta pantalla no
mostró un solo comercio desde que existe.** El admin sí los ve —su consulta no
filtra por distri— así que el trabajo llegaba a alguien, pero no a quien el
flujo dice que tiene que validarlo.

#### La causa: una columna con dos significados

La bandeja filtraba por las CAMPAÑAS de la distri:

```ts
.eq('estado', 'pendiente_validacion').in('campana_id', campanaIds)
```

Y `campana_id` **solo lo escribe `crearComercioNuevo`**, el alta de una campaña
de altas. El alta oportunista —dar de alta un comercio para poder hacerle la
misión, que es el camino normal— **no lo escribe a propósito**: si lo hiciera, la
fachada se cobraría como unidad de pago (ver `fotoEsUnidadDePago`).

O sea que la columna hace dos trabajos —*"a qué campaña pertenece"* y *"esta
alta es una unidad de pago"*— y la bandeja leía la primera acepción mientras la
escritura respetaba la segunda. En producción, **95 de 98 comercios no tienen
`campana_id`**.

> **Y el permiso ya decía que sí.** `puedeTocar` tiene un
> `if (!comercio?.campana_id) return true` con el comentario *"lo cargó un
> gondolero desde la captura normal"*. Alguien previó exactamente este caso
> **para la acción y no para la lista**: la distri podía validarlo, solo que no
> podía verlo.

#### El criterio nuevo: por GONDOLERO

Los comercios cargados por gondoleros vinculados a esa distri, vía
`getGondolerosDeDistri`, que ya resuelve la pertenencia desde la tabla de
vínculos.

Se descartó **por geografía** —los de las localidades donde opera— por una razón
de oportunidad: `localidad_id` acaba de completarse en el tramo anterior y
todavía no tiene rodaje. No se decide un permiso con un dato que se terminó de
poblar ayer.

Y **sacar el filtro sin reemplazarlo** dejaría a toda distri viendo el padrón
pendiente entero, que es el problema ya anotado en "Toda distribuidora ve todos
los comercios del sistema".

**`incluyeHistorico = true`**: un comercio cargado por alguien que ya se
desvinculó sigue siendo trabajo de esa distri. Excluirlo haría que desvincular a
un gondolero **escondiera sus altas pendientes** — el mismo hueco silencioso por
otra puerta.

#### Un comercio le puede aparecer a DOS distris, y está bien

Un gondolero puede estar vinculado a varias a la vez —el Walled Garden protege
los datos de cada ejecutor, no la exclusividad de la persona— y cualquiera de
las dos puede validarlo. `validarComercioYCrearMision` es idempotente, así que
las dos aprobando no pagan dos veces.

**Pasa hoy en dev**: hay un comercio que ven Biomega y Distribuidora Del Valle.

#### El badge tenía la consulta COPIADA

`layout.tsx` repetía el mismo filtro por campañas. Las dos copias estaban de
acuerdo por casualidad —las dos mal—, que es el peor estado posible: el día que
alguien arreglara una, el badge diría 8 sobre una lista vacía y eso es **peor
que el bug original**, porque el usuario no puede reconciliarlo con nada.

El criterio vive ahora en `lib/comercios-pendientes-distri.ts` y lo usan los
dos. `probar-pendientes-distri.mts` tiene un control por distribuidora que
verifica que **el badge diga exactamente lo que muestra la lista**.

#### Medido después del arreglo

```
producción   Biomega ve los 8 · las otras 5 distris, 0 · sin dueño: 0
dev          Biomega 7 · Del Valle 1 (compartido) · sin dueño: 0
```

`scripts/probar-pendientes-distri.mts` es solo lectura y corre contra las dos
bases. **Llama a la misma función que corre en producción** en vez de
reimplementar el filtro — un control que replica lo que dice verificar se queda
verde el día que los dos se separan, y este proyecto ya lo pagó tres veces. Y
reproduce el criterio VIEJO al lado, para que la mejora sea un número y no una
afirmación.

### PENDIENTE de UX — aprobar la foto de fachada NO valida el comercio

En resultados de campaña aparecen las fotos de fachada para aprobar. Aprobarlas
acredita puntos, pero **deja el comercio en `pendiente_validacion`**: es otra
acción, en otra pantalla, con otro botón. Nada en pantalla dice que son dos
cosas, y las dos se llaman "aprobar".

Quien revisa cree que terminó. El comercio queda sin validar y —mientras siga
existiendo el bug de la misión— el gondolero igual no cobra lo que corresponde.

Es el mismo problema de fondo que las dos columnas: **"validar el comercio" está
repartido en cuatro botones de cuatro pantallas y ninguno dice qué mitad hace.**
Cualquier arreglo que toque solo una de las dos columnas va a reproducir esto.

### La misión del alta se crea al VALIDAR el comercio (17/9/2026)

Cierra los cuatro problemas de la sección anterior. La regla vive entera en
**`lib/validacion-comercio.ts`** y la usan los dos paneles de pendientes —admin y
distribuidora— que ahora son las **únicas** dos formas de validar un comercio.

**Qué pasa al aprobar un alta:**

1. `comercios` → `estado='activo'` **y** `validado=true`. Siempre las dos.
2. Se crea la misión: `estado='pendiente'`, `bounty_estado='retenido'`,
   `puntos_total` = `puntos_por_mision ?? puntos_por_foto` (el fallback que las
   dos actions no tenían: la campaña de prod tiene `puntos_por_foto=0` y
   `puntos_por_mision=200`, así que pagaban cero).
3. La foto de fachada se cierra (`estado='aprobada'`, `bounty_estado='acreditado'`)
   pero NO se cuelga de la misión — ver la sección propia más abajo. Deja de ser
   una unidad de pago suelta: si quedaba en `'retenido'`, el barrido de
   `cerrarCampana` la pagaba otra vez.
4. `aprobarMisionCore` — **el mismo camino que toda otra misión**. Por eso el
   bounty se libera con la misma regla y el mínimo cuenta igual. Una segunda
   contabilidad para esta campaña habría sido otra regla duplicada.
5. Notificación `comercio_validado` al gondolero.

**Por qué al validar y no al dar de alta:** un comercio sin validar puede ser un
duplicado, estar mal cargado o no existir. Crear la misión en el alta sería
prometer un pago sobre trabajo que todavía nadie miró.

**Idempotencia:** si el comercio ya tiene una misión viva en esa campaña no se
crea otra, y si ya está `'aprobada'` la función corta sin pagar. Dos clicks, o el
admin y la distri aprobando lo mismo, no pagan dos veces.

**La foto de fachada ya no se paga sola.** `fotoEsUnidadDePago()` corta la rama
legacy de `aprobarFoto` —la que acredita cualquier foto sin `mision_id`— cuando
la campaña es `tipo='comercios'`. Está aplicada en los **tres** paneles de
revisión (admin, distribuidora, marca). Sin esto la fachada cobraba al instante
salteándose el mínimo, que es lo que pasó en prod el 17/9.

### El rechazo de un alta avisa, y no se puede rechazar sin motivo

`comercios.motivo_rechazo` es nueva (migración `20260917200000`), y el motivo es
**obligatorio**: el botón de confirmar queda deshabilitado hasta que haya uno,
igual que en el rechazo de foto.

Los motivos son **tipificados** (`lib/motivos-rechazo-comercio.ts`) y no solo
texto libre, porque cada uno manda al gondolero a hacer algo distinto. El molde
de la foto no servía tal cual: una foto rechazada se rehace y el mensaje se lo
dice; **un alta duplicada no se rehace**, y mandarlo a repetirla es mandarlo a
que se la rechacen de nuevo. Por eso cada motivo lleva pegado su "qué hacer
ahora" — con "Ya estaba cargado" el gondolero no perdió la campaña: puede hacer
la misión sobre el comercio que ya existe, y eso es lo único que necesita saber.

El rechazo también deja la misión en `'descartada'` + `'anulado'` si ya existía.
Una misión `'pendiente'` que nadie va a revisar nunca es el patrón de las
misiones trabadas.

**Y el aviso de aprobación salió en el mismo tramo.** `comercio_validado` estaba
en el CHECK desde abril y **nadie lo emitía**: el gondolero daba de alta y no se
enteraba de nada. Los dos van juntos a propósito — si solo se avisa el rechazo,
el silencio pasa a significar "todavía no te aprobaron" en vez de "salió bien".

### Las dos acciones muertas de validar comercio — borradas (17/9/2026)

`toggleValidarComercio` (`/admin/comercios`) y `validarComercio`
(`/distribuidora/comercios`) escribían **solo `validado`**: dejaban el comercio
aprobado en una pantalla y pendiente en la otra, sin activar nada y sin pagar.
Se borraron junto con sus dos botones; los archivos quedan con un comentario
explicando por qué.

**Lo que las hacía peligrosas no era existir, era ser el camino por defecto.** El
tablero de admin contaba los pendientes con `.eq('validado', false)` y linkeaba a
`/admin/comercios` en los tres lugares donde hablaba de validar. Nada linkeaba a
la cola de verdad. Los tres links —y el equivalente del dashboard de
distribuidora— ahora van a `/…/comercios/pendientes`. El KPI "Comercios
validados" sigue apuntando a la lista, que es lo que corresponde: es un número,
no una acción.

Las listas conservan el estado "Sin validar" pero con un link **"Revisar"** en
lugar de un botón: mirar y decidir son pantallas distintas.

`comercios.validado` **sigue teniendo seis lecturas** (las dos listas, los dos
tableros, el detalle de la distri y el badge de la captura), así que no es un
`DROP` — se va con el tramo de columnas muertas, moviendo esas seis a `estado`.

### La foto de fachada no cuelga de la misión — y qué queda pendiente por eso

Al validar un alta, la fachada se cierra (`estado='aprobada'`,
`bounty_estado='acreditado'`) pero **se deja con `mision_id = null` a propósito**.

La fachada es evidencia **del comercio**, no de la misión: quien la mira está
decidiendo si el comercio existe y está bien cargado, que es exactamente lo que
se decide al validar. Colgarla de la misión la metería en el conteo de
`actualizarEstadoMision` y habría que aprobarla una segunda vez, en otra
pantalla, para cerrar algo que ya está cerrado.

El `bounty_estado='acreditado'` no es decorativo: si quedaba en `'retenido'`, el
barrido de `cerrarCampana` —que paga toda foto retenida sin mirar misiones— la
pagaba otra vez al cerrar la campaña.

**PENDIENTE — la fachada queda fuera del dashboard de la campaña.** Todo lo que
ese panel arma sale de las misiones y sus fotos, y la fachada no tiene
`mision_id`. Cuando se haga el panel de resultados de una campaña de comercios
hay que decidir si se muestra y desde dónde: la vía natural es
`fotos.comercio_id` + `campana_id`, sin pasar por misiones.

### El cupo en campañas de altas contaba cero (arreglado 17/9/2026)

`max_comercios_por_gondolero` se mide contando comercios con misión viva del
gondolero. En una campaña de altas **la misión no existe hasta que alguien valida
el comercio**, así que `misComercios` daba siempre vacío y el cupo no frenaba
nada: con tope 20 se podían cargar 60 altas, y el tope recién aparecía cuando la
distribuidora validaba — o sea **después** de que el gondolero hizo el trabajo.
Rechazo tardío del peor tipo.

Arreglado sumando las altas propias no rechazadas a `misComercios` en
`obtenerEstadoComercios`. **No es un contador nuevo**: alimenta el
`cupoPropioLleno` que ya existía, que es el que la pantalla consulta para
esconder el botón de comercio nuevo. Una sola regla de cupo.

Y ahora también se chequea **en el servidor**, dentro de `crearComercioNuevo`,
como hace `registrarMision`. El cálculo de los dos lados es el mismo a propósito:
si difirieran, la pantalla diría una cosa y el servidor otra.

Una alta **rechazada no ocupa cupo**. El gondolero no se queda sin lugar por un
comercio que no le sirvió a nadie.

### Un comercio rechazado se guarda, pero no se ofrece más

**No se borra.** Borrarlo perdería `registrado_por`, el motivo y el rastro de que
alguien fue hasta ahí, y `fotos.comercio_id` lo referencia. Queda con
`estado='rechazado'` y su `motivo_rechazo`.

Lo que sí cambió el 17/9/2026 es que **deja de aparecer**. Hasta entonces ninguna
de las tres consultas filtraba por estado, así que un comercio rechazado por "no
existe" seguía ofreciéndose a todos los gondoleros: alguien lo elegía, hacía la
misión, y quedaba una misión sobre un comercio que la distribuidora ya había
dicho que no existía. Ahora se excluye de:

- la lista de comercios de la captura (y del caché de IDB)
- la búsqueda de cercanos
- los candidatos a duplicado de `crearComercioNuevo` — si no, el alta legítima
  que reemplaza a una rechazada salía marcada como duplicado de la fila que
  justamente se descartó

**Los tres filtros van en JS, no con `.neq()`**: `comercios.estado` es nullable
(`DEFAULT 'activo'` sin `NOT NULL`, y el CHECK deja pasar NULL), y PostgREST
descartaría también las filas con NULL por lógica de tres valores. Hoy no hay
ninguna en dev ni en prod, pero el día que aparezca el comercio se volvería
invisible sin que nadie se entere. Mismo razonamiento que en
`obtenerEstadoComercios` y `comercios-relevados`.

En el caché de IDB viejo el campo no existe, y `undefined !== 'rechazado'` lo
deja pasar: un comercio guardado antes del cambio no se esconde.

### Un alta se paga una sola vez — `fotoEsUnidadDePago` (17/9/2026)

Hay **dos cosas distintas** y las dos tienen razón de existir:

| | Qué es | Quién paga |
|---|---|---|
| **Alta oportunista** | El gondolero va a relevar, el comercio no está en la base, lo carga para poder hacer su misión. Es un **medio**. | El relevamiento. El alta no paga aparte. |
| **Campaña de altas** (`tipo='comercios'`) | El trabajo **es** cargar el comercio. | La **misión** que crea la validación. |

La oportunista ya estaba bien por construcción: `crearComercioParaCaptura` no
escribe `campana_id` ni crea fila en `fotos`, así que no hay nada que pueda
cobrar por su cuenta.

Lo que faltaba era que **ningún camino pague una foto que no es unidad de pago**.
Eso es `fotoEsUnidadDePago()` en `lib/validacion-comercio.ts`, y es una regla
**del lector** —igual que el filtro `estado='aprobada'` de `aprobarMisionCore`—:
no depende de que cada camino que paga se acuerde de anular el bounty en el
origen, que es la defensa que ya nos falló.

Una foto NO es unidad de pago si **tiene `mision_id`** (la paga la misión) o si
es de una campaña **`tipo='comercios'`** (la paga la validación del comercio).

**Los cuatro lugares que pagan desde `fotos` la consultan:** los tres paneles de
revisión (admin, distribuidora, marca) y el barrido de `cerrarCampana`.

**Por qué NO un gate en `registrarMision`.** Sería una quinta copia de la regla
para un caso que ya está cerrado dos veces: la UI de captura manda el comercio
existente a una pantalla sin salida en campañas de altas, y el índice
`misiones_campana_comercio_uniq` —activo porque una campaña de altas es
`modalidad='puntual'`— impide que haya dos misiones vivas sobre el mismo comercio
en la misma campaña, vengan de donde vengan. Un gate ahí además rechazaría
**después** de que el gondolero hizo el trabajo.

**El que sí estaba abierto era el cierre de campaña.** `cerrarCampana` paga desde
`fotos` ignorando las misiones: si la campaña cerraba con altas sin validar, les
pagaba la fachada sin validación — y si después alguien validaba el comercio, la
misión la pagaba **otra vez**. Validar después del cierre no es un caso raro: la
cola de pendientes no filtra por estado de campaña.

### `incrementar_puntos` tampoco existe — y era un doble pago armado

`cerrarCampana` llamaba a `admin.rpc('incrementar_puntos', …)` **además** del
insert en `movimientos_puntos`, o sea sumaba los mismos puntos dos veces. No
pasaba porque **la función no existe**: verificado en dev el 17/9/2026 (PGRST202)
y no está en ninguna migración. La llamada venía fallando en silencio desde
siempre — tercer caso del mismo patrón, después de `incrementar_fotos_aprobadas`.

Se **sacó** en vez de dejarla con un comentario: si alguien crea esa función
algún día pensando que falta, cada cierre de campaña pasa a pagar el doble sin
que nadie toque este archivo. El único escritor de `profiles.puntos_disponibles`
es el trigger `on_movimiento_puntos`.

### El editor sabe qué es una campaña de altas (17/9/2026)

`lib/campana-altas.ts` es la única definición. Antes el tipo `comercios` era un
string que se escribía en la columna y nada más: **ningún editor sabía qué era**,
así que había que agregarle un campo al bloque —los tres exigen al menos uno— y
ese campo no se muestra nunca. En dev quedó la prueba: la campaña sembrada tiene
un campo que dice *"Fotografiá la góndola"* en una campaña donde no hay góndola.

Qué cambia cuando el tipo es `comercios`:

| | Campaña normal | Campaña de altas |
|---|---|---|
| Campos del bloque | al menos uno | **ninguno** (`validarBloqueCampana`) |
| Bloque | sí | **sí** — `crearComercioNuevo` lo busca por `campana_id` para colgar la fachada |
| Precio al gondolero | opcional | no se ofrece |
| Modalidad | puntual o seguimiento | **puntual** forzada |
| Foto de fachada | opcional | **obligatoria** |

**Quién crea qué** (`TIPOS_POR_PANEL`): admin todos menos `interna`;
distribuidora `interna` y `comercios`; **marca NO crea altas**. Una marca quiere
relevar sus góndolas, no poblar el mapa: el alta de comercios es infraestructura
del canal y la pagan quienes se benefician del mapa, GondolApp y las
distribuidoras. La action de marca además valida el tipo contra esa lista — el
selector ya no lo ofrece, y eso cierra la puerta de atrás del POST.

**El panel de distribuidora ganó selector de tipo.** Escribía `tipo: 'interna'`
fijo, así que quien más necesita las campañas de altas era el único que no podía
crearlas. Va en el mismo formulario, no en uno nuevo.

### La foto de fachada es obligatoria en campañas de altas, opcional en el alta oportunista

Es la única evidencia de que el comercio existe. Sin foto el alta es una fila que
nadie puede verificar, y hay puntos de por medio: quien valida decidiría "este
comercio existe" mirando un nombre, una dirección y un punto de GPS que eligió el
mismo que cobra. Con plata al otro lado, eso se abusa solo.

**En el alta oportunista se queda opcional.** Ahí el gondolero no cobra por el
alta —la paga el relevamiento que ya está haciendo— así que exigírsela es
fricción sobre una misión en curso, sin nada que proteger.

En la pantalla, el botón "Omitir por ahora" **no se renderiza** en una campaña de
altas, y `crearComercioNuevo` lo chequea igual en el servidor
(`requiereFotoFachada`): la pantalla puede eludirse y ésta es la puerta que
decide si se paga.

> **Ojo con el orden de las declaraciones en `captura/page.tsx`.** Los pasos
> `comercios-*` hacen `return` mucho antes del final del componente, así que un
> `const` declarado abajo y leído ahí tira **ReferenceError** por zona muerta
> temporal — no da `undefined`. `esCampanaComercio` se subió arriba de los
> `return` por eso.

### El bloque se valida ANTES de insertar la campaña

Los tres editores chequeaban los campos **después** del insert de `campanas`. Si
el chequeo fallaba, quedaba una campaña huérfana —creada, sin bloque y sin forma
de completarla desde el editor— y encima el usuario veía un error y creía que no
se había creado nada.

Ahora el orden es: parsear campos → validar → insertar campaña → insertar bloque.
`parsearCamposBloque` es compartida y, a diferencia de las tres copias que
reemplaza, **no se traga el error de parseo**: un JSON inválido devolvía `[]` y
el usuario leía "el bloque debe tener al menos un campo" después de cargar cinco.

### 'completada' es alcanzar el MÁXIMO, no el mínimo (17/9/2026)

**El mínimo es el piso para COBRAR, no el techo del trabajo.** Hasta el
17/9/2026 `sincronizarComerciosCompletados` flipeaba la participación a
`'completada'` con `total >= min_comercios_para_cobrar`, y el gate del alta
exigía `'activa'`: con mínimo 2 y máximo 20, el gondolero cruzaba el 2 y recibía
*"No tenés una participación activa en esta campaña"* con **18 comercios de cupo
libre**. Reproducido en dev.

Ahora flipea con `tomados >= max_comercios_por_gondolero`. Sigue sin reabrirse si
el número baja: quitarle a alguien un estado que ya vio en pantalla es peor que
dejarlo puesto.

**Cuando la campaña cierra, la participación queda en `'activa'`.** El gate de
campaña cerrada ya frena el trabajo por otro lado. Un estado propio —que
distinga "terminó el trabajo" de "se quedó sin tiempo"— necesita agregar
`'cerrada'` al CHECK de `participaciones.estado`, algo que lo escriba al cerrar y
que los lectores lo entiendan; anotado, no hecho.

**El alcance de lo que estaba roto era más chico de lo que parecía, y por
accidente:** el flip a `'completada'` lo dispara `aprobarFoto` de distribuidora y
de marca, o sea CUALQUIER campaña; pero el único gate que bloqueaba trabajo era
`crearComercioNuevo`, así que solo mordía en campañas de altas. `registrarMision`
no mira `participaciones` en absoluto. Medido el 17/9: prod 9 'completada' (todas
del seed) y **7 participaciones activas que ya cruzaron el mínimo** — iban a
flipear con la próxima foto aprobada, y el día que alguien agregara un gate que
mirara `'activa'` se caían las siete juntas.

> `admin/fotos/actions.ts` **no** llama a `sincronizarComerciosCompletados`.
> Tres paneles aprueban fotos y solo dos sincronizan. Sin arreglar.

### Dos números parecidos que no son el mismo: TOMADOS y APROBADOS

| | Qué cuenta | Para qué |
|---|---|---|
| **Tomados** | Misiones vivas (≠ `'descartada'`) **+** altas propias no rechazadas | `max_comercios_por_gondolero` — el cupo |
| **Aprobados** | Comercios distintos con misión `'aprobada'` | `min_comercios_para_cobrar` — el pago |

Tomados ≥ aprobados, siempre. **Un comercio pendiente de aprobación ya ocupa
lugar** —nadie más lo puede relevar— pero todavía no se cobra.

La regla de TOMADOS vive en `comerciosTomadosPorGondolero()`
(`lib/comercios-relevados.ts`) y la usan los tres lugares que la necesitan: la
pantalla (vía `obtenerEstadoComercios` → `cupoPropioLleno`), el chequeo de
servidor de `crearComercioNuevo`, y el flip de la participación. Estaba escrita
tres veces y **la tercera usaba el criterio de la otra pregunta**.

**PENDIENTE — renombrar `participaciones.comercios_completados`.** El nombre no
dice cuál de los dos números es (cuenta APROBADOS) y encima suena a "completó la
campaña", que es justo lo que ya no significa. Son **37 referencias en 14
archivos**, más migración y regenerar `types/database.ts`: es un tramo propio.
Mientras tanto, `lib/puntos-retenidos.ts` sigue sin usarla —cuenta sobre
`misiones`— porque un número que promete plata no puede salir de una columna que
puede estar vieja.

### El alta ya no exige participación activa

`crearComercioNuevo` chequeaba `participaciones.estado = 'activa'` y era el único
control de campaña que tenía. La regla correcta es **si puede ver la campaña y
tiene cupo, puede cargar**: el estado de la participación describe cómo le fue,
no si puede trabajar.

En su lugar se chequea lo mismo que chequea `registrarMision`: que la campaña
exista, esté `'activa'` y no esté vencida (`puedeRegistrarMision`). Sacar el gate
sin poner esto habría dejado el alta **sin ningún control de campaña**.

Y como la fila de participación ya no está garantizada por el gate, el alta la
crea si falta: `sincronizarComerciosCompletados` hace un UPDATE, y sobre cero
filas no escribe nada ni se queja. **No bloquear no puede significar dejar el
trabajo sin registrar en el panel de la distribuidora.**

### Pendiente — `unirse` resetea `puntos_acumulados`, que no se recalcula

`unirse` y `soloUnirse` reactivan con `comercios_completados: 0,
puntos_acumulados: 0, joined_at: now()`. El primero se recupera en el próximo
sync porque se recalcula; **`puntos_acumulados` es un acumulador leído-y-escrito**
en `aprobarFoto` y no vuelve. En prod hay filas con 1200, 900 y 800 puntos ahí.

Hoy solo se alcanza desde `'abandonada'` —con `'completada'`, `yaUnido` da true y
la pantalla no ofrece volver a unirse— así que la ventana es chica. Y en la misma
función, el acumulador suma `campana.puntos_por_foto` **sin el fallback a
`puntos_por_mision`**: en una campaña de altas suma cero. Mismo error que ya se
corrigió en las dos actions de validación de comercio.

### Puntos en camino — el tercer caso: esperando VALIDACIÓN (17/9/2026)

El bloque contaba misiones, y en una campaña de altas **la misión no existe hasta
que la distribuidora valida el comercio**. Resultado: el gondolero cargaba tres
comercios, su saldo no se movía, el bloque no mostraba nada, y los puntos
aparecían de golpe días después. Trabajo entregado e invisible — el mismo caso
que las fotos en revisión, que sí se mostraban.

Ahora `obtenerPuntosRetenidos` hace una segunda consulta sobre `comercios`
(`registrado_por = él`, `estado = 'pendiente_validacion'`, campaña
`tipo='comercios'`) y los valúa con `puntosDeLaCampana`. Va en la misma función y
no en un helper aparte porque **el número tiene que entrar al mismo cálculo de
"cuánto falta para el mínimo"**: un comercio cargado cuenta cuando lo validen,
igual que una foto cuenta cuando la aprueben. Entra a `enRevision`, así que
alimenta `faltan` y `enRevisionAlcanza` sin ramificar nada.

Una campaña de altas sin ninguna misión todavía no estaba en el mapa por
campaña, así que las altas también **crean su entrada**.

**VALIDAR NO ES APROBAR, y el texto lo dice.** Son dos actos distintos, en dos
pantallas distintas, y los hace otra persona: una foto la APRUEBA quien revisa el
trabajo; un comercio nuevo lo VALIDA quien decide si ese punto de venta existe y
sirve. Mandarlo a esperar una aprobación cuando lo que espera es una validación
lo manda a buscar algo que no va a encontrar.

| Situación | Frase |
|---|---|
| Solo altas pendientes | "Esperando que validen los comercios que cargaste." |
| Altas + fotos | "Esperando revisión." / "N comercios esperan validación." |
| Falta para el mínimo, y lo pendiente son altas | "Tenés N comercios cargados que cuentan cuando los validen." |

`puntosDeLaCampana` se mudó de `lib/validacion-comercio.ts` a
`lib/campana-altas.ts`: lo necesitan la validación (servidor, service role) y el
bloque de puntos, y ese último no tiene que arrastrar el módulo de servidor.
`campana-altas.ts` solo importa `@/types`.

### La fachada se guarda como STORAGE PATH, nunca como URL (resuelto 17/9/2026)

Era el bug de los thumbs. `comercios.foto_fachada_url` tenía **dos formatos**
según por dónde entró el comercio: `crearComercioNuevo` guardaba el storage path
y `crearComercioParaCaptura` la URL pública completa. Las cinco pantallas hacen
`createSignedUrl(valor)`, o sea que **asumen un path**: con una URL adentro, el
"path" que le llega a Storage es `https:/proyecto.supabase.co/...`, no existe
ningún objeto así, la firma falla y el thumb queda roto.

**El formato nuevo era el correcto y el viejo el roto** —al revés de lo que
parecía—. Medido en dev el 17/9: las 3 filas con URL fallan al firmar, las 4 con
path firman bien, y los archivos de las 7 existen.

**Por qué gana el path**, en orden de peso:

1. **Los dos buckets son PRIVADOS** (`fotos-gondola` y `fotos-fachada`). La URL
   guardada es `/object/public/…`, que en un bucket privado no sirve para nada.
   No era una preferencia de formato: la URL era **dato malo** desde el día uno.
2. **La URL lleva el dominio del proyecto adentro.** Un dump de dev restaurado en
   prod —o al revés— deja filas apuntando al storage del otro ambiente. Un path
   es relativo al bucket del cliente que firma: siempre resuelve contra el
   ambiente donde corre.
3. El código ya esperaba un path en los cinco lugares, y `fotos.storage_path` ya
   establecía la convención.

El costo es resolver al leer, y se paga una sola vez en
**`lib/storage-fotos.ts`**: `pathDeFachada()` normaliza las tres formas que
existen —path, URL de Supabase, URL ajena— y `firmarFachadas()` / `firmarFachada()`
devuelven lo mostrable. Las cinco pantallas pasan por ahí; antes cada una repetía
el mismo `Promise.all` con el mismo `3600`, y **las cinco tenían el mismo bug**.

Datos migrados con `20260918100000_fachada_un_solo_formato.sql`. El `substring`
no toca las URLs que no son de nuestro storage: `pathDeFachada` las reconoce como
ajenas y las muestra tal cual, que es mejor que convertirlas a un path inventado.

**Sigue pendiente lo del aspect ratio**, que es otro problema y no éste: la foto
sale de la cámara en vertical y los thumbs son cuadrados, así que un recorte
centrado puede estar cortando el cartel del comercio — lo único que hace útil a
esa foto.

### `fotos.url` tiene la misma bomba, pero dormida

`fotos` tiene **dos** columnas: `storage_path` (100% paths, en dev y en prod) y
`url`, que es un cajón mezclado:

| `fotos.url` | Prod | Dev |
|---|---|---|
| URL de Drive | 112 | 112 |
| URL de picsum | 73 | 73 |
| **URL de Supabase (con el dominio adentro)** | **8** | **67** |

**El diseño ya es correcto y por eso no urge:** los cinco lugares que muestran
fotos de góndola firman `storage_path` y usan `url` **solo como fallback**
(`signedUrl ?? f.url`). Las filas de Drive y picsum son del seed y no tienen
objeto en Storage: para ésas el fallback es lo único que hay, y por eso la
columna no se puede borrar sin más.

Las 8 de prod y 67 de dev con dominio de Supabase **sí son la bomba**: si un dump
cruza de ambiente, apuntan al storage del otro. Hoy no se nota porque esas filas
tienen un `storage_path` válido y el fallback nunca se dispara.

**Las dos pantallas de repositora que no firmaban — arregladas el 17/9/2026.**
`/repositora/dashboard` y `/repositora/gondolas` mostraban `f.url` crudo y ni
siquiera pedían `storage_path` en el select. Ahora pasan por `firmarFotos()`.

**CORRECCIÓN a lo que dije antes: NO estaban rotas en producción.** Medido
después: las 25 fotos de fixers de prod —y las 25 de dev— tienen `url` de Drive o
picsum, y su `storage_path` **no resuelve** (son filas del seed, sin objeto en
Storage). O sea que el camino crudo funcionaba por casualidad, porque ninguna foto
de fixer vive todavía en Storage.

El arreglo vale igual, y el orden del helper es lo que lo hace seguro: **firma
primero, `url` después**. Para esas 25 el firmado falla, cae al fallback y se ven
igual que antes; para la primera foto real que suba un fixer, se firma y se ve —
que es lo que hoy no pasaría.

**PENDIENTE — vaciar `fotos.url` donde haya `storage_path`.** El fallback no
aporta nada en esas filas y es donde vive el dominio del proyecto. Dejarla solo
para las de Drive y picsum, que son las únicas que la necesitan. Tramo propio:
hay que verificar fila por fila que el `storage_path` resuelva **antes** de
borrar la url, porque las 25 de arriba son la prueba de que tener `storage_path`
no garantiza que el objeto exista.

---

## Próximos tramos (anotado el 21/9/2026, sin empezar)

### 1. Prefijo `FXR` para los fixers — ✅ HECHO el 22/9/2026

Al unificar el generador el 16/9 el prefijo quedó fijo en `GND` para los dos,
con el argumento de que las tres búsquedas por código filtran por `tipo_actor` y
no por prefijo. El argumento era cierto y era insuficiente: **el prefijo no
discrimina para el código, discrimina para la PERSONA.** El código se dicta por
teléfono y la distribuidora que lo anota no tenía forma de saber si invita a un
gondolero o a un fixer, que no hacen lo mismo.

**Lo que hizo que no fuera un tramo de una línea: nadie mantenía la
correspondencia entre el prefijo y el tipo.** Ningún fixer nace fixer — el
registro público ofrece solo gondolero, distribuidora y marca, y
`handle_new_user()` fuerza `tipo_actor='gondolero'` para cualquier alta. Los 14
fixers llegaron a serlo por un UPDATE del panel admin, y hay **dos** caminos:

| | Qué hacía con el código |
|---|---|
| `crearUsuario` | lo ponía en `null` si el tipo nuevo era una empresa |
| `cambiarTipoActor` | **nada, nunca** |

O sea que un gondolero convertido en marca se quedaba con su GND y seguía
apareciendo en las búsquedas por código de los paneles de vinculación. **Ese bug
ya estaba, sin prefijos de por medio.**

Por eso la regla vive en un TRIGGER (`profiles_sincronizar_codigo`, migración
`20260923100000`) y no en cada escritor:

> el prefijo coincide con el `tipo_actor`, y las empresas no tienen código

Dos decisiones del trigger que conviene no revertir:

1. **Es `BEFORE UPDATE OF tipo_actor`, no `INSERT`.** El único camino que
   inserta un profile es `handle_new_user()`, que ya pone el código con su
   reintento contra el UNIQUE — un mecanismo cuyo fallo significa que una
   persona no puede entrar a la app y no vuelve. Y no hace falta: al registrarse
   nadie es fixer.
2. **La guarda "ya tiene el prefijo que le corresponde → no se toca".**
   `UPDATE OF tipo_actor` se dispara cuando la columna está en el `SET` **aunque
   el valor no cambie**, así que sin eso un cambio de tipo que no cambia nada le
   rotaría el código a alguien que ya lo dictó por teléfono.

**El `WHILE EXISTS` tiene ventana y se aceptó.** El reintento del alta no la
tiene —pide, choca contra el UNIQUE, reintenta— pero en un `BEFORE UPDATE` la
violación se levanta después del trigger. Con 8^8 combinaciones y 29 filas es
irrelevante, y si alguna vez chocara el UNIQUE hace fallar el UPDATE de forma
ruidosa en vez de escribir un duplicado.

**El backfill tuvo que volverse sensible al tipo.** Con `^(GND|FXR)-…` un fixer
con GND **matchea** y queda excluido para siempre, o sea que la función que tenía
que migrar a los 14 no los habría visto. La condición es "el prefijo que le
corresponde a SU `tipo_actor`", y eso es lo que al mismo tiempo la deja
idempotente.

**Corrido el 22/9/2026 en dev y prod: 6 y 8 asignados, cero fallidos.**

#### La corrección sobre el DROP, que vale más que el tramo

Dije que sin el `DROP FUNCTION` el registro público se rompía entero, porque
medí `42725: function generar_codigo_gondolero() is not unique`. **Era falso
para la migración como quedó**, y lo descubrí yendo a probarlo.

El 42725 salía porque en ese experimento el parámetro tenía
`DEFAULT 'gondolero'`. Sin `DEFAULT` —que es como quedó, obligatorio a
propósito— no hay ambigüedad ninguna: `f()` resuelve a la vieja y `f(text)` a la
nueva, y nada falla.

Lo cual es **peor**: sin el DROP sobrevive un generador que devuelve GND pase lo
que pase, listo para que alguien lo llame y le ponga prefijo de gondolero a un
fixer, en silencio. El DROP va igual, pero por el argumento de `unirseACampana` y
`formatearFecha` —lo que todavía compila es lo que alguien va a usar— y no por
una rotura ruidosa que no existe.

#### El formato está escrito dos veces, en dos lenguajes

El regex de `backfill_codigos_gondolero()` y el de `lib/codigo-gondolero.ts`
describen lo mismo. **Si cambia uno, cambia el otro**, y el modo de falla no es
que algo explote: es que el contador de "códigos pendientes" de
`/admin/usuarios` nunca llegue a cero mientras el botón dice que ya está todo
asignado. El `COMMENT` de la función SQL apunta a ese archivo para que quien lea
desde la base también lo vea.

Por eso `tieneCodigoVigente(codigo, tipo)` pide el tipo **obligatorio**: con un
default, el contador daría por bueno el GND de un fixer.

#### La normalización del código tipeado

Las tres búsquedas hacían `.eq('codigo_gondolero', codigo.toUpperCase())`, o sea
match exacto sobre lo que la persona escribió. **Un código dictado por teléfono
se tipea como viene**: sin guiones, con espacios, en minúscula, con un espacio
pegado de un copiar-pegar. Las cuatro formas devolvían *"Código no encontrado.
Verificá que sea correcto."* sobre un código que era correcto — el peor mensaje
posible, porque manda a buscar un error que no está.

`normalizarCodigo` saca todo lo que no sea letra o dígito y rearma los guiones.
**Lo que no hace es adivinar**: un texto que no tenga tres letras y ocho dígitos
sale como se pueda y lo rechaza el validador. Normalizar no es corregir.

#### Lo que el prefijo agregó a las búsquedas, que no es el mensaje

Las tres **ya daban** el mensaje cruzado ("Este código pertenece a un
Gondolero…"). Lo que agrega el prefijo es **cuándo se puede dar**: antes salía
solo si el código EXISTÍA en la base, así que un GND mal tipeado o de otro
ambiente caía en "no encontrado", indistinguible de un typo. Ahora se rechaza
antes de consultar, exista o no.

La sugerencia de a dónde ir la pone cada pantalla y no el helper, porque **no es
la misma**: el panel de distribuidora tiene las dos secciones; el de repositora
solo tiene fixers, y mandarla a "la sección Gondoleros" sería mandarla a una
pantalla que no existe.

El chequeo de `tipo_actor` contra la base **se quedó** después del rechazo por
prefijo: es el que decide, y el prefijo es una convención.

#### Las dos escrituras que no chequeaban el error

`crearUsuario` y `cambiarTipoActor` hacían `await admin.from('profiles').update(…)`
pelado — dos de las 137. Ahora devuelven `{ error }` y los llamadores lo miran.

Importa más desde este tramo: un fallo silencioso ahí dejaba al usuario con el
tipo VIEJO y al admin viendo *"Rol cambiado a marca"*; ahora arrastra además el
código, porque el trigger tampoco llegó a correr.

**`cambiar-rol-btn.tsx` se borró el 22/9/2026.** No lo montaba nadie —
verificado con grep sobre el repo entero, la única mención era su propia
declaración— y era una segunda copia del cambio de rol, la que además se tragaba
el error entero. El que se usa está en `acciones-usuario.tsx`.

`docs/AUDITORIA-2026-09.md:880` ya lo había marcado como "posible código muerto"
en septiembre, y el propio archivo decía *"componente legacy — la funcionalidad
se migró a AccionesUsuario"*. **Estuvo así meses**, que es exactamente lo que lo
hacía peligroso: una copia muerta con la acción adentro es la que alguien va a
"arreglar" algún día creyendo que es la que corre. Mismo caso que
`unirseACampana` y que los dos formateadores sin zona de `lib/utils.ts`.

**Probado:** `scripts/probar-migracion-fxr.mjs` (28 casos, aplica la migración en
una transacción y termina con ROLLBACK; cubre el registro público por el camino
real, las cinco transiciones de tipo, la no-rotación y la idempotencia del
backfill) y `scripts/probar-codigo-actor.ts` (33 casos de formato, normalización
y rechazo por prefijo).

> El dry-run saca el `BEGIN;`/`COMMIT;` del archivo y **aborta si no puede**: ese
> `COMMIT` cerraría su transacción y escribiría sobre dev. Un reemplazo que no
> matchea sería un borrado silencioso con daño real.

### 2. Postulación de fixers a campañas — ✅ HECHA el 22/9/2026, en seis etapas

**El problema.** Un fixer no trabaja libre —toca la góndola, arma exhibidores,
repone producto ajeno, y alguien tiene que responder por quién entra al
comercio— pero tampoco debería depender de que lo inviten primero para poder
ofrecerse.

**El modelo, ya definido:**

1. La campaña se marca como **abierta a postulaciones** (flag nuevo en
   `campanas`).
2. Un fixer **sin vínculo** la ve como oferta, con botón "Postularme".
3. El botón crea la solicitud con `iniciado_por = 'fixer'`.
4. **Aprueba QUIEN EJECUTA la campaña, no quien la financia.** Si la crea la
   marca y la ejecuta una distribuidora o una repositora, aprueba el ejecutor.
5. Recién con la solicitud aprobada participa.

**Lo que ya está:** las dos tablas de solicitudes aceptan `iniciado_por='fixer'`
por CHECK, y `lib/acceso-campana.ts` ya distingue al ejecutor —`distri_id` o
`repositora_id`— del financiador, que es justo la distinción que el punto 4
necesita.

**Lo que falta:** el flag en `campanas`, la pantalla de ofertas para el fixer sin
vínculo, el botón, y el camino de aprobación del lado del ejecutor.

**A definir antes de escribir**, porque cambia el modelo de datos:

- Una campaña abierta a postulaciones con `repositora_id` **y** `marca_id`: ¿la
  postulación se hace a la repositora (vínculo duradero, sirve para sus próximas
  campañas) o a la campaña (vínculo de una vez)? Las tablas de hoy son
  `fixer_repo_solicitudes` y `fixer_distri_solicitudes`, o sea vínculo con el
  ACTOR y no con la campaña. Postularse "a una campaña" no tiene dónde guardarse
  sin una tabla nueva.
- Qué ve el fixer de una campaña a la que todavía no entró. Hoy el detalle le
  muestra todo; una oferta abierta probablemente tenga que mostrar menos.

#### Decidido el 22/9/2026, y el plan en seis etapas

**Se postula AL ACTOR que ejecuta, no a la campaña.** Aprobado, queda vinculado
de forma duradera y ve esa campaña y las siguientes. Usa las dos tablas que ya
existen. **La contra asumida:** el ejecutor no puede aceptarlo para una campaña y
no para otras. Más adelante puede venir una lista de exclusión al crear la
campaña; no ahora.

**El ejecutor es quien EJECUTA, no quien financia**, y se deriva igual que en
`lib/acceso-campana.ts`: `repositora_id` → la repositora; si no, `distri_id` → la
distri; si ninguno → GondolApp. **`via_ejecucion` no sirve para esto**: dice
`'distribuidora'` en el 100% de las filas de las dos bases, incluidas las que
tienen `repositora_id`. Es una columna que quedó vieja.

**Las campañas de GondolApp no llevan el flag**: `accesoACampana` ya las deja
pasar antes de mirar ningún vínculo, así que no hay a qué postularse. El selector
no aparece en ese caso.

**Un fixer puede estar vinculado a varias repositoras y distris a la vez** — ver
la corrección del Walled Garden más arriba. Por eso `aprobarSolicitudFixer` deja
de pisar `profiles.repositora_id` y lo escribe **solo si está en null**, y la
oferta se le muestra también al fixer que ya tiene otros vínculos, siempre que no
lo tenga con ESE ejecutor.

Las seis etapas, y lo que se verificó EN DEV de cada una:

| | Qué | Verificado |
|---|---|---|
| 1 | El schema (migración `20260924100000`) | dry-run; corrida en dev y prod |
| 2 | Las notificaciones que no llegaban | la invitación aparece en la campanita, a gondoleros y a fixers |
| 3 | El bypass + las 2 pantallas + el pisotón | la pestaña queda vacía al invitar; AkaashiHeroique quedó con los dos vínculos y `distri_id` en Biomega |
| 4 | `postulable` + el flag en los editores | el flag solo con actor fixer y ejecutor; el estado escondido no viaja |
| 5 | El fixer VE la oferta y no la trabaja | Pedro la ve sin botón, y la URL del detalle dice "No disponible para vos" |
| 6 | Postularme, los tres estados, los 30 días | camino completo: postularse → aviso al ejecutor → aprobar → la campaña salta a Disponibles; y el rechazo con motivo |

**La 2 fue segunda a propósito** —arreglaba algo roto en producción y no dependía
del resto— y por eso se subió a `main` sola, antes de que el tramo terminara.

**La 5 se separó de la 6 a propósito**: es la única que prueba que **mirar no
habilita trabajar**. Con las dos juntas, ese control se hubiera perdido entre el
resto del flujo.

#### Lo que quedó escrito, más allá de la feature

**`postulable` NO toca `ok`.** Es la propiedad que sostiene todo: `validarUnion`
y el gate de captura miran `ok`, así que una oferta no se puede trabajar por
accidente ni aunque una pantalla se olvide de chequear algo. Un tercer estado de
`ok` habría obligado a cada gate a acordarse del caso nuevo — que es exactamente
cómo se separaron las tres copias que `acceso-campana.ts` vino a unificar.

**`ejecutorDeCampana` no lee `via_ejecucion`.** Esa columna dice
`'distribuidora'` en el **100%** de las filas de las dos bases, incluidas las que
tienen `repositora_id`. Quedó vieja y leerla da la respuesta equivocada justo
para los fixers.

**La ventana de 30 días es una DURACIÓN, no un día calendario**, y por eso
`lib/postulacion-fixer.ts` es el primer archivo de decisión que **no** cablea
`lib/fecha-ar.ts`: acá no hay ningún día que decidir, y meter la zona sería
agregarle una frontera a algo que no la tiene. Falla ABIERTO sin `rechazada_at`
—las filas rechazadas antes de la migración no la tienen— porque bloquear por un
dato que nosotros no guardamos deja a alguien afuera sin poder explicarle cuánto
falta.

**Dos tests míos estuvieron mal, y los dos enseñaron algo:**

1. En `probar-postulable.ts`, el filtro por `motivo` de `accesoACampana` resultó
   **redundante**: verificado rompiéndolo a propósito, el test siguió verde. Los
   tres motivos que excluye no pueden coexistir con un ejecutor. Se dejó el
   filtro —dice la intención, y el default para un motivo nuevo queda del lado
   seguro— pero anotado en los dos archivos para que nadie concluya del verde lo
   que el verde no dice.
2. En `probar-postulacion-fixer.ts`, un control afirmaba que rechazos a distintas
   horas del mismo día dan la misma espera. Eso es lo que pasaría si la regla
   fuera de día calendario, o sea lo contrario de lo decidido. **El test estaba
   mal, no el código.**

> Un test que no se pone rojo contra la rotura que dice cubrir no cubre nada. Las
> dos veces se descubrió rompiendo el código a propósito, no leyéndolo.

#### Lo que el relevamiento encontró y no era parte de la feature

1. **`vinculacion_invitacion` lo rechaza el CHECK de `notificaciones`.** Los tres
   paneles de invitación lo escriben sin chequear el error, así que **desde que
   existe el flujo nadie recibió el aviso de que lo invitaron** — cero filas de
   ese tipo en dev, con vínculos aprobados existiendo. Y `actor_tipo` no acepta
   `'fixer'`, que es lo que escribe `aprobarSolicitudFixer`: **el fixer tampoco
   se entera de que lo aprobaron.** Los dos CHECK se arreglan en la etapa 1.
2. **La distri puede aprobar su propia invitación.** `confirmarVinculacionPorCodigo`
   crea la fila en `pendiente` con `iniciado_por='distri'`, esa fila aparece en su
   propia pestaña "Solicitudes", y `aprobarSolicitudFixer` no mira `iniciado_por`:
   escribe el vínculo sin que el fixer acepte nada. El vacío de esa pestaña dice
   *"Cuando un fixer solicite unirse, aparecerá acá"* — la pantalla se construyó
   para este tramo y nunca tuvo quién produjera esas filas.
3. **La aprobación de la repositora ya existe** y chequea el error, pero vive
   adentro del panel de invitación, y la pestaña "Solicitudes" —que tiene el
   badge con el contador— es un cartel que dice "aparecen arriba". Es mudanza y
   filtro, no pantalla nueva.
4. **`'rechazada'` ya lo aceptan las dos tablas.** No hubo nada que corregir.

**Los cuatro se cerraron dentro del tramo**: los dos CHECK y las columnas en la
etapa 1, los nueve avisos que rebotaban en la 2, y el bypass más la mudanza de la
pantalla de repositora en la 3. Ninguno era parte de la feature; los tres
primeros estaban rotos en producción desde antes.

#### PENDIENTE — que nadie lea `profiles.repositora_id` para pertenencia

Lo mismo que se hizo con `distri_id`: la fuente de la pertenencia es la tabla de
solicitudes, no la columna. `lib/utils-distri.ts` ya lo hace bien
(`getDistrisDeActor` devuelve un array leído de las solicitudes).

**Son 4 lectores y 3 escritores**, todos sobre la pertenencia del FIXER:

| Archivo | Qué hace |
|---|---|
| `admin/fixers/page.tsx:19` | lista los fixers con su repositora |
| `admin/repositoras/[id]/page.tsx:35` | los fixers de esa repositora |
| `admin/repositoras/page.tsx:34` | el conteo de fixers por repositora |
| `fixer-vinculacion/page.tsx:105` | "¿ya estás vinculado a este actor?" |
| `repositora/fixers/invitar-actions.ts:146` | **escribe** al aprobar (pisa) |
| `repositora/fixers/invitar-actions.ts:196` | **limpia** al desvincular |
| `fixer-vinculacion/actions.ts:72` | **escribe** si está en null |

El síntoma concreto con vínculos múltiples: un fixer vinculado a A y a B **cuenta
para una sola** en los dos paneles de admin, y la columna dice cuál según cuál
vínculo se escribió primero.

**No confundir con el otro uso de la misma columna**: para un usuario con
`tipo_actor='repositora'`, `profiles.repositora_id` es *"de qué empresa soy"*, y
lo usa todo el panel `(repositora)/`. Ese uso está bien y no se toca. La columna
está sobrecargada con dos significados, y solo uno es el problema.


### 3. Panel general de la marca — ✅ HECHO el 23/9/2026, en seis etapas

**La pregunta que responde:** cómo evolucionan la presencia, los frentes y los
precios en el tiempo, **sumando todas las campañas de la marca**. Hasta este
tramo cada campaña tenía su dashboard y no había forma de compararlas. Es lo que
justificaba el tramo de métricas.

| Etapa | Qué | Migración |
|---|---|---|
| 1 | `panel_marca_series` + `panel_marca_visitas` | `20260925100000` |
| 2 | `lib/panel-marca.ts` — el rollup, sin base | — |
| 3 | El KPI de Presencia y el dónut | — |
| 4 | La serie mensual (SVG a mano, server-rendered) | — |
| 5 | El desglose por campaña al tocar un punto | — |
| 6 | Cobertura por ciudad y por tipo; dos bloques afuera | `20260926100000` |

#### Números que dejaron de ser falsos en producción

La etapa 3 no agregó una feature: **arregló tres números que la marca miraba
para decidir**.

```
marca        antes                     después
Suprante      0%  0 de 26 fotos        64%  7 de 11 observaciones · abr – sept
Georgalos    66%  90 de 137 fotos      80%  45 de 56 observaciones · mar 2026
ACME          0%  0 de 22 fotos         —   no se está midiendo
```

La cuenta era `producto_presente / TODAS las fotos aprobadas`. Suprante no tiene
ni una foto con `declaracion` —la columna está congelada desde `20260407124015`—
pero sí 11 observaciones tipificadas, 7 afirmativas. Leía **0%**, y un 0% no dice
"no sabemos": le dice a la marca que su producto no está en ningún lado.

---

#### Las decisiones que NO hay que revertir

**1. El ancla es `misiones.capturada_at`, nunca `created_at`.**
Medido en prod: `mision_respuestas.created_at` dice `2026-09` en el **100%** de
las filas, porque es cuándo entró el registro. `capturada_at` las reparte en
abril y septiembre, que es cuándo se hizo el trabajo de campo. Con el ancla
equivocada **toda la historia colapsa en un punto y el panel dibuja una raya**.
Las 365 misiones de las dos bases tienen `capturada_at`, así que el `COALESCE`
es un cinturón y no un parche en uso.

**2. El mes sale de SQL como texto `'YYYY-MM'`.**
`date_trunc('month', ts AT TIME ZONE …)` devuelve un `timestamp without time
zone`: exactamente el tipo que `new Date()` reinterpreta en la zona del que mira.
Es el bug del tramo C′. `lib/panel-marca.ts` hace aritmética de meses sobre
enteros y **no construye un `Date` en ningún lado**; la única conversión es la
etiqueta, que pasa por `formatearDia`.

**3. Suma y conteo, nunca AVG.**
El RPC devuelve `suma_numerica` y `obs_con_valor`; el promedio se hace
dividiendo. Con 23 PDV a $3.779 y 2 PDV a $500, promediar los dos promedios da
**$2.140 contra los $3.516 reales** — un número que no es el de ninguna de las
dos campañas y que igual se dibuja lindo. Vale igual para el resumen global, que
se repondera por `conValor`.

**4. `basePdv` NO se suma, y por eso existe el `GROUPING SETS`.**
Es un `COUNT(DISTINCT comercio)`: un comercio relevado por dos campañas el mismo
mes cuenta **una vez** en el total y una vez en cada desglose. Por eso
`ResumenMetrica` **no tiene** ningún campo de PDV —sumar meses lo contaría dos
veces— y por eso un mes sin su fila de total se **ignora** en vez de
reconstruirse desde el desglose.

**5. Una métrica sin datos no se dibuja; un mes sin datos corta la línea.**
Y el eje es **continuo de punta a punta**: si tuviera solo los meses con datos,
abril y septiembre quedarían pegados y el hueco de cuatro meses desaparecería —
la misma mentira que interpolar, contada de otra forma.

**6. Cada punto muestra su BASE DE CÁLCULO, en el eje X y no en un tooltip.**
Un tooltip no existe en un celular y no sale en una captura de pantalla, que es
como este gráfico viaja adentro de la marca. Un mes sin medición lleva **una
raya, no un cero**.

**7. El eje Y de un porcentaje va de 0 a 100 SIEMPRE.**
Con eje automático, una variación de dos puntos se dibuja como una montaña: es
la forma más común de mentir con una línea. Las numéricas se ajustan pero
arrancan **desde cero** por lo mismo.

**8. VISITAR NO ES MEDIR (etapa 6).**
Un comercio visitado sin pregunta de presencia tiene `con_valor = 0` y su ciudad
dice **"sin medir"**, no 0%. Un 0% dice *"el producto no está"*; "sin medir" dice
*"no preguntamos"*, y la marca actúa distinto en cada caso. En dev son 9 de los
65 PDV de Georgalos. De ahí sale el denominador: **el % se calcula sobre los PDV
que midieron, no sobre los visitados**.

**9. Dos unidades conviven, y las dos dicen en qué están medidas.**
El KPI y el dónut cuentan **observaciones**; la cobertura por ciudad y por tipo
cuenta **PDV**. Son dos preguntas distintas y las dos son legítimas —"de lo que
medimos, ¿qué dio presente?" contra "¿en cuántos comercios está?"— pero un
número sin unidad al lado de otro con otra unidad es exactamente cómo una
pantalla se contradice a sí misma.

**10. La selección del desglose vive en la URL, no en un `useState`.**
Dos razones: el bloque sigue sin mandar JS (`/marca/dashboard` quedó en **4,07
kB**, menos que antes del tramo), y **el link se puede mandar** — "mirá el salto
de precio de abril" es un link, no una explicación de dónde tocar.

**11. Un guard redundante no es un guard: es una copia de la condición.**
La etapa 5 salió con una validación en `page.tsx` que chequeaba que la métrica y
el mes existieran en el panel. `TarjetaSerie` ya hacía ese `find`. **La copia no
agregaba seguridad y sí agregaba el único lugar donde una selección válida podía
perderse en silencio** — y se perdió: el desglose no abría. Se sacó y quedó una
traza para el caso que decía cubrir.

---

#### LOS DOS HUECOS QUE NINGÚN DATO REAL EJERCITA

**Esto es lo que se pierde si no queda escrito.** Son dos caminos de código que
no se ejecutan ni una sola vez con los datos de dev ni de prod, así que **ningún
render, ninguna prueba manual y ningún deploy los toca**. Si alguien los rompe,
la pantalla va a seguir viéndose perfecta.

**Hueco 1 — la línea entre dos meses consecutivos.**

Al 23/9/2026 **ninguna serie tiene dos meses consecutivos**: todas son abril y
septiembre con el hueco en el medio. El render de prod produce **cero
`<polyline>`**. O sea que el código que traza la línea —y con él la regla de que
un hueco NO se cruza— nunca corre.

Un bug ahí dibuja una recta entre abril y septiembre: **cinco mediciones que
nadie hizo, y nada en pantalla lo delata**. Una recta se ve perfectamente normal.

Lo que lo cubre:
- `tramosContinuos` está en `lib/panel-marca.ts` y **no** en el componente, para
  que se pueda probar sin mirar el gráfico.
- `scripts/probar-panel-marca.ts` tiene 8 controles de corte, incluido el punto
  con observaciones y **sin valor usable**, que corta igual que un mes ausente
  (si se colara iría al cero del eje).
- `scripts/ver-serie-mensual.mts --simular-linea` reparte el piloto en tres
  meses **dentro de una transacción que se revierte** y dibuja el trazo. Es la
  única forma de VERLO. Verificado: un tramo de tres puntos en x = 46, 98, 150
  que se corta en mayo y no llega a septiembre.

**Hueco 2 — dos campañas en el mismo punto.**

Ningún punto de ninguna marca tiene más de una campaña en su desglose. Entonces
no se ejercitan:
- `comerciosCompartidos`, que detecta cuando los PDV de las campañas suman
  **más** que los del mes. Es correcto —un comercio relevado por dos campañas
  cuenta una vez arriba y una en cada fila— pero si no cierra y nadie lo
  explica, **el número correcto pasa a ser el sospechoso**.
- La etiqueta de fuente por fila, que solo aparece cuando hay más de una.

Cubierto por 4 controles, incluido que **nunca dé negativo** con un desglose
incompleto.

**Hueco 3, menor pero de la misma familia — las dos fuentes en la misma misión.**

`panel_marca_series` y `panel_marca_pdv` cuentan una observación por
`(misión, fuente)`. Si una misión tuviera respuesta tipificada **y** declaración
de foto, las dos la contarían dos veces — y las dos igual, que es lo que importa:
no pueden contradecirse entre sí. Hoy ese caso tiene **cero filas** en las dos
bases. **El día que deje de ser cero, hay que arreglar LAS DOS juntas.**

> La regla que sale de los tres: cuando una rama de código no la ejercita ningún
> dato real, el test **es** la única cobertura que tiene, y el comentario que
> dice por qué es lo único que evita que alguien lo borre por "redundante".

---

#### El invariante que ata las dos funciones

La migración `20260926100000` **no commitea** si los afirmativos de
`panel_marca_pdv` no coinciden con los de `panel_marca_series`. Es lo que impide
que vuelva el bug que la etapa 6 cerró: la misma pantalla diciendo 64% arriba y
0% por ciudad.

#### Herramientas que quedaron

| | |
|---|---|
| `scripts/probar-panel-marca.ts` | 109 controles, sin base, con `TZ=UTC` |
| `scripts/probar-migracion-panel-marca.mjs` | dry-run de la etapa 1, con el control del ancla |
| `scripts/probar-migracion-pdv.mjs` | dry-run de la etapa 6, con el invariante cruzado |
| `scripts/ver-serie-mensual.mts` | rinde el bloque a HTML con datos reales de cualquiera de las dos bases |

El último encontró **tres bugs que `tsc` no puede ver**: dos hijos en un
`<title>` de SVG, las cero polylines, y la geometría del eje. Mirar el artefacto
servido no es lo mismo que mirar el código.

#### Lo que NO entró, y por qué

- **El mapa.** Va después a propósito: el tablero define qué métricas existen y
  el mapa las pinta.
- **La unidad semanal.** El panel arranca mensual porque una marca piensa en
  trimestres. Lo que ya es genérico: `tramosContinuos` y `agruparCobertura`
  trabajan sobre una lista de claves, no sobre meses. Lo que NO lo es y hay que
  duplicar o generalizar el día que se agreguen semanas: `rangoDeMeses` y
  `etiquetaMes` validan el formato `YYYY-MM` con un regex propio, y el `to_char`
  de los dos RPC emite `YYYY-MM`. No lo pinto más fácil de lo que es.
- **El tope del eje.** `meses` no tiene límite: una marca con una campaña de
  2024 y otra de hoy produce decenas de columnas. Recortar en la lib sería
  esconder datos sin decirlo; la ventana la decide quien dibuja.

---

### 4. El mapa de la marca — ✅ HECHO el 23/9/2026, en tres etapas

**La pregunta que responde:** dónde está cada PDV y cómo le fue. El panel de
métricas dice *cuánto*; el mapa dice *dónde*, que es lo que convierte un
porcentaje en una decisión de ruta.

| Etapa | Qué | Migración |
|---|---|---|
| 1 y 2 | `lat`/`lng` en el RPC, y el agrupamiento sin librería | `20260927100000` |
| 3 | La pantalla `/marca/mapa` | — |

Corrida en dev y prod, y en producción desde el 23/9/2026.

---

#### Las decisiones que NO hay que revertir

**1. `pigeon-maps`, no Leaflet.** 11,3 kB de ruta y 98,8 kB de First Load,
contra los ~150 kB que agrega Leaflet solo. Lo que hay que saber de la
librería, verificado en su bundle y no en su README:

- `dprs: []` por default — **nunca pide tiles `@2x`**. Importa para la cuota.
- `maxZoom: 18`.
- **CERO `onError`**: su `ImgTile` solo pasa `onLoad`. De ahí sale la decisión 9.
- Dibuja **DOS capas**: los tiles del zoom actual y los `oldTiles` del anterior.
  Un contador de tiles que no lo sepa cuenta el doble.

**2. Geoapify, y no MapTiler ni Stadia.** El motivo no es técnico y por eso es
fácil de perder: **el plan gratuito de Geoapify permite uso COMERCIAL**
—textual de su FAQ—, y los de MapTiler y Stadia **lo prohíben**. GondolApp le
cobra a marcas y distribuidoras: el mapa es parte de un producto pago.

Cuota al 23/9/2026: 3.000 créditos/día, 1 tile = 0,25 créditos, y los límites
son *soft* — avisa por mail, no corta ni cobra.

**3. La key de tiles es pública y está bien que lo sea.**
`NEXT_PUBLIC_GEOAPIFY_KEY` viaja al browser porque el `<img>` del tile la
necesita. Lo que la protege **no es esconderla, es la allowlist de dominios**
en el panel de Geoapify. Buscar la forma de ocultarla es trabajo perdido: una
key de tiles restringida por origen es el modelo de todos los proveedores.

**4. El clustering es nuestro** (`lib/mapa-pdv.ts`), y no una dependencia.
`proyectar` + `agruparEnMapa(puntos, zoom, separacionPx = 22)`: 22 px es el
tamaño del marker, o sea que dos PDV más cerca que eso **se taparían**, que es
la única definición de "hay que agrupar" que no es arbitraria.

> **El invariante:** la suma de los puntos de todos los grupos es SIEMPRE igual
> a los puntos de entrada. Un mapa que se come un PDV al agrupar miente igual
> que uno que lo tapa, y en silencio.

**5. El anillo partido en tres.** Un grupo con presencias y ausencias no se
pinta del color de la mayoría: `anilloGrupo` arma un `conic-gradient` con las
tres proporciones. **Nada esconde a la minoría** — un grupo de 9 con 1 ausencia
tiene que dejar ver esa ausencia, que es justo el PDV al que hay que ir. Con el
pintado por tipo el grupo mixto va neutro y el número dice que hay varios: ahí
no hay proporción que mostrar, hay categorías.

**6. Dos controles, y el estado es el ÚLTIMO CONOCIDO.** Qué se muestra (todos
los PDV o los de una campaña) y cómo se pinta (presencia o tipo). El punto NO
dice "hoy": dice lo último que se midió, y la lista lo fecha. Un mapa que
promete tiempo real sobre relevamientos mensuales es la forma más cara de
mentir.

**7. Un `200` no prueba que el contenido sirva.** Descarté CARTO diciendo que no
pedía key porque el tile devolvía `200`. Era falso: **el PNG venía con una marca
de agua "API KEY RE…"** impresa encima. El status dice que hubo respuesta, no
que la respuesta sea la que se pidió. Con imágenes, hay que mirarlas.

**8. El cartel de fallo mide los tiles REALES, con listeners en fase de
captura.** La primera versión tenía una sonda aparte que pedía un tile fijo
(`12/1372/2401`, sin `@2x`) y daba **falso positivo**: el cartel aparecía con el
mapa funcionando perfecto.

> *"Un aviso que aparece siempre enseña a ignorarlo — el mismo defecto del 'se
> reintentará automáticamente' que sacamos de la cola."*

Y lo que de verdad enseñó no fue el bug sino el test: **mi control corrió contra
una URL escrita a mano en el HTML de prueba, no contra la del componente.** Daba
verde sobre una cadena que la app nunca pide. Ahora no hay sonda: se escuchan
`load` y `error` **en fase de captura** sobre el contenedor —los de `<img>` no
burbujean— así que lo que se cuenta es exactamente lo que el usuario está
mirando. `decidirFallo` exige `cargados === 0 && fallidos >= 3`
(`MINIMO_FALLOS`): un tile suelto que falla no enciende nada.

**9. Un tile que falla esconde su `<img>`, no muestra el ícono roto.** Chrome
dibuja el ícono roto aunque el `alt` esté vacío, si el `<img>` tiene ancho y
alto explícitos — que es el caso. El ícono roto se lee como *"la app está
rota"*, y no es cierto: el resto del mapa y todos los puntos están bien. Se hace
en el mismo listener que ya cuenta, y **no con un `tileComponent` propio**
—pigeon lo permite— porque una copia de su `ImgTile` habría que mantenerla
sincronizada con la de la librería. El `onLoad` restaura la visibilidad: el
mismo `<img>` se reusa con otro `src`, y sin eso quedaría oculto para siempre.

---

#### LOS HUECOS DEL MAPA QUE NINGÚN DATO EJERCITA

Medido el 23/9/2026 corriendo `agruparEnMapa` sobre los datos reales de las dos
bases, a z6, z9, z12, z15 y z18, para las tres marcas:

```
                      PDV   sin coord.   grupos mixtos   ANILLO TRICOLOR
Georgalos (prod)       58        0         hasta 6             0
Suprante  (prod)       26        0         hasta 1             0
ACME      (prod)       22        0              0              0
(dev da lo mismo en las tres)
```

**Hueco 1 — el anillo partido en TRES no se dibuja nunca.** Grupos mixtos de dos
colores sí hay —hasta 6 en Georgalos a z9—, así que `anilloGrupo` corre. Pero
**ningún grupo, en ningún zoom, en ninguna de las dos bases, tiene presencias y
ausencias y sin-medir a la vez**: el tercer tramo del gradiente es código que no
se ejecutó una sola vez. Y es justo la parte que se pidió explícitamente, porque
es la que impide que la minoría desaparezca.

Lo cubre `scripts/probar-mapa-pdv.ts` (48 controles) y nada más. Si alguien lo
rompe, **el mapa se va a seguir viendo perfecto**.

**Hueco 2 — el aviso de PDV sin coordenadas.** `sinCoordenadas` es **cero en las
dos bases**, así que el bloque que lo declara nunca se rinde. Existe porque un
mapa que omite puntos en silencio miente; hoy no omite ninguno. El día que entre
un comercio sin `lat`/`lng` —o cuando se arregle `localidad_id`— ese camino se
estrena en producción sin haber corrido nunca.

**Hueco 3 — los dos estados de `decidirFallo`.** `sin_key` y `tiles_no_cargan`
no se alcanzan con datos: se alcanzan rompiendo algo. Se probaron a mano
apuntando la key a basura. Ningún deploy los va a ejercitar.

> Los tres son de la misma familia que los del panel: **cuando ninguna rama de
> datos reales toca un camino, el test es la única cobertura que tiene**, y el
> comentario que explica por qué es lo único que evita que alguien lo borre por
> "redundante".

---

### 5. El panel y el mapa para la DISTRIBUIDORA — ✅ HECHO el 23 y 24/9/2026

Las dos primeras etapas del tramo que comparte el panel entre marca y
distribuidora. **El caso que lo justifica**, para no perderlo: una distri arma
una campaña para relevar competencia —"hay marca X", "hay producto X", foto— y
con el mapa define precios por zona. Sube en Colón donde no hay competencia,
baja en Concordia donde está a full. **Eso es una decisión de plata, no un
reporte.**

#### Etapa 0 — el renombre

```
lib/panel-marca.ts                    →  lib/panel-metricas.ts
marca/dashboard/serie-mensual.tsx     →  components/panel/serie-mensual.tsx
marca/dashboard/dashboard-visualiz…   →  components/panel/cobertura.tsx
marca/mapa/mapa-cliente.tsx           →  components/panel/mapa.tsx
scripts/probar-panel-marca.ts         →  scripts/probar-panel-metricas.ts
```

**Lo que impedía montarlos en otra pantalla eran dos rutas escritas a mano:**
`const RUTA = '/marca/dashboard'` en la serie y `href="/marca/mapa"` en
cobertura. Ahora entran por prop (`rutaBase`, `rutaMapa`), así que el desglose y
el link navegan a la pantalla que los monta. `mapa.tsx` no necesitó **un solo
cambio**: no hardcodeaba nada.

**Cómo se prueba que un renombre fue mecánico:** no alcanza con que compile y
los tests pasen. Se rindió el bloque de la serie con `ver-serie-mensual.mts`
contra dev, se stasheó el renombre entero, se rindió desde `HEAD`, y `diff` no
devolvió nada — **idéntico byte a byte**. Es el control que conviene repetir en
cualquier mudanza de componentes.

De paso se fue el `declaracion` muerto de `marca/dashboard/page.tsx` —el tipo y
el select—, que quedó sin lectores en la etapa 6 del panel, y un
`import type` que no usaba nadie.

#### Etapa 1 — la alerta que afirmaba lo que no medía

Tres superficies —el dashboard de la distri, la pantalla de alertas y el puntito
rojo del sidebar— tenían **la misma consulta copiada**:

```
fotos.declaracion = 'producto_no_encontrado'
  AND estado = 'aprobada' AND created_at >= hace 7 días
```

Medido el 23/9/2026 en las dos bases:

```
producto_no_encontrado, total      22   ← TODAS del 11 y 12 de marzo de 2026
   … en los últimos 7 días          0
   … en los últimos 90 días         0
```

El dashboard mostraba **"✅ Sin alertas de stock activas"** en verde y la
pantalla **"✅ Todo en orden"**. Hace seis meses que ese cero no es una
medición. **Un tilde verde no es la ausencia de un número: es una afirmación**,
y era falsa. Mismo defecto que dejaba a Suprante en 0% de presencia.

**Y la fuente no era la que el catálogo declara.** `metricas.fuentes` para
`quiebre_stock` es `{respuestas}` y nada más: la declaración de la foto **no es
fuente suya**. (Para `presencia` sí, y por eso el panel de marca la lee.) O sea
que no se arreglaba moviendo la ventana de 7 días — leía por una puerta que esa
métrica no tiene.

Cómo quedó, **derivado del catálogo y no escrito a mano**
(`lib/alertas-distri.ts`):

| Preguntas tipificadas con la métrica | Qué dice |
|---|---|
| 0 | **No se está midiendo** + cómo configurarla |
| ≥ 1 | **Todavía sin leer** + cuántas hay |

Se cuenta sobre las **preguntas** y no sobre las respuestas a propósito: una
campaña recién publicada, con la pregunta puesta y sin una sola misión, **sí**
está midiendo. Contar respuestas la mostraría como un hueco de configuración
cuando es solo una campaña que arranca.

Las dos ramas existen en datos reales: **Biomega en dev tiene 1 pregunta
tipificada** con `quiebre_stock`; todas las demás distris de dev y de prod
tienen 0.

**El puntito del sidebar se borró, no se reemplazó.** El layout corre en cada
navegación del panel, y recalcular ahí los cuatro tipos de alerta sería una
segunda copia de las reglas de `/distribuidora/alertas`. Cuando la alerta vuelva
a estar viva, el contador sale de la misma función que usa la pantalla.

**Lo que NO se hizo y por qué:** reconstruir la alerta sobre `mision_respuestas`
necesita el scope por campaña de la etapa siguiente. Hacerlo antes era escribir
a mano, en TypeScript, las reglas que ya viven en el SQL de `panel_marca_pdv`
—las dos fuentes, el grano por (misión, fuente), los estados de misión
excluidos—. Duplicar eso es duplicar lo que más costó del tramo del panel.

`scripts/probar-alertas-distri.ts`, 21 controles sin base. **Verificado que 4 se
ponen rojos** poniendo el cartel viejo a propósito. Los controles son sobre el
TEXTO y no sobre el booleano, porque el daño estaba en la frase: un test que
solo mirara `midiendo` habría pasado con el cartel de ayer.

#### Etapa 2 — el scope pasa a ser una LISTA DE CAMPAÑAS

Migración `20260928100000`. Las tres funciones del panel dejaron de filtrar por
dueño:

```
panel_marca_series(uuid)       →  panel_series(uuid[])
panel_marca_visitas(uuid)      →  panel_visitas(uuid[])
panel_marca_pdv(uuid, uuid)    →  panel_pdv(uuid[])
```

**El cuerpo del SQL es idéntico salvo una línea**: `c.marca_id = _marca_id` pasa
a `c.id = ANY (_campanas)`. Todo lo demás —las dos fuentes, el grano por
(misión, fuente), el ancla en `capturada_at`, los estados excluidos, el
`GROUPING SETS`— es el mismo texto.

La alternativa era agregar un `_distri_id` y un OR. Se descartó: duplicar ese
cuerpo es duplicar las reglas que más costaron, y garantizar que el día que
alguien corrija una, la otra quede vieja en silencio.

**El invariante, dentro de la transacción:** para cada marca, las tres nuevas
devuelven exactamente las mismas filas que las tres viejas. Se compara con
`EXCEPT ALL` en las dos direcciones, que además del contenido detecta
diferencias de **multiplicidad** — dos filas idénticas donde antes había una es
un bug de agregación que un `EXCEPT` a secas no vería. Si difiere una sola fila,
no commitea.

Verificado que el bloque muerde, rompiéndolo a propósito de dos maneras: un
scope que falla ABIERTO con la lista vacía, y una diferencia sutil en el cuerpo.
Las dos las agarra el `DO`.

##### LA LISTA ES EL PERMISO

Lo que más importa de esta etapa, y no es el SQL.

`panel_marca_pdv(_marca_id, _campana_id)` filtraba por marca **y** por campaña,
así que un `campana_id` ajeno llegado por la URL simplemente no devolvía nada:
**el dueño era la red de seguridad, y nadie tenía que acordarse de validar.**

`panel_pdv(_campanas)` no tiene dueño contra el cual contrastar. Por eso
`lib/campanas-de.ts` es el único lugar que contesta "cuáles son las campañas de
X", y su `idsDe()` intersecta lo pedido contra lo que el actor puede ver: una
campaña ajena devuelve `[]`, **no la lista entera**. Esa diferencia es la que
separa "no tenés datos de esa campaña" de "te muestro todo porque no entendí lo
que pediste".

`campanasDe` devuelve las FILAS y no solo los ids a propósito: el panel usa
estado y fechas, el mapa usa el nombre. Si devolviera ids, cada pantalla
volvería a consultar `campanas` con su propio `.eq('marca_id', …)` — el
predicado escrito de nuevo, que es justo lo que el archivo viene a impedir.

**Costo asumido:** el dashboard perdió paralelismo. Las campañas van primero y
solas, porque los tres RPC dependen de esa lista.

#### El DROP de las tres viejas — migración `20260929100000`

Corrió **un día después** del deploy, con el orden de siempre: código que deja
de usarlas → deploy → verificar en producción → DROP. Al revés, el deploy
anterior se queda llamando funciones que no existen, y PostgREST no devuelve la
fila sin esa función: **no devuelve nada**.

El grep de después, sobre el repo entero y clasificado —porque el crudo devuelve
80 líneas y casi todas son prosa—:

```
rpc('panel_marca…  en todo el repo       CERO
app/ lib/ components/ types/             8 comentarios, ninguna llamada
supabase/migrations/                     histórico
scripts/ (3 dry-runs)                    SQL real
```

La migración verifica **las dos direcciones** —que se hayan ido las tres y que
sigan las tres nuevas— y además las ejercita, porque que el nombre exista no
prueba que devuelva filas. Cuenta **por nombre, no por firma**: `panel_marca_pdv`
era `(uuid, uuid)` desde `20260927100000`, y un `DROP IF EXISTS` con la firma
equivocada no falla, simplemente no borra.

Tiene una **precondición**: si las funciones nuevas no están, se niega a borrar.
El dry-run la prueba de verdad —dropea las nuevas en una transacción aparte y
espera que la migración explote— porque una precondición que nadie ejercitó
puede estar mal escrita sin que se note.

> **Un hallazgo que no era de este tramo:** `probar-migracion-pdv.mjs` está roto
> desde el 23/9 y nadie se enteró. Aplica `20260926100000`, que crea
> `panel_marca_pdv(uuid)`, sobre una base que desde `20260927100000` tiene
> `panel_marca_pdv(uuid, uuid DEFAULT NULL)`: las dos firmas conviven y la
> llamada de un argumento da **42725 — is not unique**. Es la misma trampa que
> `20260927100000` documenta en su encabezado, esta vez del lado del dry-run.
> **Un script de verificación que no se corre no verifica nada.**

#### Etapa 2b — las dos alertas que medían fotos

`fotos` es una fuente equivocada para "¿hubo actividad?" desde que existen las
campañas de solo preguntas: no producen una sola foto.

**Gondoleros inactivos.** El dashboard de Biomega decía *"11 de 13 sin actividad
en 14 días"*, con nombre propio. No es un número que falta: **es una acusación
falsa sobre una persona.** Ahora mide `misiones.capturada_at`, y en dev pasa de
11 a 10.

Dos decisiones que no son obvias:

- **El scope son las campañas de la distri, no todas.** Un gondolero puede estar
  vinculado a varias a la vez, así que "trabajó" y "trabajó PARA VOS" son
  preguntas distintas. Medido: para Biomega la global da 9 y la de la distri 10;
  para Distribuidora Del Valle la global da 1 y la de la distri **2** — alguien
  activo para otro que no produce nada acá. Eso obliga a cambiar el texto: la
  pantalla ya no dice "sin actividad" —una afirmación sobre la persona, que
  sería falsa— sino **"sin misiones en tus campañas"**.
- **Las misiones descartadas y rechazadas SÍ cuentan como actividad.** Todo el
  resto del tramo las excluye; acá sería un error, porque la pregunta no es "¿este
  trabajo cuenta?" sino "¿esta persona trabajó?". Excluirlas acusaría a alguien
  cuya única misión de la quincena se rechazó.

Y la consulta **falla cerrada**: si no se puede leer, no se acusa a nadie.

**Comercios sin visita.** Partía de las fotos de los últimos 60 días y después
filtraba "hace más de 30": la banda visible era 30–60, y **todo comercio con más
de 60 sin visita desaparecía de la alerta**. Los más abandonados se escondían
justo por estar más abandonados — 23 en cada base.

El universo pasa a ser `panel_pdv`, que ya devuelve un comercio por fila con su
última visita, así que no hace falta otra consulta ni reescribir la regla. Sin
techo. Biomega pasa de mostrar 0 a **51 en dev y 56 en prod**.

> Ese salto no es que aparecieran comercios abandonados: es que el techo los
> escondía a todos. Los datos del piloto son de marzo y el peor caso es *Allais,
> 196 días*. Con seis meses sin relevar, la respuesta honesta es que casi todo el
> padrón está sin visitar.

**El badge cuenta el TOTAL, no lo que entra en pantalla.** La lista se recorta en
50 para que se pueda leer, y un badge que contara la lista diría 50 habiendo 56.
Los más viejos primero, para que el recorte se lleve los menos urgentes.

Las dos pasan por `lib/campanas-de.ts`, que es para lo que se hizo. Y por eso
esta etapa fue **después** del scope: hacerlas antes era escribir una cuarta
copia de "cuáles son las campañas de X" —ya estaba inline en la pantalla de
alertas, el dashboard y el layout— y después tener que sacarla.

#### Etapa 3 — el panel de la distribuidora

`/distribuidora/panel` es el MISMO panel que el de marca: las mismas funciones,
el mismo rollup y los mismos componentes. Lo único propio es el alcance.

##### El tercer control, obligatorio y SIN DEFAULT

En producción Biomega ve:

```
Georgalos S.A. (2)   ·   Suprante SRL (1)   ·   Mis campañas propias (1)
```

Las opciones salen de los datos: si deja de ejecutar campañas de una marca, esa
opción desaparece sola.

**No hay "todas" y no hay default.** El 80% de Georgalos y el 64% de Suprante
darían un 74% que no describe a ninguna de las dos — el mismo error que
promediar promedios con distinto N. Y un default escondido —"si no eligió, la
primera"— **es peor que una pantalla vacía**, porque la distri leería el número
de una marca creyendo que es de otra. Mientras no elija, la pantalla lo explica
y no dibuja un solo número.

`alcanceDesde` además valida la clave contra las opciones de ESA distri: un
`marca_id` puesto a mano en la URL no se convierte en alcance y no produce
ninguna consulta.

##### El aviso de las 8 misiones, que se apaga solo

El tablero viejo cuenta la actividad de SUS GONDOLEROS vayan donde vayan; el
panel cuenta las misiones de SUS CAMPAÑAS las haga quien las haga. Los dos son
defendibles y en producción no dan lo mismo:

```
Biomega (prod)   100 por gondolero  →   92 por campaña      delta 8
Biomega (dev)    143                →  138                  20 salen, 15 entran
Distri Norte      12                →   12                  apagado
```

Un número que baja de 100 a 92 sin explicación se lee como un error del sistema,
y a partir de ahí no se le cree a ninguno de los dos. El aviso sale de **medir**
la diferencia en las dos direcciones, así que **se apaga solo** el día que los
criterios coincidan — ya está apagado para Distri Norte, con datos reales. No
hay bandera que bajar.

##### Los tres arreglos que salieron de probarlo

**1. El desglose se comía el alcance.** `hrefPunto` pegaba un `?` fijo, y el
panel monta la serie con `/distribuidora/panel?alcance=<marca>`: tocar un punto
perdía el alcance y la pantalla volvía al estado sin elegir. El desglose que se
pedía **no llegaba a dibujarse nunca**.

**2. LAS MÉTRICAS NUMÉRICAS NO SE AGREGAN ENTRE CAMPAÑAS.** Decisión de producto,
y la que más cambia el panel — también el de marca.

Precio y Frentes solo significan algo dentro de una campaña, porque cada campaña
mide un producto distinto: promediar el precio del aceite de coco con el de la
pasta de maní da un número que no describe nada, y cinco frentes de un producto
con dos de otro no son 3,5. Presencia, quiebre y exhibición **sí** agregan: son
el porcentaje de una condición que significa lo mismo en cualquier campaña.

**No cambió el SQL.** El `GROUPING SETS` ya emite los dos granos, así que las
agregables salen de las filas de TOTAL y las que no, de las de DESGLOSE.

La regla es `esAgregableEntreCampanas` y **se deriva de `tipo_respuesta`**. Eso
tiene un límite anotado: el día que exista una numérica comparable entre campañas
—metros de góndola, bocas— esa derivación la parte mal, y ahí sí hace falta una
columna `agregable` en `metricas`. Es el único caso que la justifica.

Tres consecuencias que no son obvias:

- `SerieMetrica` gana `clave` (`slug`, o `slug::campanaId`). Sin eso dos tarjetas
  de Precio comparten el `?metrica=precio` y el desglose abre en las dos.
- Una serie por campaña **no arrastra `pdvVisitados`**: ese denominador es de
  todas las campañas del alcance, y mostraría "4 de 69 PDV" para una que cubrió 13.
- El KPI "Precio promedio" del panel de distri **se fue**. Era exactamente el
  promedio entre campañas que esto vino a sacar.

Un total numérico sin desglose **no se dibuja y queda en el log**. No se cae al
total como respaldo a propósito: ese número es el promedio prohibido.

**3. Un solo punto no necesita gráfico.** Con una sola medición el eje se
estiraba —0 a 15.008 para un valor de 13.050— y la tipografía del SVG crecía con
él. Un gráfico dibuja una tendencia y con un punto no hay ninguna. Ahora va el
número, su mes y su base de cálculo. Se cuentan los puntos **con valor**: un mes
con observaciones y sin valor usable no se dibuja, así que tampoco cuenta.

Ya se dispara con datos de producción: la Presencia de Georgalos tiene un solo
mes medido.

> Los 109 controles pasaron a 122, y **se tocaron aserciones**. El cambio de
> producto invalidó lo que afirmaban. El control del promedio ponderado —"$2.140
> contra $3.516"— **se mudó a una binaria**, que es donde esa cuenta sigue viva,
> y en su lugar quedó el que importa ahora: **el promedio entre campañas no
> aparece en ninguna serie**. El resto fueron fixtures: el helper creaba filas
> `numero` por default y sin desglose, así que dejaban de producir serie.

#### Etapa 4 — el mapa de la distribuidora

`/distribuidora/mapa`, con el mismo alcance obligatorio. Sin migración: usa
`panel_pdv`.

**No se duplicó la pantalla.** El cuerpo del mapa de marca eran 200 líneas de
controles, referencias y avisos sin nada específico de un actor: se extrajo a
`components/panel/pantalla-mapa.tsx` y las dos páginas quedaron en ~60 líneas.
El selector de alcance también salió a `components/panel/selector-alcance.tsx` —
**dos copias de un control obligatorio son dos oportunidades de que una se dé un
default a sí misma.**

**Y los links de los controles ya no se arman a mano.** `hrefMapa()` en
`lib/mapa-pdv.ts` hace merge sobre la query que la ruta ya trae. Es el mismo bug
que `hrefPunto` tuvo dos etapas antes, pero acá la superficie es mayor: son DOS
controles que se combinan entre sí sobre una base que lleva el alcance. El
control menos obvio de los 14 es que **el valor por default BORRE el parámetro**:
"Todos los PDV" no es un valor, es la ausencia del filtro, y dejarlo como
`?campana=` haría que la URL diga que hay un filtro puesto.

Cambiar de alcance **resetea los otros dos filtros** a propósito: una campaña de
Georgalos no existe dentro de Suprante.

Medido en producción:

```
Biomega → Georgalos   58 PDV · 45 con · 11 sin · 2 sin medir
  ↳ Auditoría precios Mantecol   25 PDV, los 25 "sin medir"
Biomega → Suprante    11 PDV · 7 con · 4 sin
```

El caso del medio es el que vale: esa campaña mide precio, no presencia, y el
mapa dice **"no preguntamos"** en vez de pintar 25 puntos como ausentes.

#### Etapa 5 — la miniatura de foto en la lista del mapa

El mapa dice DÓNDE y la foto dice POR QUÉ. Un punto rojo con la foto al lado es
la diferencia entre "no está" y "no está porque la góndola está vacía".

**Las firmas al abrir obligan a una server action.** Los buckets son privados:
firmar necesita service role. La lista vive en `MapaCliente`, que es cliente
porque el mapa tiene zoom. Firmar en el render serían 58 tokens de una hora
emitidos para que alguien mire tres.

**Y la acción no le cree al cliente:** recibe ids de comercio y la selección de
la URL, pero vuelve a resolver el permiso desde la sesión. Una acción que
aceptara los ids de campaña del cliente sería la puerta de atrás de todo el
tramo.

**"Última" es por `capturada_at`.** El punto pinta el último estado conocido, así
que la foto tiene que ser de esa visita. El control que lo prueba es una foto de
campo de marzo que entró a la base DESPUÉS que la de septiembre: por `created_at`
ganaría la equivocada, y **nadie lo notaría** — una foto de góndola no lleva la
fecha escrita. Por eso el visor la muestra fechada.

Dos filtros definen qué es evidencia: solo **aprobadas** —una pendiente todavía
no lo es, y ponerla al lado de un número la convierte en una— y solo con
`mision_id`, que descarta la foto de fachada del alta de comercio.

`firmarFotosEnLote` usa `createSignedUrls` en plural: **58 firmas en 100 ms**.
`firmarFotos` queda como está —cinco fachadas no justifican tocarlo— y el helper
nuevo documenta cuándo usar cuál.

Tap o click, **no hover**: en un celular el hover no existe.

##### La foto es de LA CAMPAÑA ELEGIDA, y eso hubo que probarlo

Con una campaña elegida, el thumb sale solo de esa campaña; sin campaña, la
última de cualquiera del alcance. El filtro es `idsDe(campanas, campanaId)` →
`.in('campana_id', …)`.

El caso que rompe es real: **25 PDV en dev y 23 en prod** tienen fotos de dos
campañas de la misma marca donde la de la OTRA es más nueva. Entrar a la campaña
de marzo y tocar San Martín traería la foto del 5 de abril.

**La primera versión del control replicaba el SQL, y por eso no servía.** Daba
verde, pero un control que REPLICA lo que dice verificar se queda verde el día
que los dos se separan — el mismo defecto que la sonda del mapa, que medía una
URL escrita a mano en vez de la del componente. La consulta se sacó de la server
action a `fotosCandidatas()` en `lib/fotos-mapa.ts`, y el control llama a las
mismas funciones que corren en producción.

Y si no hubiera datos para el caso, el script se reporta **NO VERIFICABLE** en
vez de verde: uno que no distingue un filtro que anda de uno que no existe no es
un control.

---

#### LOS HUECOS DE ESTE TRAMO QUE NINGÚN DATO EJERCITA

- **El camino firmado del thumb.** De los 58 PDV de Georgalos en prod, solo **2**
  salen firmados de Storage; los otros 56 van por el fallback a `url` (Drive y
  picsum del seed). O sea que `createSignedUrls` se ejercita sobre dos filas y el
  resto del tiempo el thumb llega por una rama que no toca Storage. Se estrena de
  verdad cuando suban fotos reales.
- **La rama "Todavía sin leer" de la alerta de quiebre.** Existe solo en dev
  (Biomega tiene 1 pregunta tipificada); en prod todas las distris dan 0.
- **Una numérica con DOS fuentes en el mismo mes y campaña.** El código las suma
  y recalcula el valor sobre la suma; hoy `declaracion_foto` solo alimenta
  Presencia, que es binaria, así que ese `if` no corre nunca.
- **Un total numérico sin desglose.** El `console.error` que lo declara no se
  disparó una sola vez con datos reales, y no debería: el `GROUPING SETS` lo
  garantiza. Está para el día que deje de garantizarlo.

---

#### PENDIENTE — el dashboard viejo de la distri

Qué sobrevive. Es la etapa 6 y lo único que queda del tramo.

#### PENDIENTE — "comercios que nadie tocó nunca", atado a la asignación

Es una alerta **distinta** de la anterior, y hoy **no se puede hacer**: no
existe asignación de comercios —quedó afuera de V1—, así que la pregunta no
tiene universo. La distribuidora no declara en ningún lado cuáles comercios le
interesan, y sin eso "nadie lo tocó nunca" no se distingue de "no es suyo".

No empezar sin que exista la asignación. Cuando exista, el universo es la lista
asignada y la alerta es la resta contra las misiones.

#### PENDIENTE — tramo propio: seguimiento visual por comercio

Va **después** de la etapa 6. Dos piezas, y ninguna es el panel de métricas.

**1. El mapa en campañas de seguimiento.** El punto deja de pintar presencia y
pinta **cobertura**: al día / va bien / atrasado, los mismos tres estados que ya
calcula el dashboard de cobertura. Y el número adentro del círculo son **las
visitas de la semana**, no la cantidad de comercios del grupo.

O sea que "cómo se pinta" gana una tercera opción **cuando la campaña es de
seguimiento**, sin sacar las otras dos.

Dos cosas a resolver antes de escribir:

- **El número del círculo cambia de significado.** Hoy un "3" quiere decir "tres
  PDV acá". Si pasa a ser visitas, la referencia de abajo tiene que decir cuál de
  las dos cosas está contando, o el mismo símbolo dice dos cosas distintas según
  una opción que está arriba.
- **"La semana" arrastra el pendiente de zona horaria.** El lunes empezaría a las
  21:00 del domingo y las visitas de esas tres horas contarían para la semana
  equivocada. Es lo mismo que la nota de "Etapa 5 de seguimiento — medir la
  semana" dice que hay que resolver antes de medir semanas.

**2. La línea de tiempo de fotos por comercio — 7b, RELEVADO el 24/9/2026.**

Pantalla nueva, que hoy no existe. Un local con varias visitas tiene varias
fotos, y lo que importa no es verlas sueltas sino **ordenadas**: muestran si la
góndola se mantiene o se degrada. Eso es lo que la distri le vende al cliente.

**El caso que la justifica:** una marca contrata una repositora para mantener sus
góndolas en las sucursales de una cadena. La campaña es de seguimiento, sin fecha
de fin — vive mientras dure el contrato. La repositora visita cada sucursal una o
dos veces por semana, hace check-in por GPS, saca la foto de la góndola y
contesta un par de preguntas.

Lo definido: fotos en línea horizontal con la fecha debajo; comparación lado a
lado **de dos que se eligen**, y la que más importa es **la última contra la
anterior** —lo que se detecta es la caída reciente, no la diferencia contra hace
tres meses—; pantalla nueva, no el mapa.

##### La unidad de la línea es LA VISITA, no la foto — DECIDIDO

Es lo que más cambia el diseño y sale de medir, no de suponer:

```
misiones con foto que dejan DOS fotos     DEV 70 de 172 (41%)   PROD 56 de 133 (42%)
```

"Cinco visitas, cinco fotos" es falso hoy en cuatro de cada diez misiones: una
campaña con dos campos `foto` —`Relevamiento snacks`, `Prueba de dos fotos`,
`Encuesta presencia Suprante`— deja dos por visita. Si la línea alinea fotos
crudas, la misma fecha aparece dos veces y **"la última contra la anterior"
compararía dos tomas de la misma visita**, que es justo lo que no se quiere ver.

**Cada punto de la línea es una VISITA con sus N fotos adentro, y la comparación
es visita contra visita.**

##### El tope es explícito y se dice; no se pagina — DECIDIDO

```
                                        DEV     PROD
fotos por comercio, máximo               13        4
  … promedio / mediana                  2,6/2    2,1/2
fotos por (comercio, campaña), máximo     6        2
visitas por (comercio, campaña), máximo   4        1
comercios con al menos una foto          93       90
```

Las ~50 del escenario de seis meses **no existen en ninguna base**. Va un tope
explícito, como el `TOPE_COMERCIOS` del mapa, y **se dice en pantalla el día que
muerda**. Recortar en silencio en una pantalla de evidencia es lo peor que se
puede hacer: **un hueco silencioso se lee como una visita que no se hizo.**

##### EL CASO QUE LA PANTALLA RESUELVE NO EXISTE — SE SIEMBRA PRIMERO

**Producción tiene CERO campañas de seguimiento.** Dev tiene cuatro, las cuatro
de prueba y las cuatro propias de una distri; la más grande —`[TEST] Reposición
semanal — cobertura`, 5 comercios y 10 misiones— tiene **cero fotos**. El único
fixture con una línea de verdad es `Dietetica LB` en `Seguimiento TEST 2V/Semana`:
4 visitas y 4 fotos, **todas entre el 16 y el 17 de septiembre**.

O sea que no hay un solo dato con el que se pueda mirar una degradación en el
tiempo, que es lo único que esta pantalla existe para mostrar. Es la misma
familia que los huecos del panel y del mapa: **cuando ningún dato real ejercita
el camino, el test es la única cobertura que hay.**

**`sembrar-seguimiento.mjs` no sirve tal cual y no hay que tocarlo.** Está
afinado para el dashboard de cobertura —las visitas están repartidas para dar los
tres estados y la frontera del domingo a las 22:00— y **no siembra ni una foto,
ni una respuesta, ni un bloque**: cero `INSERT INTO fotos`. Agregarle semanas a
un comercio le movería los estados al dashboard que vino a probar. Va un
hermano, con el mismo criterio: nombre `[TEST]` propio, se niega contra
producción, `--limpiar`, y guarda de "ya existe".

##### El alcance alcanza; el agujero está en la cabecera

`campanasDe` + `idsDe` + `fotosCandidatas` cubren las fotos: la lista ES el
permiso y una campaña ajena devuelve `[]`. **Las fotos están cubiertas.**

Lo que no: **la cabecera del comercio**. `panel_pdv` devuelve nombre, tipo,
lat/lng y localidad, **no `direccion`**, y la pantalla que hoy existe lee
`comercios` por id con service role y **sin un solo filtro**.

Y la mezcla es real, no teórica: **35 comercios en dev y 21 en prod aparecen en
campañas de más de un alcance.** El mismo local tiene evidencia de Georgalos y de
Suprante. Una pantalla por comercio que no se acote mostraría las dos juntas, que
es la violación más directa del Walled Garden que puede haber. **La pertenencia
se chequea contra `panel_pdv` del alcance, no contra `comercios`.**

##### Dónde vive: `comercio` en singular — DECIDIDO

```
/distribuidora/comercios/[id]   plural    EL PADRÓN     ubicación, validación, reportes
/distribuidora/comercio/[id]    singular  LA EVIDENCIA  la línea de visitas   ← nueva
/marca/comercio/[id]            singular  LA EVIDENCIA                        ← nueva
```

El singular contra el plural es lo que separa las dos preguntas, y **desde el
padrón va un link a la evidencia**, que es a donde alguien va a querer saltar
estando ahí. En marca no hay nada que distinguir: el panel de marca no tiene
ninguna ruta de comercios.

Las otras dos entradas ya tienen dónde colgarse: la lista del grupo del mapa
—cada PDV es una fila— y la tabla por comercio de `CoberturaSeguimiento`.

##### Lo que va al lado de la foto está todo

`misiones.capturada_at` sin un solo nulo (227 en dev, 140 en prod), el gondolero
con `nombre` y `alias` en el 100% —los paneles de empresa ya muestran los dos, a
diferencia del ranking del gondolero—, y `mision_respuestas` con 1,6 por misión
de promedio y 4 como máximo, que se formatea con `lib/resultados-normalizar.ts`.
Falta solo la etiqueta de cada pregunta, que sale de `bloque_campos`.

**La dirección falta en casi la mitad** —58 de 104 comercios en dev, 57 de 97 en
prod— y cuando falta **no se escribe nada**: ni un guión ni un "sin dirección".
La cabecera ya tiene el nombre y la ciudad, que alcanzan para saber cuál es, y un
renglón que dice que falta un dato es ruido en una pantalla que se mira por las
fotos.

##### Pendientes y rechazadas: la foto queda afuera, la VISITA no — DECIDIDO

`fotosCandidatas` filtra `estado = 'aprobada'` y así se queda: **una foto
pendiente todavía no es evidencia, y ponerla en una línea de tiempo la
convierte en una.** Son 13 pendientes y 12 rechazadas en dev, 1 y 3 en prod.

Pero el filtro es sobre la FOTO, no sobre la visita: **si una visita tiene solo
fotos pendientes, aparece igual** —con su fecha, su gondolero y sus respuestas— y
dice que la foto está en revisión. Sacarla entera haría desaparecer de la línea
una visita que se hizo, que es el mismo hueco silencioso del tope.

##### Agrupar por semana: no todavía

Con 4 visitas como máximo no hay nada que agrupar, y hacerlo **arrastra el mismo
pendiente de zona horaria** que la pieza 1. La línea va por visita, y el
agrupamiento por semana entra con el resto de "medir la semana", no antes.

##### LAS ETAPAS

| | Qué | Qué prueba, y cómo |
|---|---|---|
| 0 | El caso sembrado | `--limpiar` deja la base con los mismos conteos que antes |
| 1 | `lib/linea-comercio.ts`, sin base | los controles se ponen rojos contra cada rotura |
| 2 | La consulta y el permiso | un comercio de dos alcances trae solo el elegido |
| 3 | La pantalla y las dos rutas | la línea se mira con el caso de la etapa 0 |
| 4 | La comparación de a dos | el par elegido viaja en la URL |
| 5 | Los tres links de entrada | se llega desde el mapa, la cobertura y el padrón |

**Etapa 0 — el caso sembrado.** Hermano de `sembrar-seguimiento.mjs`, sin
tocarlo. Un comercio con visitas repartidas en seis semanas, con foto de verdad
**subida a Storage** y no una URL de picsum: hoy solo **2 de los 58 PDV** de
Georgalos en prod ejercitan `createSignedUrls`, así que sembrar por el fallback
dejaría el camino firmado sin probar otra vez. Van adentro los cuatro casos que
las etapas siguientes necesitan: una visita con DOS fotos, una con **solo fotos
pendientes**, una `descartada` que no tiene que aparecer, y respuestas por visita.

**Etapa 1 — la lib, sin base.** El armado de visitas desde misiones y fotos, el
orden por `capturada_at` con el `COALESCE` y el desempate estable, el tope que
devuelve *cuántas recortó* en vez de recortar callado, la visita en revisión, y
el par por default —última contra anterior—. Se verifica con roturas
deliberadas, como todo el resto del tramo: el tope silencioso, la visita
pendiente descartada, el orden por `created_at` y el default puesto en
primera-contra-última.

**Etapa 2 — la consulta y el permiso.** Las visitas de un comercio acotadas al
alcance, con gondolero y respuestas, y la pertenencia contra `panel_pdv`. El
control que la justifica ya tiene datos: **35 comercios en dev y 21 en prod**
están en campañas de más de un alcance, así que se puede probar que pedir con el
alcance de Georgalos no devuelve una sola visita de Suprante — **y el CONTROL de
que sin el filtro sí las devolvería**, o el test no distingue un filtro que anda
de uno que no existe.

**Etapa 3 — la pantalla y las dos rutas.** `components/panel/linea-comercio.tsx`
montado por las dos, como el mapa. Distri con el selector de alcance
obligatorio; marca sin él. Las firmas van **en el render** y no en una server
action: acá la pantalla ES las fotos, así que se van a ver todas, y el argumento
del mapa —firmar 58 para que miren tres— no aplica.

> **Lo único abierto de esta etapa:** sin campaña elegida la línea mezcla
> campañas, y comparar la foto de una auditoría de precios con la de una
> reposición es comparar dos cosas que se sacaron para fines distintos. La
> propuesta es que **cada visita lleve el nombre de su campaña**, como la
> etiqueta de fuente del desglose, y que la mezcla se vea en vez de prohibirse.

**Etapa 4 — la comparación de a dos.** Default última contra anterior, con los
dos elegibles, y el par en la URL: mismo criterio que el desglose de la serie y
los dos controles del mapa. **La comparación que va a un informe se tiene que
poder mandar por chat.**

**Etapa 5 — los tres links.** Desde la lista del grupo del mapa, desde la tabla
de `CoberturaSeguimiento` y desde el padrón. Van al final porque un link a una
pantalla que no existe es un link roto.

##### PENDIENTE — el delta entre las dos visitas comparadas

El comparador muestra las respuestas de cada lado, así que los dos números
quedan uno al lado del otro —22 frentes contra 5— pero **nadie los resta**.

Decidido el 24/9/2026 que no va por ahora, y el argumento es el que lo va a
seguir frenando: con dos números al lado **la resta la hace el ojo**, y
calcularla obliga a decidir qué se resta contra qué. La línea mezcla campañas a
propósito, así que el par comparado puede tener a un lado el precio de una
auditoría y al otro los frentes de una reposición: restar eso da un número que
no describe nada, igual que el promedio entre campañas que la etapa 3 del tramo
del panel tuvo que sacar.

Si algún día se hace, el matcheo es por pregunta y **dentro de la misma
campaña**, nunca entre dos.

##### PENDIENTE — la vista de lista de varias sucursales

Con 200 sucursales entrar de a una no sirve, y es cierto. Pero hoy el alcance más
grande son **66 PDV en dev y 59 en prod**, y esa vista contesta otra pregunta:
**"¿cuál de mis sucursales se está cayendo?"**

**La pregunta abierta, que hay que contestar antes de escribirla: qué la
ordena.** No es un detalle de presentación — es la vista entera. Ordenar por
última visita responde "¿a quién no fuimos?", que es cobertura y ya está
cubierta. Ordenar por caída responde la pregunta de arriba, pero **hoy no existe
ninguna medida de "se cayó"**: haría falta derivarla de la métrica de la campaña
entre la última visita y la anterior, y eso es más trabajo que la pantalla.

Va después, con el caso real adelante y no antes.

#### Los dos bugs del control de pintado (25/9/2026) — los dos eran de CABLEADO

Reportado así: con Georgalos y `[TEST] Reposición diaria` elegida, tocar
"Cobertura semanal" recargaba, volvía a Presencia y **la opción desaparecía**.

Eran **dos bugs apilados**, y cualquiera de los dos solo produce ese síntoma.

**Bug 1 — la base sobre la que se mergeaba, no el merge.** La pregunta era si el
control de pintado usaba la misma función que el de campaña. **Sí la usaba, y
`hrefMapa` estaba bien.** Lo que estaba mal era lo que se le pasaba: la página
montaba la pantalla con

```tsx
rutaBase={hrefMapa(RUTA, { alcance: searchParams.alcance })}   // sin la campaña
```

El control de campaña andaba porque **pone** `campana` explícito; el de pintado
mergeaba sobre una base que nunca la había tenido. Una función de merge no puede
conservar lo que su base no trae.

**Y esto no lo trajo el tramo 7a: viene de `029ef33`**, la etapa 4 del tramo
anterior. Cambiar Presencia↔Tipo con una campaña elegida viene perdiéndola desde
entonces, y **era invisible porque perder la campaña solo ensancha el mapa**: se
ven más puntos, ninguno falta, nada dice que el filtro se cayó. Se hizo visible
recién cuando apareció un modo que **no existe** sin campaña.

**Bug 2 — el parseo, que nadie actualizó.** Las dos páginas tenían, a mano:

```ts
const pintar: ModoPintado = searchParams.pintar === 'tipo' ? 'tipo' : 'presencia'
```

O sea que `?pintar=cobertura` se convertía en `'presencia'` **antes de llegar al
componente**. Este solo ya produce el síntoma completo, y habría seguido ahí
aunque el link se arreglara.

##### Cómo quedó

| | |
|---|---|
| `hrefDelMapa(ruta, estado, cambio)` | recibe el estado **completo**, así ningún llamador puede omitir una clave. `presencia` y los vacíos BORRAN su parámetro |
| `modoDesde(valor)` | deriva de `CATEGORIAS`: agregar un modo no puede dejar un parser viejo |
| `PantallaMapa` | recibe la ruta **pelada** y arma el `EstadoDelMapa` adentro. Los dos controles salen del mismo estado |
| El fallback | ahora **loguea** qué descartó y por qué |

`hrefMapa` se queda: lo usan la línea de comercio y las pantallas de evidencia,
donde la base sí es la ruta actual.

##### Lo que el fallback silencioso hacía, que es lo peor de los dos

Descartar `pintar=cobertura` sin decir nada hace que un bug **parezca un cambio
de opinión de la pantalla**: el usuario toca una opción, la pantalla vuelve sola
a otra cosa y la opción se va. No hay error, no hay log, no hay nada que
reportar salvo "se comporta raro". Ahora:

```
[mapa] se pidió pintar=cobertura y se descartó: campaña=…, alcance=…
```

##### LA LECCIÓN, QUE NO ES EL BUG

`probar-mapa-pdv.ts` cubre `hrefDelMapa` y `modoDesde` sueltas, y le agregué 12
controles de regresión. **Medido: contra el bug 1 puesto a propósito, esa suite
se queda ENTERA EN VERDE.** No es una falla de los controles — el error nunca
estuvo en las funciones, estuvo en **quién las llama y con qué**.

Y mi propio `ver-mapa-cobertura.mts` tampoco podía verlo: llama a las libs
directo y **nunca parsea una URL**, así que el bug 2 le pasaba por al lado.

Es el tercer caso de la misma familia en este proyecto:

| | La función | El llamador |
|---|---|---|
| `rutaEvidencia` | andaba | le pasaba `'distribuidora'` en vez de `'distri'` |
| La sonda del mapa | andaba | medía una URL escrita a mano, no la del componente |
| `hrefDelMapa` | andaba | mergeaba sobre una base incompleta |

> Cuando una lib es correcta y el bug está en el cableado, **el único test que
> sirve es el que rinde la pantalla y mira lo que sale**.

`scripts/probar-links-mapa.mts` hace eso: rinde `PantallaMapa` con
`renderToStaticMarkup`, parsea el `?pintar=` con la MISMA `modoDesde` que la
página, y lee los `href` de verdad. **Verificado que muerde**: 3 rojos contra el
bug 1 y 3 contra el bug 2, reproducidos uno por uno.

```bash
npx tsx --tsconfig scripts/tsconfig.render.json scripts/probar-links-mapa.mts
```

##### El tercero, al día siguiente: la cabecera de la lista

Con el mapa en cobertura, la lista del grupo encabezaba **"4 PDV · 4 sin
medir"** mientras el tooltip del MISMO grupo decía "4 PDV · 1 al día · 3
atrasado" y las filas mostraban las visitas de la semana. Los cuatro tenían
visitas y estado: la cabecera afirmaba que no se había medido ninguno, que es
lo contrario de lo que el modo existe para mostrar.

Una línea:

```tsx
<p …>{textoGrupo(abierto)}</p>        // sin el modo
```

El tooltip la llamaba con `pintar` y la cabecera no. **Misma familia que los
dos de ayer: la función andaba, el llamador le pasaba de menos.**

##### Lo que lo dejó pasar fue el DEFAULT de la firma

```ts
export function textoGrupo(g: GrupoMapa, modo: ModoPintado = 'presencia')
```

Ese `= 'presencia'` hace que olvidarse del modo **compile** y devuelva texto de
presencia. Medido con el bug repuesto a propósito:

```
tsc --noEmit            sin una sola queja
probar-mapa-pdv.ts      ✓ Todo como se esperaba.
```

**Invisible por los dos lados.** Y el test no era malo: ya afirmaba
`textoGrupo(g, 'presencia') === '4 PDV · 4 sin medir'` — la cadena exacta que
se veía en pantalla. El test tenía razón; el llamador no.

El default se sacó de las **tres** que toman modo —`textoGrupo`, `anilloGrupo`
y `colorPunto`; `repartoDe` ya lo exigía— así que olvidarlo pasó a ser un error
de compilación:

```
components/panel/mapa.tsx(296,65): error TS2554: Expected 2 arguments, but got 1.
```

Las seis llamadas de un argumento que había en `probar-mapa-pdv.ts` eran todas
legítimamente de presencia y ahora lo dicen. **Un test que no nombra el modo
que está afirmando tampoco lo está afirmando.**

> **La regla que sale de los tres bugs juntos:** un parámetro que selecciona
> QUÉ SIGNIFICA lo que devuelve la función no lleva default. El default lo
> convierte en opcional para el compilador y en obligatorio para la verdad, y
> esa diferencia se paga en pantalla. Los defaults de comodidad —un `tope`, una
> `separacionPx`— no tienen este problema: equivocarse ahí se ve.

##### Por qué esto no lo cubre `probar-links-mapa.mts`

La lista del grupo vive detrás de estado de cliente (`abierto`, que arranca en
`null`), así que `renderToStaticMarkup` no la alcanza: el script rinde la
pantalla pero nadie tocó un grupo. **Acá la cobertura es el tipo**, y está
medida arriba.

Lo que sí se agregó a `probar-mapa-pdv.ts` son los dos controles para el caso
que el tipo NO cubre —que alguien escriba el texto a mano en el modo
equivocado—: en cobertura el texto no usa ni una palabra de presencia, y al
revés.

#### PENDIENTE — el techo de 1.000 filas de PostgREST sobre la cobertura

**Ya existe hoy, no lo trae el mapa.** El dashboard de cobertura se calcula
sobre TODAS las misiones de la campaña, que `lib/resultados.ts` trae con:

```ts
.from('misiones').select('…').eq('campana_id', campanaId)
```

Sin `.range()` ni `count`, así que PostgREST corta en **1.000 filas** y no lo
dice. **Verificado contra dev el 24/9/2026**, no supuesto: una consulta sin
`.limit()` sobre una tabla de 8.500 filas devuelve exactamente 1.000. Pasado ese punto la cobertura se calcularía sobre una muestra —siempre las
mismas 1.000, sin orden declarado— y el número saldría más bajo sin que nada
falle. **Es el corte silencioso de siempre**, en la pantalla por la que la
distribuidora cobra.

Al 24/9/2026 no muerde: la campaña más grande de las dos bases tiene **56
misiones**. Pero la aritmética del caso que el tramo 7b vino a servir lo cruza
sin esfuerzo: una campaña de seguimiento de seis meses con 200 sucursales y dos
visitas semanales son **~10.000 misiones**, o sea diez veces el techo.

Y el mapa pintando cobertura (tramo 7a) va a leer las mismas filas, así que
hereda el techo: no lo agrega, lo hace más visible.

**Lo que hay que decidir cuando se agarre**, y no es solo paginar:

- Si se pagina, la cobertura pasa a necesitar todas las páginas igual —el
  cálculo es sobre el total—, así que el arreglo real es **agregar en SQL** y no
  traer las filas. Sería una función como `panel_pdv` pero por semana.
- Y ahí aparece la tensión del tramo 7a: **la semana es una definición de
  `lib/fecha-ar.ts`**, y moverla a SQL sería la segunda definición de "la
  semana". Si se agrega en la base, la semana tiene que entrar como PARÁMETRO
  calculado en TypeScript, no calcularse adentro con `date_trunc`.
- Mientras tanto, lo barato y honesto es pedir el `count` exacto y **avisar en
  pantalla** cuando la campaña pasa el techo, en vez de mostrar un porcentaje
  sobre una muestra sin decirlo.

Anotado el 24/9/2026, relevando el tramo 7a.

#### TRAMO PROPIO — filtro de provincia en los paneles de marca y distri

Anotado el 25/9/2026, **con el diseño ya decidido** (ver abajo). Sin empezar.

**Por qué.** Una campaña nacional da resultados en varias provincias y hoy el
panel muestra las ciudades sin agrupar. La marca piensa primero por REGIÓN
—"cómo estoy en el Litoral"— y después baja a ciudad.

**Definido:**

- **Selección múltiple, no una sola.** Las regiones comerciales no coinciden con
  las provincias: Mesopotamia es Entre Ríos, Corrientes y Misiones, y **esa es
  la unidad con la que se decide**. Un selector de a una obligaría a mirar tres
  pantallas y sumar a mano, que es justo lo que el filtro viene a evitar.
- Si hay una sola provincia en los datos, que aparezca esa y ya.
- Aplica a **los tres**: la cobertura por ciudad, el mapa y la serie.

##### Lo medido el 25/9/2026, que reordena las prioridades

```
                               DEV                          PROD
panel_pdv devuelve provincia?  NO (devuelve localidad)      NO
cadena localidad→depto→prov    intacta: 0 huérfanos, 24 provincias (las dos)
comercios sin localidad        13 de 104                    6 de 97
```

Por alcance, que es como se mira el panel:

```
DEV                              PDV   sin localidad   provincias
  Suprante SRL                    31         8              2
  ACME S.A.                       27         1              2
  Georgalos S.A.                  67        11              1
  propias de Biomega              14         9              1
  propias de Distribuidora DV      9         9              0   ← ninguno filtrable
PROD
  ACME S.A.                       22         0              2
  Georgalos S.A.                  59         3              1
  Suprante SRL                    26         3              1
```

**Tres cosas que salen de ahí y no se ven leyendo el código:**

**1. La rama "una sola provincia" es el caso NORMAL, no el borde.** Cinco de los
ocho alcances tienen una sola provincia, incluido Georgalos, que es el piloto y
el más grande. **El filtro llega dormido para la mayoría**, igual que la
cobertura del 7a. Eso no lo invalida —se construye para la campaña nacional que
todavía no existe— pero sí decide por dónde empezar: la rama de una provincia es
la que va a correr, así que tiene que ser la que mejor se vea, y no un caso
degenerado del selector múltiple.

**2. El peor caso es mucho peor que Georgalos.** El hueco se planteó como "9 de
65 en Georgalos"; medido da 11 de 67 ahí, pero **"propias de Distribuidora Del
Valle" tiene 9 de 9 sin localidad: cero provincias**. Con un filtro puesto ese
alcance queda **completamente vacío**, y "propias de Biomega" pierde el 64%. Un
alcance que se vacía entero no se lee como un filtro estricto, se lee como
"no hay datos". Así que el aviso de excluidos no es un detalle de cortesía: es
lo único que separa un filtro de una pantalla rota.

> La diferencia entre 9 y 11 probablemente sea de scope —esta medición cuenta
> sobre todas las misiones y `panel_pdv` excluye algunos estados—. Al agarrar el
> tramo, **el número que vale es el que devuelve `panel_pdv`**, no éste.

**3. Derivar la provincia no pierde ni una fila** *de las que tienen localidad*:
cero localidades sin departamento y cero departamentos sin provincia, en las dos
bases. O sea que el único agujero es el de arriba, y no hay un segundo.

##### A resolver cuando se agarre

- **`panel_pdv` NO trae la provincia** —verificado contra las dos bases, devuelve
  `localidad_id` y `localidad_nombre`—, así que hay que ampliarlo o resolverla
  aparte. **Ojo con la tentación del embed:** `localidades.provincia_id` NO
  EXISTE (ver la nota del dump pre-incidente); la cadena real es
  `comercio → localidad → departamento → provincia`, cuatro niveles, y
  `lib/resultados.ts` ya decidió cortarla en dos consultas en vez de anidar.
  Ampliar `panel_pdv` es lo más probable, porque el mapa y la cobertura ya salen
  de ahí y una segunda fuente sería una segunda definición de "en qué provincia
  está este PDV".
- **Los comercios sin localidad quedan afuera de cualquier filtro por
  provincia**, y con el filtro puesto desaparecen sin decir nada — el mismo
  problema que el mapa ya resuelve declarando los que no puede dibujar. La
  salida es la misma: **decirlo**, con el número.
- **El aviso tiene que distinguir dos cosas que no son iguales:** "tu filtro
  excluyó 12 PDV" y "8 PDV no tienen ciudad cargada, así que ningún filtro los
  alcanza". La primera es una consecuencia de lo que el usuario eligió; la
  segunda es un hueco de datos que él no produjo y que puede ir a arreglar.

##### DECIDIDO el 25/9/2026 — el múltiple alcanza, la región NO se modela

**Las regiones comerciales varían por industria y por empresa: "Litoral" no
significa lo mismo para dos marcas.** Modelarlas obliga a definir quién las
define —GondolApp para todos, o cada marca las suyas— y eso es una ABM entera,
con su pantalla, sus permisos y su mantenimiento. Con 24 provincias, tildar tres
no es fricción real.

**Lo que resuelve el caso práctico es que la selección viaje en la URL.** El que
arma Mesopotamia una vez guarda el link y lo comparte, igual que el desglose del
panel y los dos controles del mapa. La región no hace falta modelarla si se
puede mandar por chat.

**Cuándo se justifica volver:** si alguien pide **guardar** regiones con nombre.
Ahí la URL deja de alcanzar —un link no tiene nombre ni aparece en una lista— y
recién entonces el modelo se paga solo. Mientras el pedido sea "quiero mirar
estas tres juntas", es un link.

##### La consecuencia técnica de que viaje en la URL

Sería **el primer parámetro MULTIVALUADO del estado en URL de este proyecto**, y
la plomería de hoy no lo contempla:

```ts
EstadoDelMapa = { alcance?, campana?, pintar? }     // todo escalar
hrefMapa(...)  →  q.set(k, v)                        // un valor por clave
```

`q.set` pisa; para varias provincias hace falta `delete` + `append`, o un
escalar con separador. Y `hrefDelMapa` pide el estado completo **a propósito**
—es lo que arregló los dos bugs del 25/9— así que la clave nueva tiene que
entrar ahí y no por un costado, o vuelve el control que se come el filtro del
otro.

**La trampa propia del multi-select, que no tienen los escalares:** con un
escalar, ausente significa "el default". Con una selección múltiple, **ninguna
tildada es ambiguo**: puede querer decir "todas" (sin filtro) o "ninguna"
(pantalla vacía). Hay que elegir una y que la URL la exprese sin ambigüedad —
lo más parecido a lo que ya hay es que la ausencia del parámetro sea "todas" y
que no exista forma de escribir "ninguna", igual que `pintar=presencia` no se
escribe nunca.

##### Los tres hallazgos, confirmados

1. **La rama de una sola provincia tiene que verse bien**, no ser un caso
   degenerado del selector. Es el caso normal hoy: 5 de 8 alcances.
2. **El aviso de excluidos no es cortesía.** Un alcance que se vacía entero
   —los 9 de 9 de Del Valle— se lee como "no hay datos", no como un filtro
   estricto.
3. **El número que vale es el de `panel_pdv`**, no el de misiones.

##### Y una relación que conviene no perder

`lib/panel-metricas.ts` ya tiene `agruparCobertura`, que trabaja **sobre una
lista de claves y no sobre ciudades**. Agrupar por provincia probablemente sea
pasarle otra clave, no escribir una segunda agrupación — igual que
`tramosContinuos` quedó genérico para el día que haya semanas.

#### TRAMO PROPIO — `localidad_id` en el alta de comercio

Relevado y decidido el 25/9/2026. Sin empezar. **Bloquea el filtro de
provincia**, que no puede cortar por una geografía que la mitad de los comercios
nuevos no tiene.

**El agujero.** Ni `crearComercioNuevo` ni `crearComercioParaCaptura` escriben
`localidad_id`. Los dos escriben `zona_id`, de la tabla vieja `zonas`, y el
segundo lo elige con `.limit(1)` **sin ningún filtro**: una zona arbitraria.

La correlación es **perfecta y sin una sola excepción en las dos bases**:

```
localidad_id IS NULL = false,  zona_id IS NOT NULL = false   →  91
localidad_id IS NULL = true,   zona_id IS NOT NULL = true    →  13 dev / 6 prod
```

O sea que `zona_id IS NOT NULL` **es el marcador exacto** de "pasó por el
agujero". No hace falta heurística para encontrarlos. Cargan **102 misiones en
dev y 11 en prod**, así que no son descartables.

##### El diseño, que cambió dos veces y por qué

**Primera versión: preguntarle al gondolero en el alta.** Se cayó con un dato:
**la dirección y los demás campos del alta son OPCIONALES y no los cargan.**
Sumar un selector obligatorio es trabajo que no van a hacer, y la adopción vale
más que el dato. **No hay selector en el alta. Cero fricción.**

**Segunda: resolverlo en el servidor por reverse geocoding, y lo que no resuelva
cae en la bandeja de pendientes de la distri**, que ya existe y ya es donde
alguien los mira. Ahí va el cascader, con una persona sentada.

**Tercera y definitiva: el geocoding SUGIERE, no escribe.** Lo decidió esta
medición contra verdad de referencia — 91 comercios tienen localidad asignada
desde el CSV del piloto, así que se puede medir la precisión en vez de suponerla:

```
COINCIDE   8 de 12   (67%)
DISTINTO   1         ← Gualeguaychú resolvió a "Larroque"
ambiguo    1         ← Colón
sin dato   2         ← General Campos, Villaguay
```

**Ese 8% que resuelve DISTINTO es lo que decide.** Un dato malo que entra como
bueno es peor que un hueco, porque el hueco se ve: un comercio con la localidad
equivocada no cae en ninguna bandeja y **envenena justo el filtro de provincia
que este tramo existe para habilitar**. Uno de cada doce.

Así que el servidor guarda la **sugerencia**, el comercio entra igual a la
bandeja —donde ya iba— con la localidad precargada y a un clic de confirmar. El
costo marginal es cero: la distri ya abre ese comercio para validarlo.

##### Nominatim queda descartado — política, no volumen

```
rate                  máximo absoluto 1 request/segundo
sistemáticas          "strictly forbidden and will get you banned"
uso comercial         solo si el geocoding NO es la función central;
                      quien lo tenga como núcleo debe operar su infraestructura
User-Agent            obligatorio (el código actual sí cumple)
resultados            "must be cached on your side"
```

**El volumen no era el problema**: el pico medido es de **4 altas por día** en
las dos bases. Lo que no se banca es un servicio comunitario gratuito, sin SLA y
con baneo discrecional, en el camino principal de una app **comercial** — el
mismo argumento por el que ya se descartaron MapTiler y Stadia para las tiles.

**Va Geoapify**, que ya está adentro y ya fue vetado: 3.000 créditos/día, 5
req/s, uso comercial permitido en producción, límites *soft*. A 4 altas/día son
4 créditos de 3.000; una tile cuesta 0,25, así que una sesión de mapa gasta más
que un mes de geocoding.

> **PRECONDICIÓN DE LA ETAPA 4 — mirar el panel de Geoapify ANTES de escribirla.**
> `NEXT_PUBLIC_GEOAPIFY_KEY` está pensada para el browser y puede tener
> restricción por dominio. **Una llamada desde el servidor no manda Referer**, así
> que rebotaría. Si está restringida, la salida es **una segunda key en el MISMO
> proyecto**, sin restricción de dominio o restringida por IP.
>
> Confirmado en la documentación de Geoapify: se pueden crear varias keys por
> proyecto, y **la cuota es del proyecto**, no de la key — o sea que la segunda
> comparte los 3.000/día. Y el límite que no se cruza: crear **cuentas o
> proyectos** separados para repartir el uso **viola sus T&C**. Varias keys en un
> proyecto sí; un segundo proyecto para duplicar cuota, no.
>
> La key **no está en los `.env` locales**, vive solo en Vercel, así que esto no
> se puede descubrir probando desde acá.

##### El padrón tiene filas duplicadas, y eso rompe el match

`localidades` no tiene coordenadas: el match es **por nombre**. Y hay **99
nombres repetidos entre provincias** más **64 repetidos DENTRO de la misma
provincia**, donde la provincia ya no desambigua.

Peor: **el `county` del proveedor no es nuestro departamento.** Para Colón,
Nominatim devuelve `"Distrito Primero"`, que es una división sub-departamental
entrerriana. El departamento —el desambiguador natural de esos 64— **no matchea
nuestro vocabulario**.

Medido sobre los 19 huérfanos reales: **0 exactos, 18 ambiguos, 1 sin dato**. Los
18 están en Colón, y el padrón tiene `Colón` **dos veces** en Entre Ríos.

**La etapa 1 se achicó a propósito.** De los 64, solo 13 son entrerrianos y solo
**Colón** bloquea algo real:

```
Entre Ríos · Colón
   id   1   depto Colón      12 comercios · 3 campañas · en el CSV del piloto
   id 126   depto Uruguay     0 · 0 · 0
```

Los otros 12 entrerrianos están vacíos en las dos bases y **ninguno figura en el
CSV del piloto**. Los 51 de provincias sin actividad quedan como **deuda del
padrón**, no como prerrequisito.

Dos razones para no hand-adjudicar los 64, y la segunda es la que vale:

1. Verificar si "Bella Vista" en Malvinas Argentinas y en San Miguel son dos
   lugares o una fila duplicada es geografía que **no se puede afirmar sin
   consultarla**, que es la regla que este proyecto ya pagó tres veces.
2. **La etapa 2 tolera duplicados por diseño**: ante ambigüedad no adivina, y el
   comercio cae en la bandeja con la sugerencia vacía. Un duplicado en Santiago
   del Estero degrada a "lo confirma una persona", que es seguro.

> Ojo con un espejismo del relevamiento: en dev, `Caseros` y `Colón` parecían
> tener datos **de los dos lados**. Son cuatro filas de `gondolero_localidades`
> del **mismo gondolero**, que eligió las dos variantes de cada una. Eso no
> prueba que haya dos pueblos: es el síntoma del duplicado, porque en pantalla se
> ven idénticos. Producción, que tiene esa tabla vacía, da la señal limpia.

##### La etapa 1 resuelve SOLO Colón (migración `20260930100000`)

Es el único de los 64 con **evidencia dura** de cuál de los dos sobra:

```
id   1  depto Colón     12 comercios · 3 campañas · 11 filas del CSV del piloto
id 126  depto Uruguay    0 · 0 · 0
```

Y una **segunda señal independiente que coincide**: el departamento se llama
igual que la localidad. Ese patrón aparece en **17 de los 64** pares, y Colón es
el único de esos 17 que además tiene datos, así que los dos criterios apuntan al
mismo id sin depender uno del otro.

**Los otros 63 quedan como deuda del padrón** — los 12 entrerrianos y los 51 de
otras provincias. Ninguno tiene comercios ni campañas en ninguna de las dos
bases, así que decidir cuál sobra sería adivinar geografía sin consultarla.

> **PISTA para quien los revise con una fuente, NO diagnóstico.** Entre los 12
> entrerrianos hay dos regularidades que pueden ser un error sistemático del
> seed o pueden ser homónimos legítimos: en **cinco** pares uno de los dos
> departamentos es **Paraná** (Aldea Santa María, Cerrito, Ramírez, Sauce
> Montrull), y en **dos** aparece **Islas del Ibicuy** contra Gualeguay (Médanos,
> Villa Paranacito). Ninguno de los 12 tiene departamento auto-nombrado, así que
> la heurística de arriba no los alcanza.

**Y por qué no bloquean nada:** la etapa 2 **no adivina ante ambigüedad**. Un
duplicado hace que el geocoding devuelva `ambiguo`, el comercio cae en la bandeja
con la sugerencia vacía y **lo confirma una persona**. Eso es seguro; lo
inseguro sería lo contrario — elegir uno al azar y escribirlo como bueno.

##### Lo delicado de la migración fue el CASCADE

De las tres FK que apuntan a `localidades`, dos son `NO ACTION` —`comercios` y
`campana_localidades`, que por eso hacen fallar solas un borrado con datos— pero
**`gondolero_localidades` es `ON DELETE CASCADE`**. Un `DELETE` pelado le borra
la zona declarada a un gondolero **sin decir nada**.

En dev existe exactamente ese caso: un gondolero eligió **las dos** variantes de
Colón, porque en pantalla se ven idénticas — que es el síntoma del duplicado, no
evidencia de dos pueblos. Por eso la migración **repunta antes de borrar**, con
`ON CONFLICT DO NOTHING` (la PK es `(gondolero_id, localidad_id)` y ya tiene la
buena, así que colisionaría).

`scripts/probar-migracion-colon.mjs` — dry-run en transacción con `ROLLBACK`,
verde contra **dev y producción**. Lo que prueba, en orden:

1. **Que no se pierda la zona de nadie** — los mismos gondoleros siguen teniendo
   Colón después, sin duplicados y sin huérfanas.
2. **Que no se borre el bueno** — los comercios y las campañas siguen enteros.
   Verificar una sola dirección dejaría pasar el borrado inverso.
3. **Que sea idempotente** — la segunda corrida sale por el `RETURN` y no borra
   de más.
4. **Que la precondición muerda** — se le cuelga un comercio a la fila que iba a
   borrarse y se espera la excepción. Una precondición que nadie ejercitó puede
   estar mal escrita sin que se note.

> El control 4 necesitó un `SAVEPOINT`: la excepción aborta la transacción
> entera, y sin él todo lo que viene después falla con *"current transaction is
> aborted"* — el script reportaría un defecto propio como si fuera de la
> migración. Pasó en la primera corrida.

##### La precondición de la etapa 4 valió la pena: la key del browser SÍ rebotaba

`NEXT_PUBLIC_GEOAPIFY_KEY` tiene **Allowed HTTP Origins** con los dos dominios
del deploy. Una llamada desde el servidor no manda Origin ni Referer, así que
habría rebotado con 401/403 — y el síntoma habría sido "el geocoding no anda",
no "la key está restringida".

Quedó `GEOAPIFY_SERVER_KEY`: **segunda key del MISMO proyecto**, sin ninguna
restricción, en Vercel (los dos proyectos) y en los dos `.env` locales. Comparte
la cuota de 3.000/día, que es lo correcto — un segundo *proyecto* para duplicar
cuota viola los T&C de Geoapify.

##### Lo medido con el proveedor que se usa de verdad

Hasta acá la precisión estaba medida con **Nominatim**, que es el que se
descartó. Con Geoapify y el padrón ya limpio, contra verdad de referencia:

```
exacto 9 · ambiguo 0 · fuera 0 · sin_dato 3 · error 0
de los 9 exactos:  COINCIDE 8 · DISTINTO 1   (11% mal)
```

Y sobre los comercios que hoy no tienen localidad: **13 de 13 exacto**. Antes de
la etapa 1 eran **0 exactos y 18 ambiguos**. Ese salto es lo que hizo la
migración de Colón, medido y no supuesto.

**El caso DISTINTO sigue siendo el mismo con los dos proveedores**: un comercio
de Gualeguaychú resuelve a "Larroque". Que se repita con Geoapify confirma que
no es una rareza del proveedor —probablemente el GPS del comercio esté cerca de
Larroque— y que ninguna lógica lo va a detectar. Sostiene la decisión: es una
SUGERENCIA.

`scripts/medir-geocoding.mts` deja la medición repetible, con `--prod` y
`--sin-loc`.

> **La primera versión de esa medición dio un resultado FALSO** y decía que
> Concordia estaba fuera del padrón. Reimplementaba el matching a mano y
> normalizaba los acentos del parámetro contra nombres acentuados de la base.
> Es el tercer caso del mismo defecto —la sonda del mapa, el control del thumb—:
> **un script que reimplementa lo que dice medir, mide otra cosa.** Ahora llama
> a `resolverLocalidad`, la que corre en producción.

##### Dónde va la llamada, y por qué inline

`lib/localidad-sugerida.ts`, y la llaman **los dos** caminos de alta —
`crearComercioNuevo` y `crearComercioParaCaptura`— con la misma línea. Dos
copias de esto sería garantizar que el día que se corrija una, la otra quede
vieja en silencio, que es la lección de `registrarMision`.

Va **inline y después del insert**, no en background. `unstable_after` existe en
Next 14.2 pero es experimental y obliga a tocar `next.config`, y esto no puede
romper un alta. Inline con timeout de 4 s es más simple y el upload de la foto
de fachada ya domina la latencia.

**Falla abierto siempre.** La función no lanza nunca y corre con el comercio ya
guardado: un proveedor caído, sin cuota o lento no puede voltear un alta con el
gondolero parado en la puerta. Lo peor que pasa es que quede sin sugerencia y lo
resuelva una persona, que es el camino que igual existe.

##### El padrón se trae por nombre, y los acentos son un límite conocido

No se trae entero **a propósito**: 941 filas entran hoy bajo el techo de 1.000
de PostgREST, pero ese techo **no avisa**, y este padrón está pensado para
crecer — la cola de "fuera del padrón" existe para eso. Un `select` que un día
devuelva 1.000 de 1.200 daría sugerencias equivocadas sin que nada falle.

La base **no tiene la extensión `unaccent`** y **246 de las 941 localidades
llevan acento o ñ**, así que el filtro es case-insensitive pero no
accent-insensitive. No se tapa con variantes inventadas porque **el modo de
falla ya es seguro**: sin la fila, la resolución da `fuera` y el comercio va a
la bandeja. Se degrada a trabajo manual, nunca a un dato equivocado. Medido con
`lang=es`, Geoapify devuelve los nombres acentuados y el caso no aparece.

##### Probado donde duele

`scripts/probar-localidad-sugerida.mts` — el camino COMPLETO contra dev: red,
padrón y escritura. Crea comercios de prueba, los geocodifica y los borra,
verificando que no quede ninguno.

Existe porque `probar-geocoding.ts` cubre la decisión pero **no puede cubrir el
cableado**: que la key sea la correcta, que el padrón llegue con los acentos
bien, que el CHECK acepte lo que la lib produce, y que un fallo no voltee nada.
Es el hueco exacto que costó los dos bugs del 25/9.

Los cuatro controles: un punto en Colón resuelve exacto **y NO toca
`localidad_id`**; un punto en el mar queda `sin_dato`; **sin key no lanza y deja
`error`** —que no es `sin_dato`, y esa diferencia es la que permite reprocesar—;
y una coordenada imposible tampoco voltea nada.

##### La etapa 5: la bandeja confirma, y el cascader quedó en UN lugar

`/distribuidora/comercios/pendientes` gana una columna **Localidad**. Con
sugerencia exacta es **un clic**; los demás estados abren el cascader.

**Un hook y no un componente compartido** (`components/shared/cascada-localidad.ts`).
Hay dos pantallas que eligen localidad y no eligen lo mismo: `SelectorZona`
elige VARIAS con "todas las del departamento" —perfil del gondolero y los tres
editores de campaña— y `SelectorLocalidad` elige UNA. El marcado del tercer
nivel es distinto por definición, así que un componente compartido tendría que
ramificar por dentro. Lo idéntico son las tres consultas y **las reglas de
reseteo en cascada**, y eso es lo que se compartió.

> El riesgo que evita no es duplicar JSX sino duplicar REGLAS: que una pantalla
> resetee el departamento al cambiar de provincia y la otra no, y alguien
> termine guardando una localidad de otra provincia.

De paso el hook arregló dos cosas que estaban en `SelectorZona`:

- **Los nombres salían de `e.target.options[selectedIndex].text`**, o sea del
  texto del `<option>` renderizado. Ahora salen de la lista, que es el estado.
- **No había guarda de respuesta tardía.** Con dos cambios de provincia
  seguidos, la respuesta lenta de la primera podía pisar la lista de la
  segunda y dejar departamentos que no son de la provincia elegida. El hook
  descarta la respuesta vieja.

##### Los cuatro estados se ven distinto, y eso es la feature

```
exacto    la cadena entera + Confirmar (un clic) + "Otra"
ambiguo   el nombre y que existe en más de un lugar — SIN Confirmar
fuera     lo que dijo el GPS, que el padrón no tiene — SIN Confirmar
sin_dato  "Sin dato de ubicación"
error     "No se pudo consultar" — que NO es lo mismo que sin_dato
```

**Que `ambiguo` y `fuera` no ofrezcan Confirmar es el control que importa.** Si
lo ofrecieran, la máquina estaría eligiendo entre dos localidades con un clic de
disfraz, que es lo que todo el tramo evita. El CHECK de la base lo impide del
lado del dato; esto lo impide del lado de la pantalla.

**La sugerencia se muestra con la cadena entera** —"Colón — Colón, Entre Ríos"—
y no solo el pueblo: con el nombre solo no se ve que apunta al departamento
equivocado, que es exactamente el error que hay que poder cazar de un vistazo.

**Confirmar NO borra la sugerencia.** Comparar las dos columnas es la única
forma de medir con qué frecuencia el geocoding acierta en la vida real.

##### Lo que se verificó, y lo que NO

| | |
|---|---|
| `probar-selector-localidad.mts` | rinde el componente y mira los cinco estados. 20 controles, incluido que `ambiguo` no ofrezca Confirmar **aunque venga un id** |
| El embed doble | `localidad:localidades!localidad_id` y `sugerida:localidades!localidad_sugerida_id` en la misma consulta: **probado contra dev**, devuelve la cadena completa |
| El refactor de `SelectorZona` | render idéntico **byte a byte** antes y después |

> **Lo que el render-diff NO prueba:** la cascada vive en efectos de cliente, y
> un render estático no los corre. El marcado quedó igual; que sigan cargándose
> provincias → departamentos → localidades hay que verlo con un click-through en
> el perfil del gondolero y en un editor de campaña. Decirlo es parte del
> resultado: un diff verde acá no cubre lo que el componente hace.

##### ✅ La bandeja de ADMIN también asigna localidad (25/9/2026)

Misma columna, mismo `SelectorLocalidad`, mismo hook. Lo único propio es la
action — `asignarLocalidadAdmin`, gemela de la de distri.

**El admin NO tenía el problema de visibilidad de la distri.** Su consulta
filtra solo por `estado`, sin campaña ni gondolero, así que ve todos los
pendientes: medido, 6 de 6 en las dos bases. Era la única superficie por la
que ese trabajo llegaba a alguien mientras la bandeja de la distri estuvo
vacía.

> **Pero tiene un `.limit(200)` sin aviso**, que es el mismo corte silencioso
> que el proyecto ya documentó tres veces. Hoy no muerde —6 pendientes— y el
> día que muerda, el síntoma va a ser que faltan comercios de la cola sin que
> nada falle.

**El permiso se chequea en la action, y no solo en el middleware.** Las otras
dos actions de ese archivo se conforman con `requerirSesion()`: que haya
alguien logueado. Lo que las protege de verdad es el middleware, que matchea
`/admin` y rebota a quien no lo tenga en sus rutas permitidas — y una server
action postea a la ruta de su propia página, así que pasa por ahí.

Funciona, pero es **una sola capa**: el día que alguien toque el matcher o
mueva la pantalla de ruta, esas actions quedan abiertas a cualquier
autenticado **sin que nada falle visiblemente**. La de distri no depende de
eso —`puedeTocar` chequea el vínculo— así que la nueva hace lo mismo y mira
`tipo_actor`. Las dos viejas quedaron como estaban: cambiarlas es otro tramo.

**Llega dormida para lo que ya existe:** los 6 pendientes de cada base ya
tienen `localidad_id` puesto por el script de reparación, así que la columna
muestra el nombre y no el selector. Se estrena con la próxima alta.

##### LAS ETAPAS

| | Qué | Verifica |
|---|---|---|
| 1 | ✅ **HECHA** — `20260930100000`: resolver **Colón**, nada más. Los otros 63 quedan como deuda | `probar-migracion-colon.mjs`, verde en dev y prod: nadie pierde su zona, el piloto entero, idempotente, y la precondición muerde |
| 2 | ✅ **HECHA** — `lib/geocoding.ts`, sin red ni base: proveedor + padrón → `exacto` / `ambiguo` / `fuera` / `sin_dato`. Acá murió el bug del `ilike` | `probar-geocoding.ts`, 27 controles. **Verificado que muerden**: con el `ilike` repuesto se ponen 7 en rojo |
| 3 | ✅ **HECHA** — `20261001100000`: `localidad_sugerida_id` / `_estado` / `_texto`, con el CHECK que impide un id sin estado `exacto` | `probar-migracion-sugerida.mjs`, verde en dev y prod. El dry-run encontró un hueco real en mi CHECK (tres valores) |
| 4 | ✅ **HECHA** — `lib/localidad-sugerida.ts` en los dos caminos de alta, inline y fail-open. Key server-side aparte | `probar-localidad-sugerida.mts`: camino completo contra dev con red, padrón y escritura |
| 5 | ✅ **HECHA** — columna Localidad en la bandeja de la distri: sugerencia precargada, un clic para confirmar, cascader para corregir. El cascader salió a un hook que `SelectorZona` también usa | `probar-selector-localidad.mts` (20 controles, los 5 estados); el embed doble probado contra dev; `SelectorZona` rinde idéntico byte a byte. **Falta el click-through** y la bandeja de admin |
| 6 | ✅ **HECHA** — `reparar-localidades.mts`, mismo mecanismo que el alta. `--aplicar` exige `--confirmo=N`, y N solo se sabe leyendo la propuesta | corrido en dev: **13 de 13 exacto, 0 fallidos, 0 sin localidad**. Verificado que la confirmación muerde sin el número y con uno equivocado |
| 7 | ✅ **HECHA** — los dos caminos dejan de escribir `zona_id`. NO dropea: eso va después de verificar el deploy en prod | **grep DESPUÉS** de escribir el código: sobre `comercios` no queda ni una lectura ni una escritura. Lo que aparece es de `campana_zonas` y `gondolero_zonas`, más el tipo generado (la columna sigue) |
| 8 | ✅ **HECHA** — `20261002100000`: la zona se guarda por NIVEL y se expande al leer. Incluye "toda la provincia" en el selector | `probar-migracion-zonas-nivel.mjs` (dev y prod) + `probar-zonas-gondolero.mts` (16 controles). El dry-run encontró que la migración NO era idempotente |
| 9 | ✅ **HECHA** — `20261005100000`: el `DROP COLUMN` de `comercios.zona_id`, con el seed y el tipo de `Comercio` en el mismo commit. Corrida en dev y prod el 25/9/2026 | `probar-migracion-drop-zona-id.mjs`, verde en dev y prod. Las dos precondiciones se ejercitan CREANDO el estado que rechazan: un comercio con zona y sin localidad, y una vista colgada de la columna |

La **1 va primera** porque sin padrón limpio la etapa 2 mide contra datos rotos.
Y la reparación va **después** del alta: arreglar el pasado mientras el presente
sigue perdiendo es al revés.

##### `comercios.zona_id`: cero lectores, verificado

App, scripts, funciones SQL de las dos bases y vistas: **nadie lo lee**. Los
`zona_id` que aparecen en un grep son todos de OTRAS tablas (`campana_zonas`,
`gondolero_zonas`). La columna es nullable y la FK admite NULL, así que dejar de

> **Lo que se sacó era peor de lo que decía el relevamiento.** No eran dos
> `.limit(1)`: `crearComercioNuevo` **hardcodeaba "Entre Ríos"** —`.eq('nombre',
> 'Entre Ríos')`— con fallback a la primera fila de la tabla. O sea que un
> comercio de Córdoba quedaba con la zona de Entre Ríos, y si esa fila no
> existía, con cualquiera. La otra ruta usaba `.limit(1)` pelado.
escribirlo no rompe nada.

**La etapa 7 deja de ESCRIBIR, no dropea.** El `DROP COLUMN` va después con el
orden de siempre: código que deja de usarla → deploy → verificar en prod → DROP.

##### ETAPA 9 — el `DROP COLUMN` (migración `20261005100000`)

**Corrida en dev y prod el 25/9/2026.** Dry-run verde en las dos antes de
aplicarla: `scripts/probar-migracion-drop-zona-id.mjs`.

> **`types/database.ts` estaba 307 líneas atrás.** Regenerarlo después del DROP
> no trajo solo la columna que se fue: trajo `abierta_a_postulaciones`,
> los tres `localidad_sugerida_*`, `motivo_rechazo` y la tabla entera
> `comercios_reportes_ubicacion`. Nadie lo había corrido en varias migraciones.
> Y el generado desde dev y desde prod salió **byte a byte idéntico**, que de
> paso es la verificación más barata de que las dos bases tienen el mismo
> schema.
>
> **Ojo con `npm run db:types` en esta máquina.** El script usa `--linked` y no
> hay `supabase/config.toml`, así que falla — pero el `>` de la redirección ya
> truncó el archivo a cero antes de que fallara. Se recupera con `git checkout`.
> Lo que funciona es `--project-id <ref>`, que va por la Management API; con
> `--db-url` el CLI pide Docker.

**El grep de DESPUÉS encontró dos cosas que "cero lectores, verificado" había
dado por limpias**, y las dos iban a romper:

| Dónde | Qué | Qué habría pasado |
|---|---|---|
| `supabase/seed.sql` | insertaba `zona_id` en `comercios` | el seed entero deja de correr en cualquier base nueva. Escribía NULL igual: el archivo nunca insertó en `zonas`, así que los cinco subselects no matcheaban nada |
| `types/index.ts` | `Comercio.zona_id` | un campo que existe en el tipo y no en la tabla es una invitación a escribirlo, y PostgREST rechaza **la consulta entera** por una columna que no existe |

Las dos van en el mismo commit que la migración. `types/database.ts` es
generado: se regenera con `npm run db:types` **después** de correrla.

**La precondición no es "que nadie la lea": es que ya no quede nadie a quien
marcar.** `zona_id IS NOT NULL` es el marcador exacto de "entró por el agujero
del alta", y el DROP lo borra. Medido antes de escribir la migración:

```
con zona, SIN localidad    dev 0    prod 0     ← si esto no es cero, aborta
con zona, con localidad    dev 14   prod 6
```

Es el único momento en que ese dato todavía existe, así que la migración se
niega a correr si el primer número no es cero.

La segunda precondición enumera **todo lo que cuelga de la columna** salvo su
propia FK, y aborta nombrándolo. `DROP COLUMN` sin CASCADE ya se negaría ante
una vista, pero **se llevaría un índice sin decir nada**. Medido en las dos
bases: la única dependencia es `comercios_zona_id_fkey`. Cero vistas, cero
índices, cero policies, cero funciones.

> **El `coalesce` de esa consulta no es decorativo.** El filtro excluye la FK
> comparando contra su oid; si la FK no existiera, la comparación daría NULL,
> el `NOT` daría NULL y la fila se descartaría. O sea: un filtro que se apaga
> solo justo cuando la base no es la esperada.

Y la verificación mira **la otra dirección**, que es la que atrapa un DROP
apuntado a la tabla equivocada: `zona_id` vive en tres tablas y solo se va de
una. `campana_zonas`, `gondolero_zonas` y `zonas` tienen que seguir enteras.

##### ETAPA 8 — la zona del gondolero se guarda por NIVEL (migración `20261002100000`)

`gondolero_localidades` gana `nivel` (`provincia | departamento | localidad`) y
`ref_id`, y pierde `localidad_id`. La expansión pasa a hacerse **al leer**,
contra el padrón de hoy.

**Se hizo ahora por la ventana, no por la urgencia:** la tabla tiene **cero
filas en producción**. No hubo nada que migrar. Cualquier día posterior a que se
llene, el mismo cambio es una migración de datos con gente real adentro.

##### La FK se reemplazó ENTERA, que era la condición

`ref_id` no puede tener FK: apunta a tres tablas. Y la FK daba **dos** cosas, no
una:

| | Con qué se repuso |
|---|---|
| validar al escribir | `gondolero_zonas_validar_ref` (BEFORE INSERT/UPDATE) |
| **borrar en cascada** | tres triggers AFTER DELETE en localidades, departamentos y provincias |

Un trigger que solo valide repone la mitad, **y la mitad que falta es la que ya
mordió**: `20260930100000` borró una localidad y lo que impidió las huérfanas
fue el `ON DELETE CASCADE`.

> **OJO CON EL TIPO DE `ref_id` — esto muerde dentro de un año.** Es `integer`
> porque `localidades.id`, `departamentos.id` y `provincias.id` son los tres
> integer. **`zonas.id` es `uuid`** — la tabla vieja, otra jerarquía. Un nivel
> nuevo que referencie algo con uuid NO entra: habría que elegir entre un `text`
> que acepte los dos (perdiendo la validación de tipo) o una segunda columna.

##### La expansión vive en TypeScript

`lib/zonas-gondolero.ts`. Resolverlo con un `OR` de tres subqueries metería la
regla en SQL, y entonces existiría en dos lenguajes — la trampa que
`lib/fecha-ar.ts` tiene documentada con la semana.

Dos consultas como mucho, y **cero si solo hay localidades sueltas**, que es el
caso de hoy. Los lectores siguen recibiendo lo de siempre: `number[]`.

> **El límite, anotado antes de que moleste:** la lista termina en un `.in()`.
> Buenos Aires son 252 ids y Entre Ríos 143, así que hoy entra cómodo; con cinco
> provincias grandes serían ~700. Cuando moleste, **la salida es invertir la
> pregunta** —¿la localidad de la campaña cae bajo alguna de mis zonas?, que son
> pocas filas— y eso es un cambio de forma en los dos lectores, no en la lib.

##### Lo que el dry-run encontró, y la lectura no

**La migración no era idempotente.** El `UPDATE` que copia `localidad_id` a
`ref_id` falla en la segunda corrida con *"column localidad_id does not exist"*,
porque **Postgres parsea el statement entero aunque el `WHERE` no matchee ni una
fila**. Quedó dentro de un `EXECUTE` guardado por `information_schema`.

Y dos defectos míos en el propio dry-run: un insert de setup que chocaba con el
de la prueba anterior cuando los ids coincidían, y un CONTROL que elegía un id
de localidad que también existe como provincia —con ids chicos las tres tablas
se pisan— así que salía NO VERIFICABLE en vez de probar algo.

> Y una tercera, de herramienta: **`$$` en el string de reemplazo de
> `String.replace()` es el escape de un `$` literal**, así que el script que
> escribía el `DO $$` dejó `DO $` y la migración no parseaba. Se arregla con una
> función de reemplazo, que no interpreta.

##### El botón que se pidió, y lo que hace además

"Agregar toda **Entre Ríos** (17 departamentos)" aparece apenas se elige una
provincia. **Reemplaza lo que hubiera de esa provincia**: tener "toda Entre
Ríos" y además tres de sus departamentos es la misma zona escrita dos veces, y
al borrar una quedaría la otra sin que se entienda por qué.

Y `agregarZona` cambió: con "todas las del departamento" **ya no guarda las
localidades**, guarda el departamento. Eso arregla de paso algo que no se veía —
el chip decía *"12 localidades"* aunque el gondolero hubiera elegido todo el
departamento, porque al persistir se expandía y al releer eran indistinguibles.

##### La redundancia entre niveles, en las DOS direcciones

La primera versión del botón evitaba una sola: agregar la provincia reemplaza
lo que hubiera de ella. **Faltaba la inversa** —agregar un departamento de una
provincia que ya está entera— y quedaban los dos chips.

No rompe nada: al expandir, esas localidades ya estaban. Lo que rompe es la
lectura, y de una forma particularmente mala: **agregar el departamento no
cambia la cobertura, así que borrarlo tampoco.** El usuario saca "Colón" del
listado y sigue cubriendo Colón, sin ninguna forma de entender por qué. Hay un
control que mide exactamente eso — la expansión con y sin el grupo redundante
da la misma lista.

Ahora un departamento o una localidad de una provincia completa **no se
agregan**, y el aviso dice cuál es la provincia y qué hacer: *"Entre Ríos ya
está completa. Sacala de la lista si querés elegir departamentos o localidades
sueltas."*

**Los dos avisos no se pisan, y son casos distintos.** "Este departamento ya
fue agregado" manda a buscar un chip de departamento; si lo que está es la
provincia entera, ese chip no existe. Por eso `departamentoYaAgregado` **no**
cuenta los grupos de provincia, y hay un CONTROL que lo fija.

Las dos reglas viven en `lib/zonas-gondolero.ts` y no adentro del componente:
son reglas, no condiciones de render, y ahí se prueban sin montar nada.

##### Los 4 departamentos completos de dev: NO se convierten

Se detectan con exactitud, y aun así se dejan como están.

**"Las 3 de 3" es indistinguible de "todas".** Convertirlos le cambiaría la
semántica de *"estas tres"* a *"todas las que haya"* — una decisión sobre su
zona de trabajo que él no tomó, y cuyo efecto aparece meses después cuando entra
un pueblo nuevo. El filtro de "solo departamentos con más de N localidades"
tampoco sirve: sigue siendo adivinar, con menos casos.

Son 4, de 2 gondoleros, **todos en dev** —prod tiene cero— y el costo de no
convertirlos es que vuelvan a tildar "todo el departamento" una vez.

##### Probado

| | |
|---|---|
| `probar-migracion-zonas-nivel.mjs` | dry-run en transacción, verde en dev y prod. Prueba la validación **y la cascada**, que ninguna fila se pierda, que la PK permita provincia N y departamento N a la vez, y la idempotencia |
| `probar-zonas-gondolero.mts` | 16 controles sin base. El que importa: **el padrón crece y la zona lo sigue**, con el CONTROL de que la lista expandida que se guardaba antes no lo cubriría |

##### Un hallazgo lateral que no es de este tramo

La policy de `gondolero_localidades` es `service_role_all` con **`USING true`
para `{public}`**. O sea que cualquier usuario autenticado puede leer las zonas
de **todos** los gondoleros. No rompe nada hoy y por eso el lector del filtro de
campañas funciona con el cliente de usuario — pero choca de frente con el
Walled Garden de la sección 6.

##### Lo que este tramo NO cierra

- **El aviso de campaña acotada se cayó del tramo.** Sin selector en el alta no
  hay momento en que preguntárselo al gondolero. Si sigue valiendo, es en la
  bandeja de la distri y es un tramo aparte.
- **El padrón sigue incompleto** fuera de Entre Ríos —Formosa 10 localidades,
  Tierra del Fuego 3— así que "fuera del padrón" va a existir siempre. La bandeja
  lo absorbe; quién carga las que faltan no está decidido.
- **`gondolero_localidades` está en CERO en producción**, así que cualquier atajo
  que se apoye en las zonas declaradas del gondolero no tiene con qué en prod.
- **Los 51 duplicados** de provincias sin actividad.

#### ✅ HECHO — "toda la provincia" en el selector de zonas (etapa 8, 25/9/2026)

> **Resuelto en la etapa 8 del tramo de arriba**, y como se decidió: guardando
> el NIVEL, no la expansión. Lo que sigue es el relevamiento que llevó a esa
> decisión; el resultado está en "ETAPA 8 — la zona del gondolero se guarda por
> NIVEL".

Pedido el 25/9/2026: un gondolero que cubre Entre Ríos entera hoy tiene que
tildar 17 departamentos uno por uno.

**La pregunta que decide el tamaño del trabajo: ¿se guarda la provincia como
tal, o se expande a sus localidades?**

##### Lo medido, que cambia la respuesta

```
                                        dev            prod
gondolero_localidades                42 filas / 2    0 filas / 0
campana_localidades                  29 filas / 7   29 filas / 7
departamentos COMPLETOS ya guardados      4              0
expandir una provincia insertaría    Entre Ríos 143 · Buenos Aires 252
```

**Los dos escritores guardan SOLO `localidad_id`** —
`actualizarLocalidadesGondolero` y `draft-actions.ts`—. El flag `todas` de
`GrupoZona` es estado de UI y **se pierde al persistir**.

O sea que **"todas las del departamento" YA TIENE exactamente el problema que se
pregunta para la provincia**, y lo tiene desde que existe: hay **4 departamentos
completos** guardados en dev como listas de localidades. El día que el padrón
sume una localidad en uno de esos deptos, ese gondolero no la cubre. No es un
riesgo nuevo que introduzca "toda la provincia": es uno viejo que la provincia
haría 8 veces más grande.

##### La recomendación: guardar el nivel, y hacerlo AHORA

**Las dos tablas no tienen la misma semántica, y eso es lo que decide:**

| | Qué significa | Qué pasa si el padrón crece |
|---|---|---|
| `gondolero_localidades` | *"mi zona de trabajo"* | Un pueblo nuevo en su provincia **SÍ es suyo**. Expandir lo deja afuera |
| `campana_localidades` | *"dónde corre esta campaña"* | Un pueblo nuevo entrando solo a una campaña viva es **peor**. Expandir es un snapshot, y es defendible |

Así que el cambio es del **lado del gondolero**, no de las campañas.

**Y el momento es ahora, por una razón que no se repite: `gondolero_localidades`
tiene CERO filas en producción.** No hay nada que migrar. En dev son 42 filas de
2 gondoleros. Cualquier día posterior a que esa tabla se llene, lo mismo pasa a
ser una migración de datos con gente real adentro.

**Costo:** solo **2 lectores** —el filtro de campañas y el display del perfil— y
1 escritor. Es chico, pero es un cambio de modelo: tabla o columna de nivel,
migración, y los dos lectores pasan a resolver "mis localidades" expandiendo al
leer. **Es una etapa, no un checkbox en el selector.**

##### Por qué NO se agregó el botón en la etapa 5

Agregarlo como expansión —que es lo barato— **multiplica por 8 un bug dormido en
prod** y convierte el arreglo posterior en una migración de datos en vez de un
cambio de schema. Contradice la respuesta a la pregunta que se hizo junto con el
pedido, así que se dejó la decisión antes que el código.

Si igual se prefiere la versión rápida, son ~20 líneas en `SelectorZona`: un
botón que tilde todos los departamentos de la provincia. Queda dicho que eso es
deuda, no solución.

#### PENDIENTE sin urgencia — la cadena como campo de comercios

Anotado el 24/9/2026. **Una campaña de seguimiento sin fecha de fin ya funciona
como pivot de una cadena:** "Reposición Carrefour" vive mientras dure el contrato
y agrupa todas sus sucursales, así que el campo no hace falta para el caso
principal.

El único que no cubre es una sucursal que además entre en una campaña puntual de
precios, cuya medición no se agrupa con la de reposición. Probablemente esté bien
que no se mezclen.


---

## Tramos abiertos después del dashboard de cobertura (21/9/2026)

En este orden de prioridad. Los tres salieron de probar el flujo offline en dev.

### 1. ✅ GPS sin señal — hecho el 22/9/2026

Trabajar sin señal es el caso **normal** en el interior, no el raro. Hasta el
22/9/2026 el paso de comercios cercanos fallaba en modo avión con *"No pudimos
obtener tu ubicación"* aunque el GPS funcionara: unos pasos después, el chequeo
de distancia validaba bien.

**La causa no era la lista** —`captura/page.tsx` tiene una rama offline correcta
que filtra desde el caché— **sino `useGPS`** (`lib/hooks/index.ts`), que estaba
así:

```ts
{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
```

En modo avión se corta el **A-GPS**: el teléfono no puede usar torres ni wifi
para asistir al chip, así que el primer *fix* pasa de 2-3 segundos a 30-60. A
los 15 segundos se declara error. `maximumAge: 5000` empeora el cuadro — rechaza
cualquier posición cacheada de más de 5 segundos y obliga a un fix fresco justo
cuando es más caro. Después funciona porque el chip ya quedó caliente.

Detalle que lo confirma: `watchPosition` **sigue observando después del error**,
así que el fix probablemente llegaba solo unos segundos más tarde — pero la
pantalla ya había mostrado el error y un botón de reintentar.

**Cómo quedó** (`lib/hooks/index.ts`):

| | Antes | Ahora |
|---|---|---|
| `timeout` | 15000 | **omitido** |
| `maximumAge` | 5000 | **120000** |
| Edad máxima para VALIDAR distancia | — | **30000** |
| Texto "puede tardar" | — | a los **12 s** |
| Texto accionable + reintentar | — | a los **60 s** |

**El `timeout` se sacó en vez de agrandarlo.** El de `watchPosition` no es
cuánto se espera: es cuándo se dispara el callback de error, **y el watch sigue
vivo igual**. Agrandarlo a 60000 solo mueve la mentira 45 segundos. Sin timeout,
el error queda para lo que de verdad es un error —permiso denegado, dispositivo
sin GPS— y la espera se comunica como espera.

**`maximumAge` alto SÍ afecta la validación de distancia, y por eso es por
propósito y no global.** Hay un solo `useGPS` en la app y de su `posicion` salen
TRES cosas, no dos: la lista de cercanos, el aviso de 50 m / bloqueo de 200 m, y
**el par lat/lng que se manda a `registrarMision`** — el que queda guardado en
`fotos.distancia_metros` y el que ve quien aprueba. Un minuto a pie son ~80 m;
en moto por el pueblo, 500: más que el radio de bloqueo entero.

La salida fue guardar `Position.timestamp` —que antes se tiraba, solo se
guardaba `coords.accuracy`— en `GPSData.medidaEn`, y exponer `fresca`. La lista
de cercanos usa la posición tenga la edad que tenga; la validación exige que sea
fresca, y si no lo es muestra "Actualizando tu ubicación" con el watch vivo, que
lo resuelve solo en un par de segundos.

**Y `solicitar()` pisaba `watchIdRef` sin limpiar el watch anterior.** Se llama
desde los efectos de los dos pasos y desde dos botones de reintentar, así que
quedaban watchers apilados y `detener()` solo mataba el último. Cada watch vivo
mantiene la radio del GPS encendida: batería en un teléfono que ya está
sufriendo sin señal.

**El riesgo de no tener timeout**, dicho de frente: un teléfono con la ubicación
apagada por hardware puede no dar ni fix ni error. Está cubierto en los dos
pasos — a los 60 s el texto pasa a *"Si no aparece, revisá que la ubicación del
teléfono esté activada y probá al aire libre"* con botón de reintentar, y
`comercios-gps` además tiene la búsqueda por nombre sin gate de GPS. Aparte, si
el navegador expone `permissions.query({name:'geolocation'})` y dice `denied`,
se dice de entrada en vez de quedarse buscando; ese chequeo falla ABIERTO
—Safari viejo tira— porque una cortesía nunca puede ser lo que impide pedir GPS.

**PENDIENTE, mismo bug en otra pantalla:** `gondolero/comercios/nuevo/page.tsx`
tiene su propio `getCurrentPosition` con `timeout: 15000`. Hoy no muerde porque
**ninguna pantalla linkea a esa ruta** (verificado el 22/9/2026: la única
mención en el repo es un comentario sobre un param de redirect), pero si se
vuelve a enganchar hay que darle el mismo tratamiento — y ahí es
`getCurrentPosition`, que sin timeout puede colgarse sin error ni salida.

### 2. ✅ Precache al unirse, y TTL del caché de campañas — hecho el 22/9/2026

**Los tres agujeros que tenía el caché de campañas** (`lib/campana-cache.ts`):

1. **No tenía timestamp.** Los otros dos cachés guardan `{ data, timestamp }`;
   éste hacía `set(clave, campanaData)` con el objeto pelado. Sin fecha no hay
   forma de saber si quedó viejo.
2. **`if (already) continue` nunca refrescaba.** Una campaña cacheada hace dos
   semanas se capturaba offline con los bloques de hace dos semanas. Si el
   creador agregaba una pregunta, la misión llegaba sin esa respuesta.
3. **El precache solo corría en la pantalla de la LISTA.** La secuencia
   `detalle → Unirme → captura → modo avión` dejaba al gondolero sin nada,
   porque nunca volvió a la lista con señal.

**Cómo quedó:**

| | |
|---|---|
| TTL | **12 h** — cubre una jornada: si precargó a las 7, a las 19 sigue vigente |
| Al vencer | **se usa igual**, nunca se borra |
| Con red y vencido | chequeo de `updated_at` (dos columnas), refetch solo si cambió |
| Sin red y vencido | se usa, con aviso que dice la fecha |
| Al unirse | `unirse-button.tsx` precachea apenas `soloUnirse` devuelve ok |

**Vencido no es inválido, y esa es la decisión de producto.** El gondolero está
parado en el comercio: mejor formulario viejo que ningún formulario. El daño
está acotado porque las respuestas se guardan contra `campo_id`, no contra el
texto: una pregunta agregada llega como dato faltante, no como dato falso, y una
renombrada queda bien atada igual. El caso feo sería que borraran un campo, y
ningún camino de la app borra `bloque_campos` — `republicarCampana` hace append.

Lo que sí se hace es **decirlo, con la fecha**: *"Los datos de esta campaña son
del martes. Abrila con señal para actualizarlos."* Mismo criterio que
`relevadosFresco`.

**El chequeo barato es lo que hace que el TTL no cueste datos.** Una sola
consulta de `id, updated_at` para todas las campañas cacheadas; el
`CAMPANA_CACHE_SELECT` con los bloques anidados solo se baja si algo cambió.
Depende de la migración `20260922200000`, que es la que mueve
`campanas.updated_at` también cuando el cambio es en un bloque o un campo.

**`soloUnirse` es un server action**, así que no puede escribir IndexedDB: el
precache al unirse tiene que estar del lado del cliente, en el botón. Y va sin
bloquear — si falla por falta de señal, el gondolero igual se unió y la lista lo
precachea después.

**El punto "que el efecto se vuelva a correr si cambian las campañas" ya estaba
hecho** y lo había relevado mal: el dep array del efecto es
`[misCampanas, gondoleroLocalidadIds]`, así que sí vuelve a correr. Lo que no
hacía nada era el cuerpo, por el `if (already) continue`.

**De paso se borró `unirseACampana`**, que no tenía ningún llamador. Una función
muerta con los controles adentro es la que alguien va a "arreglar" algún día
creyendo que es la que corre. Los seis controles ya están en `validarUnion`, que
`soloUnirse` comparte.

**Probado:** `scripts/probar-campana-cache.ts` — 12 casos de TTL y de los textos
del aviso, incluido el caché del formato viejo (`timestamp: 0`), que nace
vencido a propósito para que se revise en la primera oportunidad con señal.

### 3. Zona horaria en lo que ya existe — C y C′, separados

`lib/fecha-ar.ts` existe desde el 21/9/2026 y **no está cableado en ningún
lado**. Van en dos tramos y no en uno: un rollback por un problema de plata no
puede llevarse puestas 28 pantallas de cosmética, ni al revés.

**C — las decisiones. ✅ HECHO el 22/9/2026.**

| Dónde | Qué decidía mal |
|---|---|
| `lib/campana-vigencia.ts` | el gate de vencimiento: cerraba a las 21:00 del día anterior |
| `inscripcionCerrada` (nueva, ex 2 copias) | `new Date(limite) < new Date()` cerraba **27 horas antes** |
| `lib/nivel-mensual.ts` `inicioDelMes` | el mes arrancaba el 1° a las 21:00 del último día del anterior |
| `lib/nivel-maximo.ts` `claveMes` | el mes del "mejor mes", que alimenta los 4 gates |
| `lib/logros.ts` | la racha, "hoy" y el inicio de mes |
| `logros/page.tsx`, `perfil/page.tsx` | cada una calculaba su propio corte de mes |

**La dirección del cambio es lo que lo hizo seguro:** Argentina va atrás de UTC,
así que `diaAR(hoy) ≤ diaUTC(hoy)` **siempre**, y el gate `dia > fechaFin` se
vuelve menos frecuente, nunca más. El cambio solo puede DEVOLVER las tres horas
del último día, jamás quitarlas. Es aritmética, no una observación sobre los
datos de hoy.

Medido antes de tocar nada, en las dos bases:

```
campañas donde el cambio mueve el resultado ahora        0
campañas que vencen en los próximos 7 días               0
gondoleros con racha_7_dias                              0
gondoleros cuya racha cambia con el cálculo nuevo        0
misiones que cambian de MES al pasar a hora AR       0/182 (dev)  0/136 (prod)
```

Y aunque cambiara: **un logro ganado no se puede perder.** `verificarLogros`
solo INSERTA lo que falta y no hay un solo DELETE de `gondolero_logros` en el
repo.

**De paso se arregló un bug activo de la racha:** `checkRacha` contaba hacia
atrás desde `new Date()` y armaba la clave con `toISOString()`. Entre las 21:00
y la medianoche argentina "hoy" para el servidor era mañana, un día sin
actividad, así que el primer chequeo fallaba y **la racha se evaluaba mal todas
las noches**, justo cuando el gondolero mira sus logros después de trabajar.

### El test que lo protege, y por qué casi no sirve

`scripts/probar-vigencia-ar.ts` — 23 casos. El que manda: *una campaña que vence
hoy, evaluada a las 22:00 hora argentina, tiene que seguir aceptando misiones.*

**La primera versión daba verde contra el código roto.** El cálculo viejo usaba
`getFullYear/getMonth/getDate`, la hora local del PROCESO: en una máquina
argentina eso devuelve el día argentino por casualidad y el bug no se ve. Solo 2
de los 23 casos se ponían rojos, y ninguno era el del vencimiento.

Por eso **la prueba se pone en UTC sola** (`process.env.TZ = 'UTC'` antes de
cualquier fecha) y corta si no lo logra. Con eso, contra el código viejo se
ponen rojos **7 casos**, incluido el que importa. Verificado revirtiendo el
código a propósito.

> Al escribir una prueba de zona horaria, correrla en la zona del servidor. Una
> que pasa en la máquina del que la escribe y fallaría en Vercel es peor que no
> tenerla: da permiso para no mirar.

**C′ — la presentación. ✅ HECHO el 22/9/2026.**

No era poner `timeZone` y listo, porque **un `date` y un `timestamptz`
necesitan tratamiento opuesto**:

```
timestamptz, misión de las 22:30 AR del 20  →  sin zona (UTC): 21/09   MAL
                                            →  con zona AR   : 20/09   bien

date '2026-09-30' (fecha_fin)               →  sin zona (UTC): 30/09   bien
                                            →  con zona AR   : 29/09   MAL
```

`new Date('2026-09-30')` se parsea como medianoche **UTC**; convertirlo a hora
argentina lo retrocede un día. Poner la zona a ciegas arregla las fechas de
misiones y **rompe las de campañas**, con un error nuevo más visible que el que
corrige.

Las tres funciones viven en `lib/fecha-ar.ts`:

| | Para | Cómo |
|---|---|---|
| `formatearDia(dia)` | las columnas `date` | formatea el **mediodía UTC** de ese día con `timeZone: 'UTC'`, así ningún desfasaje lo puede mover de día, e `Intl` igual sabe dar el nombre del mes |
| `formatearInstante(ts, opts)` | los `timestamptz` | `timeZone: ZONA_AR` |
| `formatearInstanteHora(ts)` | ídem, con hora | `22/09/2026, 19:30` — reloj de 24 |

**El schema tiene exactamente TRES columnas `date`**, las tres en `campanas`:
`fecha_inicio`, `fecha_fin` y `fecha_limite_inscripcion`. Todo lo demás es
`timestamptz`, **incluidas `marca_distri_relaciones.fecha_fin` y
`fecha_reinicio`, que se llaman "fecha" y no lo son**. El tipo no está en el
nombre: un formateo nuevo se decide mirando el schema, no leyendo la variable.

Eso es también lo que hizo fallar el primer intento mecánico. Un `sed` que
convertía `toLocaleDateString` a `formatearDia` archivo por archivo agarró de
paso ocho `created_at`/`updated_at` que viven en los mismos archivos que las
`fecha_fin` — o sea que la migración automática **introdujo el bug opuesto en el
mismo commit que arreglaba el original**. Se detectó revisando la salida del
`sed`, no compilando: los dos formateadores tienen la misma firma y el
typecheck no distingue uno del otro.

**`formatearFecha` y `formatearFechaHora` se BORRARON de `lib/utils.ts`.** No se
dejaron redirigidas: un formateador sin zona que todavía compila es el que
alguien va a usar en la pantalla siguiente. `tiempoRelativo` se queda —una resta
de instantes no depende de la zona— pero su fallback de más de una semana ahora
va a `formatearInstante`.

**Los client components tampoco estaban exentos, al revés de lo que decía esta
misma nota.** Un componente cliente hace SSR en el primer render: el servidor lo
pinta en UTC y el navegador en hora argentina, o sea que entre las 21:00 y la
medianoche eran **dos días distintos para el mismo dato** — una discrepancia de
hidratación, no solo una inconsistencia estética. `alertas-en-pausa.tsx` y
`fechaCacheRelativa` quedaron con la zona explícita por eso.

Lo que se tocó además de los formateos:

- **Tres `mesInicio`** calculados con `new Date(y, m, 1)` —`admin/tablero`,
  `distribuidora/dashboard` y **`repositora/dashboard`, que no estaba en el
  inventario**— ahora usan `inicioDelMes`. Con el cálculo viejo el mes arrancaba
  el 1° a las 00:00 UTC, o sea a las 21:00 del último día del mes anterior.
- **`fmtSemana`** en los dos tableros: rotulaba el bucket semanal con el día UTC.
- **El `mesLabel` de Logros**, que a las 22:00 del 30 de septiembre decía
  "Octubre" arriba de números de septiembre.
- **`formatearVentana` de `ResultadosView`**, el "Del 11 al 14 de marzo" que la
  marca usa para saber si el dato sigue vigente.

### El test: `scripts/probar-formato-ar.ts`

23 casos, se pone en UTC solo y corta si no lo logra, igual que el de C. El caso
que manda no es el bug original sino **el que introduce un arreglo apurado**: una
columna `date` no puede mostrarse un día antes.

Verificado rompiendo el código a propósito, en las dos direcciones:

```
formatearDia tratado como instante (la "zona a todo")  →  6 casos en rojo
formatearInstante sin zona (el bug original)           →  7 casos en rojo
```

> Un test de este tramo tiene que ponerse rojo contra **los dos** errores. El que
> cubre uno solo es el que deja pasar el arreglo que rompe el otro lado.


### Y después del dashboard: que el gondolero sepa su frecuencia

El dashboard mide contra una regla que **hoy solo conoce quien creó la
campaña**. El gondolero no tiene forma de saber cuántas visitas se esperan de él
esta semana ni en qué comercio. Es el tramo siguiente a la etapa E, y sin él la
frecuencia es una vara con la que se lo mide sin habérsela mostrado.

---

## Pendiente — el DROP de las columnas de precio (21/9/2026)

El código ya no las lee. Falta el `DROP COLUMN`, que va **después** de
verificar este deploy en producción, igual que con `nivel` y
`fotos_aprobadas`.

| Columna | Estado |
|---|---|
| `bloques_foto.tipo_contenido` | ✅ **dropeada** el 22/9/2026 (ver abajo) |
| `bloques_foto.solicitar_precio` | ✅ **dropeada** el 22/9/2026 |
| `bloque_campos.solicitar_precio` | ✅ **dropeada** el 22/9/2026 |
| `fotos.precio_confirmado` | **sigue escribiéndose**, ver abajo |
| `fotos.precio_detectado` | sin lectores ni escritores (la IA de visión nunca se activó) |

Las tres primeras se fueron en
`20260922100000_drop_tipo_contenido_y_solicitar_precio.sql`, corrida en dev y
prod el 22/9/2026 y confirmada con `node scripts/verificar-drop-columnas.mjs`.
Las dos de `fotos` siguen pendientes: ver el párrafo de la cola offline.

**La casilla "Pedirle precio al gondolero" nunca funcionó.** Escribía
`bloques_foto.solicitar_precio` y el input de la captura miraba
`bloque_campos.solicitar_precio` — **dos columnas distintas con el mismo
nombre**. La segunda no está en ninguna migración (se creó a mano en Supabase,
como el resto de `bloque_campos`) y **ningún código la escribía**.

Medido antes de sacarla, en las dos bases:

```
                                DEV        PROD
bloques_foto true                 0 de 18    0 de 9
bloque_campos true                1 de 36    0 de 13   ← puesta a mano en Supabase
fotos.precio_confirmado           0 de 258   0 de 194
fotos.precio_detectado            0 de 258   0 de 194
```

Por eso cambiar de fuente no perdió nada: no había nada.

**Lo que falta para poder dropear `fotos.precio_confirmado`:** la pantalla de
captura todavía guarda `precio` por bloque en IndexedDB y
`cola-sync-offline.tsx` lo lee, así que una misión encolada **antes** de este
deploy todavía lo trae y lo manda. Esa plomería —el estado `precio` de
`captura/page.tsx`, el campo en la entrada de la cola y el parámetro de
`registrarMision`— se saca cuando la cola haya drenado: el TTL es de 7 días.

**El precio ahora sale de una pregunta tipificada con la métrica Precio**
(`lib/precios-relevados.ts`), y se muestra al lado de la foto en las tres
galerías de revisión. Eso no es cosmético: es la mitad barata del pendiente de
validación de rangos — un 0 o un 7777 se ven mirando la góndola. Dev tiene los
dos casos en datos reales.

**Si una misión tiene más de una pregunta tipificada como Precio se muestran
todas**, con su pregunta al lado. Quedarse con una sería elegir por el que
revisa cuál de los dos productos importa.

**Límite conocido:** una campaña de solo preguntas no tiene galería, así que su
precio solo se ve en el panel de resultados. En dev le pasa a "Precio de
mantecol:", que tiene 5 respuestas y 0 fotos.

### Y `bloques_foto.tipo_contenido` se fue con ellas (21/9/2026)

Con la tipificación por pregunta quedaba redundante y podía **contradecirla**:
cada pregunta dice qué mide, y un segundo nivel en el bloque decía otra cosa.

**Nunca decidió nada.** Se barrió el repo entero: las únicas comparaciones eran
`s1.tipo_contenido === tc.value`, o sea el `checked` de su propio radio button.
Ni un `if` de negocio. La captura ni siquiera lo leía — `lib/campana-cache.ts` lo
metía en el caché del gondolero como `tipoContenido` y `captura/page.tsx` no lo
menciona una sola vez. Lo mostraban dos lugares y los dos eran decorativos: un
badge gris en el detalle de admin y una línea en el editor de draft.

**Y el valor `'ninguno'` nunca existió.** El CHECK de la columna es:

```sql
CHECK (tipo_contenido IN ('propios', 'competencia', 'ambos'))
```

Pero `BLOQUE_ALTAS` lo forzaba a `'ninguno'` para las campañas de altas, los tres
editores lo ofrecían como opción ("Sin productos (stands, comercios, etc.)") y
`actions-comercios.ts` creaba con ese valor el bloque de respaldo del alta.
**Los INSERT rebotaban**, verificado contra dev:

```
'propios'      ✓ entra
'ambos'        ✓ entra
'competencia'  ✓ entra
'ninguno'      ✗ RECHAZADO — bloques_foto_tipo_contenido_check
```

Y ninguno de los dos caminos chequeaba el error —`const { data: bloque } = await
admin.from('bloques_foto').insert(...)`, sin `error`— así que la campaña de altas
se creaba **sin bloque** y nadie se enteraba. Es el patrón de las 137 escrituras
sin chequear, esta vez sobre una tabla de configuración.

No llegó a morder en producción porque la única campaña `tipo='comercios'` que
hay es anterior al 17/9 y tiene `'ambos'`. Era latente: se disparaba con la
próxima campaña de altas creada desde un editor.

Distribución antes de sacarlo — `'ninguno'` y `'competencia'` con **cero filas en
las dos bases**, o sea que la mitad del selector no se usó nunca:

```
              DEV   PROD
propios        13     6
ambos           6     3
competencia     0     0
ninguno         0     0
```

El INSERT del bloque ahora omite la columna y toma su `DEFAULT 'propios'`, así
que las filas nuevas siguen siendo válidas hasta el DROP.

---

## Una verificación que puede decir OK sin haber verificado no es una verificación

El 22/9/2026, al regenerar `docs/schema-real-2026-09.md`, las tres columnas del
DROP seguían ahí. **La causa fue trivial y no técnica: el DROP todavía no se
había corrido.** No hubo ninguna falla de la base ni de la migración.

Pero al ir a buscar por qué una verificación no lo había atrapado apareció que
**no podía atraparlo**, y eso sí vale. El bloque que yo había puesto al final de
la migración era éste:

```sql
IF _quedan <> 0 THEN
  RAISE WARNING '[drop] quedaron % de las 3 columnas', _quedan;
END IF;
...
RAISE NOTICE '[drop] OK — 3 columnas menos, ...';   -- ← SIN CONDICIÓN
```

Reproducido contra producción con las columnas todavía presentes:

```
WARNING: [drop] quedaron 3 de las 3 columnas
NOTICE:  [drop] OK — 3 columnas menos, fotos.precio_confirmado intacta
```

**El OK sale igual.** En el SQL Editor un WARNING se pierde entre el ruido y lo
que se lee es la última línea, que dice OK. Es el mismo defecto que
`[generate-sw-manifest] OK — 17 chunks escritos` reportando éxito sobre un no-op
que nadie consumía.

Este bloque nunca llegó a tapar nada —no corrió— así que la lección no viene de
un daño sino de haberlo medido antes de que lo hiciera. Vale igual: el día que
un DROP falle de verdad, esto habría dicho OK.

**Las dos reglas que salen de esto:**

1. **Un bloque de verificación falla con `RAISE EXCEPTION`, no con `RAISE
   WARNING`.** Después del `COMMIT` una excepción no revierte nada —el DDL ya
   está— pero sale en rojo y no se puede pasar por alto. Y el mensaje de éxito
   tiene que ser inalcanzable si algo falló, no una línea más abajo.
2. **Verificar las dos direcciones.** Que se hayan ido las que tenían que irse
   **y** que sigan las que tenían que quedarse. Chequear una sola deja pasar un
   DROP de más, que es el error caro.

Y una tercera, de proceso: **la confirmación no puede depender de leer bien la
salida de una UI.** `scripts/verificar-drop-columnas.mjs` lo dice en una línea y
sale con código 0 o 1. Toda migración destructiva futura debería tener su
equivalente.

> Ojo también con las etiquetas de `scripts/comparar-schema.mjs`: imprime
> `prod:` para lo que declara `docs/schema-real-2026-09.md` y `dev :` para lo
> que devuelve la base consultada, **sea cual sea el `--ref`**. No son los dos
> ambientes. Leerlo al revés lleva a conclusiones opuestas.

### Dos hallazgos del 25/9/2026 que NO son de seguridad

**1. Aceptar o rechazar una invitación no avisa a la distribuidora.**

Verificado antes de anotarlo, porque había dos explicaciones posibles: los
nueve avisos que arreglamos el 22/9 **rebotaban** contra el CHECK, y éste
podía ser lo mismo. No lo es.

```
inserts de notificación en las seis actions del gondolero:  0
```

**No están.** El camino inverso —la distri avisa al gondolero— sí los tiene:
`aprobarSolicitud` y `rechazarSolicitud` insertan `solicitud_aprobada` y
`solicitud_rechazada`. El de vuelta nunca se escribió.

Y hay un detalle que dice que alguien lo previó: **el CHECK ya acepta
`vinculacion_nueva`**, un tipo que existe en el enum y en `lib/notificaciones.ts`
y que tiene **cero filas en las dos bases**. Lo usa un solo lugar
(`app/vinculacion/actions.ts`, el camino por token) y ni siquiera ese llegó a
producir filas. El slot está, el insert no.

Al hacerlo: el destinatario es la DISTRI, o sea `actor_id` + `actor_tipo =
'distribuidora'`, no `gondolero_id`. Y conviene el helper `crearNotificacionActor`,
que chequea el error — los nueve del 22/9 rebotaban justamente por no usarlo.

**2. El editor de borradores SÍ muestra los bloques publicados.**

Reportado como que no se ven. Se relevó y **la feature existe**:
`components/campanas/draft-editor.tsx` los renderiza de solo lectura, con sus
preguntas, el tipo entre paréntesis y el asterisco de obligatorio. Las dos
páginas de detalle traen el embed `bloques_foto ( …, bloque_campos ( … ) )` y
se lo pasan como `bloquesActuales`.

Lo que pasa es otra cosa, y es lo que hay que arreglar: **hay campañas con CERO
bloques, y el vacío es mudo.**

```
campañas sin un solo bloque    dev 3    prod 1
```

Para ésas el editor dice "Bloques de foto (0)" y nada más, que en pantalla se
lee igual que si no los renderizara. No hay cartel que distinga "esta campaña
no tiene bloques" de "el editor no los muestra", y esa ambigüedad es el bug.

Aparte, dos campañas de altas tienen 1 bloque con 0 campos — eso es correcto
por diseño (ver `lib/campana-altas.ts`) pero se ve igual de vacío.

✅ **HECHO el 25/9/2026.** El cartel va en `draft-editor.tsx`, condicionado a
`bloquesActuales.length === 0 && nuevosBloques.length === 0 && !agregandoBloque`
— la tercera condición porque mientras se está cargando un bloque el cartel
contradice lo que la persona está haciendo.

> **El (0) del título no alcanzaba, y ése es el punto.** Un contador en cero es
> exactamente lo que muestra un render que falla, así que no distingue nada. Lo
> que distingue es una frase que **solo puede venir de haber consultado la
> lista**: "Esta campaña todavía no tiene ningún bloque". Es el mismo criterio
> que el aviso de excluidos del filtro de provincia — un alcance que se vacía
> entero se lee como "no hay datos", no como un filtro estricto.

---

## TRAMO PROPIO — la distri no se entera de lo que hace el gondolero

Anotado el 25/9/2026, con el alcance ya acotado. Sin empezar.

**Todas las escrituras del vínculo van de la distri hacia el gondolero y
ninguna vuelve.** La distri invita, aprueba, rechaza y desvincula, y las cuatro
avisan. El gondolero acepta, rechaza o se va, y **las tres son mudas**.

Consecuencia práctica: la distri no sabe quién está en su equipo salvo que
entre a la lista y compare. Invita a cinco y, para saber cuántos entraron,
tiene que contarlos. Y una desvinculación iniciada por el gondolero es
invisible hasta que alguien nota que dejó de trabajar — con el agravante de que
ese camino **no le paga los retenidos** (ver "Quién corta decide si los
retenidos se pagan"), así que se va con puntos trabados y nadie se entera.

### DECIDIDO — que el gondolero PIDA vinculación no va

**Hoy manda su código por WhatsApp y la distri lo invita, y eso alcanza.** El
perfil del gondolero ya tiene el botón de WhatsApp con el código, y los tres
paneles tienen el buscador por código. El camino existe y funciona; agregarle
una pantalla de "pedir entrar" es un segundo camino para lo mismo.

> **`solicitarVinculacion` QUEDA SIN LLAMADORES, A PROPÓSITO.** La función está
> completa en `gondolero/perfil/distri-actions.ts` —valida que la distri exista
> y esté validada, hace el upsert— y no la invoca ninguna pantalla desde al
> menos el 18/9/2026 (`4e92929`). **Eso no es deuda: es la decisión.** No
> conectarla.
>
> Si algún día se reconsidera, el argumento tiene que ser nuevo —que el código
> por WhatsApp no alcance— y no "hay una función suelta que nadie llama".

Con esa decisión quedan dos cosas muertas, y conviene saberlo antes de
tropezarse con ellas:

- **El tipo `gondolero_solicitud_vinculacion`** está en el CHECK de
  `notificaciones.tipo`, con **cero usos en el código y cero filas en las dos
  bases**. Era para esta feature. Queda reservado y sin dueño.
- **El vacío del ranking** (`logros-y-ranking.tsx`) YA está alineado, y se
  verificó: dice *"El ranking aparece cuando una distribuidora te vincule"* y
  muestra el código con el botón de WhatsApp. Lo arregló **`4e92929`
  (18/9/2026), el mismo commit que dejó a `solicitarVinculacion` sin
  llamadores** — o sea que esta decisión no es nueva: se tomó de hecho hace una
  semana y recién ahora quedó escrita. Barrido el resto de las pantallas:
  ninguna otra le pide al gondolero algo que la app no le deja hacer.

### EL TRAMO: los avisos que faltan

Tres eventos, **siete lugares donde escribirlos** — las seis actions de
vinculación del perfil (gondolero↔distri, fixer↔distri, fixer↔repositora) más
`desvincularseDeDistri`:

```
aceptó la invitación    → vinculacion_nueva          YA ESTÁ en el CHECK
rechazó la invitación   → no hay tipo                HAY QUE AGREGARLO
se desvinculó           → no hay tipo propio         HAY QUE AGREGARLO
```

**La migración agrega DOS tipos, no cuatro.** Medido contra el CHECK real de
las dos bases:

- `vinculacion_nueva` ya está, con **cero filas**. Lo escribe un solo lugar
  —`app/vinculacion/actions.ts`, el camino por token— y ni siquiera ése llegó a
  producir una. Alguien lo previó y no lo cableó.
- `desvinculacion_distri` existe y **ya lo usa la dirección contraria** (3
  filas en dev): es "la distri te desvinculó". Reusarlo para el camino inverso
  dejaría los dos hechos indistinguibles en la bandeja. Va uno propio.

### Lo que NO es este tramo, y conviene no confundir

**Los inserts no existen — no es el caso del 22/9.** Ahí nueve avisos
**rebotaban** contra el CHECK sin que nadie mirara el error. Acá no hay nada
que rebote: **cero inserts** de notificación en las seis actions. Verificado,
no supuesto.

### Detalles de implementación que ya están resueltos

- **El destinatario es la DISTRI**: `actor_id` + `actor_tipo =
  'distribuidora'`, no `gondolero_id`. Para el camino fixer↔repositora,
  `actor_tipo = 'repositora'`.
- **Va por `crearNotificacionActor`**, que chequea el error. Los nueve del 22/9
  rebotaban justamente por no usarlo.
- **La migración va ANTES del deploy**, al revés que un DROP: el código nuevo
  escribiría un `tipo` que la base todavía rechaza.

### Y la trampa de la tabla, para el que venga

`gondolero_distri_solicitudes` tiene **18 filas en producción y 15 en dev con
`iniciado_por = 'gondolero'`**, que se leen como "el gondolero pidió entrar".
No es cierto: **la columna tiene `DEFAULT 'gondolero'`** y ningún código vivo
escribe ese valor —el único que lo haría es `solicitarVinculacion`, que no se
llama—. Son filas del seed tomando el default.

Quien mire la tabla para decidir si ese flujo funciona va a concluir que sí.

---

## DOS TRAMOS PARA DESPUÉS DE LARGAR (anotados el 25/9/2026)

Los dos van **después** de lo que queda antes de salir. No son del mismo tipo:
el primero es una feature con un problema de producto conocido; el segundo es
el modelo de negocio, y decide si GondolApp cobra o no.

### 1 · Catálogo de premios por distribuidora

Hoy el catálogo es global y es de GondolApp. En una campaña interna de Biomega,
lo que se canjea debería definirlo Biomega.

Ya estaba anotado como "configurable por actor" —ver "Catálogo de premios por
marca y distribuidora" más arriba, con sus tres salidas sin elegir—, pero
**relevado el 25/9/2026 el punto de partida es peor de lo que sugiere esa
palabra**:

```
tabla premios                        NO EXISTE
canjes.premio                        text, sin CHECK, NOT NULL
el "catálogo"                        un z.enum de CUATRO valores en
                                     lib/validations/index.ts:185
los precios                          COSTO_CANJE, un Record en
                                     app/(gondolero)/gondolero/perfil/actions.ts:14
las etiquetas                        labelPremio() en lib/utils.ts:204
canjes                               2 filas en dev (las dos nafta_ypf), 0 en prod
```

**No hay nada que hacer configurable: hay una entidad que no existe.** El
catálogo vive repartido en tres constantes de TypeScript en tres archivos
distintos —el enum, los precios y los labels—, y la columna que lo guarda es
texto libre. Hacerlo por distribuidora es crear la tabla, migrar los cuatro
valores y reunir las tres constantes, antes de tocar nada del alcance por
actor.

Y el problema de producto sigue intacto y sigue siendo previo: **si los premios
son de cada distri, los puntos quedan atados a quien los entrega y el incentivo
del gondolero se fragmenta.** 300 puntos con una y 150 con otra puede no
alcanzar para nada. Eso no se resuelve con modelo de datos.

### 2 · El modelo de tokens — no es una feature, es el modelo de negocio

`distribuidoras.tokens_disponibles` y `movimientos_tokens` existen desde el
schema inicial, pero **nunca se definió qué los genera ni qué los consume**. Lo
que hay hoy, medido en las dos bases:

| | dev | prod |
|---|---|---|
| filas en `movimientos_tokens` | 4 | 1 |
| de ellas, `actor_tipo = 'marca'`, `tipo = 'consumo'`, monto 15 | **todas** | **todas** |
| filas de `actor_tipo = 'distribuidora'` | **0** | **0** |
| filas de `tipo = 'ingreso'` (o cualquier otro que sume) | **0** | **0** |
| distribuidoras con tokens | 0 de 3 | **0 de 6** |

**El sistema tiene un solo escritor de tokens en toda la app**, y es una resta:
`app/(marca)/marca/campanas/nueva/actions.ts` descuenta 15 al crear una campaña
(línea 155) y registra el movimiento (línea 168). **No existe ningún camino que
sume.** El admin crea marcas y distris con `tokens_disponibles: 0` y no hay
pantalla para cargarles. Los 5000 de las marcas son del seed.

O sea: la economía **solo drena**. Hoy no se nota porque las marcas arrancan con
saldo de seed, y el día que se acabe nadie puede crear una campaña.

#### La idea a evaluar, y el argumento que la sostiene

**Que los tokens los genere la MARCA al contratar, y que la distri los gane
ejecutando esas campañas.** El dinero entra por un solo lado y se reparte hacia
adentro.

El contraejemplo es lo que decide: **si los tokens los generara el solo uso de
la plataforma, el sistema se financia solo y nadie paga.** La distri gana tokens
relevando y los gasta relevando, el circuito cierra sin que entre un peso, y
GondolApp no cobra. No es un detalle de parametrización: es la diferencia entre
un negocio y una herramienta gratis.

Por eso **va con relevamiento propio**, y antes de escribir una línea.

#### Lo que ya está escrito y hay que revisar, no heredar

La sección "Flujo de tokens al vincularse con marca" de más arriba lista cuatro
parámetros (`tokens_vinculacion_marca_distri`, `tokens_gondolero_mision`,
`tokens_comercio_validado`, `tokens_gondolero_nuevo`) y dice que las marcas
inyectan y GondolApp retiene un take rate. **Tres de esos cuatro parámetros
generan tokens por uso**, que es exactamente el contraejemplo de arriba. Está
escrito como si la decisión estuviera tomada y no lo está.

#### Dos cosas del código de hoy que el tramo toca sí o sí

- **El descuento es un read-modify-write.** `update({ tokens_disponibles:
  (marca?.tokens_disponibles ?? 0) - COSTO_CREACION })` lee el saldo y escribe
  la resta: dos campañas creadas a la vez se pisan y una de las dos sale
  gratis. Con saldo de seed no importa; con plata sí.
- **Las dos escrituras no chequean el `.error`.** Ni la resta ni el insert del
  movimiento. Son dos de las 137 anotadas, pero éstas mueven saldo: el caso
  caro es la campaña creada sin que se descuente nada.

---

## La pantalla de zonas del onboarding (sacada el 25/9/2026)

Reportado como "no guarda nada". **Guardaba** — en la tabla equivocada, que es
peor.

`app/auth/page.tsx` insertaba en `gondolero_zonas`; el perfil lee
`gondolero_localidades`. Dos sistemas paralelos, y el onboarding escribía en el
viejo. Medido antes de tocar nada:

| | dev | prod |
|---|---|---|
| `gondolero_zonas` (viejo, `zona_id`) | 0 | **5** |
| `gondolero_localidades` (nuevo, `nivel`+`ref_id`) | 24 | **0** |

Las 5 de prod eran de un usuario real, todas del 25/9/2026.

### El daño no era que no se vieran: era que APAGABAN el aviso

`gondolero/campanas/page.tsx` calcula `tieneZonas` mirando **las dos** tablas.
Con esas filas puestas, la cuenta quedaba así:

1. el perfil en blanco, porque mira la otra tabla;
2. el cartel amarillo "seleccioná tus localidades en tu Perfil" **no aparecía**,
   porque para esa cuenta ya "había zonas";
3. y el filtro corría con esos `zona_id` contra `campana_zonas`, que tiene
   **cero filas en las dos bases**: quedaban solo las campañas abiertas o sin
   zona, y se caían las 7 que tienen localidades.

**El que pasaba por la pantalla veía MENOS campañas que el que apretaba "Omitir
por ahora".**

### Por qué no se arregló en el lugar

No era una línea. La pantalla tiene **uuids de `zonas`** y la tabla nueva quiere
**`(nivel, ref_id)` del padrón**; convertir uno en otro es buscar por nombre, el
`ilike` que ya mordió y que `lib/geocoding.ts` mató. El selector del perfil ya
lo hace bien y además deja elegir provincia y departamento, que ahí no se podía.

Y el catálogo tampoco servía: **seis ciudades** —la tabla legacy `zonas` entera,
`tipo='ciudad'`— contra un padrón con 143 localidades solo en Entre Ríos. Un
gondolero de Villaguay no tenía cómo decirlo.

En su lugar quedó la fase `avisoZonas`: un aviso con "Configurar mis zonas" y
"Ahora no". No es un paso obligatorio, y el cartel amarillo de la lista de
campañas sigue siendo la segunda vía para el que lo saltea.

### La diferencia dev/prod era si la pantalla llegaba a APARECER

El código es el mismo. La fase solo se muestra si `signUpData.session` viene con
sesión, o sea **con la confirmación de email desactivada**.

```
confirmados al instante (0 s)    dev 33 de 34    prod 45 de 45
el alta de gondolero del 25/9    dev 84 s        prod 0 s
```

Prod nunca tardó: la pantalla aparecía siempre. En dev, el alta de ese día tardó
84 segundos, que es lo que se ve cuando alguien va al mail. **Es la explicación
más probable de que dev tuviera cero filas, pero es UN dato**: se confirma en
*Auth → Email → Confirm email* de cada proyecto, que no se lee por SQL.

### La limpieza: migración `20261006100000`

Borra las filas de `gondolero_zonas`. **Va DESPUÉS del deploy**, al revés que la
migración de avisos y por la razón inversa: acá el que escribe es el código
viejo, así que si corre primero, un registro en la ventana vuelve a crearlas.

Dry-run verde en dev y prod: `probar-migracion-limpiar-gondolero-zonas.mjs`. El
control que importa no es que la tabla quede en cero: es que **`tieneZonas`
pase de `true` a `false`** para los afectados, calculado en SQL igual que lo
calcula la página. Y como en dev la tabla estaba vacía —donde un "quedó en
cero" no prueba nada—, el caso 6 crea la fila a propósito para tener algo que
borrar.

---

## TRAMO legacy de zonas — PASOS 1 y 2 HECHOS el 26/9/2026

**Cero lectores** de `zonas`, `campana_zonas` y `gondolero_zonas` en toda la
app. Lo único que queda son comentarios que las nombran. **Falta el deploy, la
verificación en prod y el DROP.**

### Paso 2 — sacar los lectores

Antes de sacar el panel de admin se relevaron las dos cosas que podían
frenarlo, y ninguna frenó:

**¿`zonas` tiene otro lector?** No. Solo el panel: `page.tsx` y las tres
actions. El lector de Logros (`zonas.select('id, tipo')`, que existía únicamente
para preguntar de qué tipo era cada uuid) se fue con el port del paso 1. En la
base, las únicas dependencias son las dos FK de `campana_zonas` y
`gondolero_zonas` — **cero funciones, cero vistas**, en las dos bases.

> Y una que conviene no confundir: **`SelectorZona` NO usa `zonas`.** Usa el
> padrón (`provincias`/`departamentos`/`localidades`). El nombre se parece y la
> tabla no tiene nada que ver.

**¿El panel tiene algo más que el ABM?** No. Es ABM puro de `zonas` en tres
archivos, y las columnas "Campañas" y "Gondoleros" cuentan `campana_zonas` y
`gondolero_zonas`, las dos en cero — o sea que cada fila mostraba 0 y 0.

Lo que se sacó:

| Dónde | Qué |
|---|---|
| `app/(admin)/admin/zonas/` | **borrado entero** — `page.tsx`, `actions.ts`, `zona-modal.tsx`. Un ABM de algo que nadie lee es lo que alguien usa creyendo que sirve |
| `admin-shell.tsx` | el link "Zonas" del nav, y el icono que quedaba sin usar |
| `gondolero/campanas/page.tsx` | la lectura de `gondolero_zonas`, el `\|\|` muerto de `tieneZonas`, y **las dos consultas en paralelo contra `campana_zonas`** que siempre aportaban el arreglo vacío |
| `admin/repositoras/page.tsx` | el embed `campana_zonas(zona_id)`, que **se traía y no lo leía nadie** — de esa consulta solo se toma `.length` |
| `supabase/seed.sql` | los dos `INSERT INTO campana_zonas ... FROM zonas`, que ya no insertaban nada porque el seed nunca cargó `zonas` |

> **El embed de repositoras es el que más valía encontrar.** Una relación
> embebida que no se lee no molesta hoy y **voltea la consulta ENTERA** el día
> que la tabla no esté — PostgREST rechaza todo, no solo el embed. Es el mismo
> modo de falla que `perfil/page.tsx` tiene documentado con una columna de más
> en el `select`.

> **Y el seed es la segunda vez en este tramo.** Mismo caso que el `zona_id` de
> comercios el 25/9: un INSERT que ya no hacía nada y que después del DROP
> sería un error duro que voltea el seed entero en cualquier base nueva.

### Paso 1 — el ranking portado

Los tres lectores de Logros se fueron acá.

### Lo primero: el ranking NO estaba vacío en pantalla, estaba AUSENTE

`activo: hayZona` con `hayZona = misZonaIds.length > 0`, y `tabsActivos` filtra
por `activo`. Con `gondolero_zonas` vacía las dos solapas **desaparecen**: no
se ve un ranking vacío, se ve una solapa menos.

Lo que sí estuvo muerto en pantalla fue **antes** de vaciar la tabla: el único
usuario con filas veía la solapa "Mi Zona" con un ranking de **una persona, él
mismo**, porque nadie más tenía filas. Eso lo sacó la limpieza del 25/9.

### Se fue "Mi Zona". El ranking queda en Mi Distri + Provincia

**Con niveles, "zona" dejó de significar algo estable**: para uno es una
provincia entera y para otro un pueblo, así que dos gondoleros comparando "su
zona" no están comparando lo mismo. La provincia sí es una unidad que todos
entienden igual.

Y había un problema mecánico además del conceptual: definiendo zona como
superposición de alcances, **las dos solapas colapsaban** para cualquiera que
hubiera declarado a nivel provincia — su "zona" ES una provincia, así que las
dos listas eran idénticas.

La solapa de provincia se rotula con el NOMBRE cuando hay una sola: "Entre
Ríos" dice más que "Provincia" y no cuesta nada.

### `provinciasDeGondoleros` SUBE la jerarquía, y eso fue la decisión

La operación inversa a `expandirZonas`: aquélla baja de provincia a
localidades, ésta sube de lo declarado a la provincia que lo contiene.

**Lo decidió la medición, no la teoría.** Los únicos dos gondoleros con zonas
cargadas en dev:

```
Gabriel   Entre Ríos y Corrientes (provincia) + Gualeguay (departamento)
Raúl      21 LOCALIDADES, todas de Entre Ríos

subiendo la jerarquía    →  Entre Ríos: 2 gondoleros
solo el nivel provincia  →  Entre Ríos: 1   ← Raúl no entra en la suya
```

**La versión literal deja afuera justo al que hizo el trabajo de declarar.** Y
no es casualidad de estos datos: **21 de las 24 filas son de nivel localidad**,
así que nace vacía.

Los dos saltos son por el padrón: `localidades` no tiene `provincia_id`. Dos
consultas como mucho, y cero si todos declararon a nivel provincia.

### De tres consultas y dos tablas, a una llamada

```
ANTES  gondolero_zonas  →  mis zonas (uuids)
       zonas            →  ¿cuáles son de tipo provincia?   ← este paso existía
       gondolero_zonas  →  quiénes más las tienen             solo porque un
                                                              uuid no dice de
                                                              qué nivel es
AHORA  provinciasDeGondoleros([yo, ...todosIds])
```

Se pide para **todo el universo del ranking de una vez**, yo incluido: es la
misma pregunta, y partirla en dos era un round-trip de más. La pertenencia
sale después de intersectar dos `Set`, sin otra consulta.

Falla **cerrada**: si no se pueden leer las zonas, el ranking provincial no se
muestra en vez de mostrarse incompleto. Un ranking al que le faltan colegas es
peor que uno que no está — el que lo mira saca conclusiones sobre su posición.

### El control, y que muerde

`scripts/probar-provincias-gondolero.mts`, contra dev, creando y restaurando
filas. El caso que fija la decisión de producto se llama así en la salida:
**"LA DECISIÓN DEL TRAMO: el de la localidad suelta comparte ranking"**.

Verificado revirtiendo la función a la versión literal —solo nivel
provincia—: **pone cuatro en rojo**, incluido ése.

### PERO: en producción esto no se ve, y hay que saberlo

```
gondoleros/fixers        dev 25    prod 31
…con zonas declaradas    dev  2    prod  0
```

**`gondolero_localidades` tiene cero filas en producción.** Después del port,
la solapa de provincia sigue sin aparecer para los 31, exactamente como antes.

Lo que la enciende no es este paso: es que la gente declare sus zonas, que ya
está empujado por el aviso del onboarding y los badges en ámbar del perfil.

> **Entonces por qué va primero igual:** porque es **el bloqueante del DROP**.
> Mientras los lectores sigan ahí, la tabla no se puede borrar. Su efecto
> visible hoy es cero, y eso tiene una ventaja: **el riesgo de este paso es
> casi todo de regresión, no de estreno**, así que se puede verificar con
> calma.

### Lo que NO se tocó, a propósito

El vacío del ranking sigue hablando solo del vínculo y no también de declarar
zonas. Para el que cae ahí —sin distri y sin provincia— el vínculo es el
bloqueante grande: sin él no ve campañas, no releva y no cobra. Pedirle dos
cosas a la vez diluye la que importa.

## TRAMO PROPIO — dropear el sistema de zonas legacy

Anotado el 25/9/2026. Sin empezar. **No urgente y no trivial**: hay una feature
viva adentro.

Después de `20261006100000`, `gondolero_zonas` queda **sin un solo escritor**.
Pero le quedan **cinco lecturas en cuatro archivos**, y todas leen una tabla que
ahora está vacía en las dos bases:

| Dónde | Qué hace | Qué pasa con la tabla vacía |
|---|---|---|
| `gondolero/campanas/page.tsx:36` | `zonaIds` para `tieneZonas` y el filtro | inocuo: `tieneZonas` pasa a depender solo de localidades, que es lo correcto |
| `gondolero/logros/page.tsx:113` | `misZonaIds` del gondolero | **el ranking por zona queda siempre vacío** |
| `gondolero/logros/page.tsx:223` | colegas de la misma zona | ídem |
| `gondolero/logros/page.tsx:248` | colegas de la misma provincia | ídem |
| `admin/zonas/page.tsx:19` | contar gondoleros por zona | la columna muestra 0 en las 8 zonas |

### Lo que hace que esto NO sea un borrado

**El ranking por zona y por provincia de Logros es una feature, y está muerta en
silencio.** No se cae: se muestra vacía. Dropear la tabla no la rompe más de lo
que ya está, pero el tramo tiene que **portarla a `gondolero_localidades`**, no
borrarla junto con la tabla.

#### Y "colegas de mi provincia" sale más directo con el nivel

Hoy hacen falta **tres consultas y una tabla de apoyo**, porque en el sistema
viejo una zona no dice de qué tipo es:

```
1. gondolero_zonas  →  misZonaIds                        (logros:113)
2. zonas            →  ¿cuáles de ésas son 'provincia'?  (logros:226)
3. gondolero_zonas  →  quiénes más tienen esas zonas     (logros:248)
```

Con `gondolero_localidades` el paso 2 **desaparece**: el nivel viaja en la fila.

```
1. gondolero_localidades  WHERE gondolero_id = yo AND nivel = 'provincia'
2. gondolero_localidades  WHERE nivel = 'provincia' AND ref_id IN (las mías)
```

Dos consultas, una tabla, y sin preguntarle a nadie de qué tipo es cada zona.

> **Ojo con la versión ambiciosa, que NO es gratis.** Lo de arriba son "los que
> declararon la misma provincia". Si se quiere "los que trabajan EN mi
> provincia" —incluyendo al que declaró una localidad suelta— hay que subir la
> jerarquía, y **`localidades` no tiene `provincia_id`**: son dos saltos
> (`localidad → departamento → provincia`), el mismo detalle que ya está
> documentado en `expandirZonas` y que costó un embed apuntando a una columna
> inexistente. Es una decisión de producto con costo, no un detalle de
> implementación.
>
> El padrón de hoy: **24 provincias, 524 departamentos, 941 localidades.**

### El resto del sistema legacy, para dimensionarlo

Son tres tablas y todas están vacías o casi:

```
zonas              8 filas (6 ciudades + 2 provincias), en las dos bases
campana_zonas      0 filas en las dos
gondolero_zonas    0 después de 20261006100000
```

`comercios.zona_id` ya se fue en `20261005100000`. Los lectores que quedan de
`campana_zonas` son `gondolero/campanas/page.tsx` (dos), `admin/zonas/` (página
y actions) y `admin/repositoras/page.tsx`. El panel `admin/zonas` entero es
legacy: es el ABM de una tabla que ya no alimenta nada.

**El orden es el de siempre**, y esta vez con un paso más adelante: portar el
ranking → sacar los lectores → deploy → verificar en prod → DROP. Con el grep
DESPUÉS de escribir el código, no antes — que en el DROP de `comercios.zona_id`
encontró dos escritores que la verificación previa había dado por limpios.

### Y un arreglo que salió del mismo relevamiento (hecho)

`scripts/seed-zonas.ts` limpiaba `gondolero_localidades` con
`.delete().neq('localidad_id', 0)`, y esa columna la borró `20261002100000`.
PostgREST rechaza la consulta entera, nadie miraba el `.error`, y **la limpieza
fallaba en silencio**: el seed seguía, borraba el padrón, y las filas viejas
quedaban apuntando a ids que ya no significan lo mismo.

Ahora los cinco borrados van por una lista, filtran con `not(col, 'is', null)`
sobre una columna NOT NULL —matchea todas las filas y no depende del tipo— y
cada uno **mira su error y corta**. El `.neq(col, 0)` anterior además se salteaba
en silencio las filas donde la columna es NULL, como `campana_localidades.localidad_id`.

---

## DECIDIDO — el registro queda abierto: el VÍNCULO es la aprobación

25/9/2026. No hay moderación de altas y no hace falta.

**El argumento.** Un gondolero sin vínculo no ve campañas, no releva y no cobra.
Cualquier cosa que pudiera hacer un registro malicioso ya está cortada por el
vínculo, así que una aprobación previa sería una segunda puerta delante de una
que ya está cerrada. **El vínculo ES la aprobación**, y la toma quien tiene el
dato para tomarla: la distribuidora que lo conoce, no un admin mirando un mail.

Y el que aprueba ya es el que paga. Sumar un filtro antes no agrega criterio:
agrega una cola.

### Pero el que entra por primera vez no se entera

Relevado el 25/9/2026 sobre las cuatro pantallas, para un gondolero recién
registrado, **sin vínculo y sin zonas**. Aterriza en `/gondolero/campanas`
(`middleware.ts:23`).

Primero, lo que efectivamente ve, que no es una app vacía:

```
campañas activas de gondolero        dev 19    prod  6
las que puede ver SIN vínculo         dev  1    prod  1   ← "Alta comercios zona norte"
gondoleros sin vínculo aprobado       dev  2    prod  3
```

Una sola, financiada por `gondolapp`, que pasa por el paso 2 de
`accesoACampana`. **Las otras cinco de prod no aparecen: ni tarjeta, ni
contador, ni mensaje.** `disponibles` exige `tieneAcceso`, y `ofertas` exige
`postulable`, que pide `esFixer`. Un gondolero no ve ninguna de las dos cosas.

### Las cuatro pantallas, una por una

| Pantalla | Qué ve | ¿Dice que le falta vincularse? | ¿Dice cómo? |
|---|---|---|---|
| **Campañas** | 1 campaña, y el cartel amarillo de zonas | **No — y desvía** | No |
| **Actividad** | "Sin notificaciones nuevas" · "Todavía no hay movimientos." | No | No |
| **Logros** | El vacío del ranking con su código y el botón de WhatsApp | Sí, pero como límite del ranking | **Sí** |
| **Perfil** | "Sin distribuidora vinculada" + el código | Sí, textual | **Sí** |

**Campañas es la peor, y es la primera.** El único cartel que muestra habla de
zonas —"Seleccioná tus localidades de trabajo en tu Perfil"— y el vacío de
`campanas-sections.tsx:693` dice *"Cuando haya campañas disponibles en tu zona
van a aparecer acá"*. Los dos **explican la escasez por la geografía**, que no
es la causa: aunque declare sus zonas, sin vínculo va a seguir viendo una.
No es que falte el mensaje: es que hay uno que apunta al lado equivocado.

**Logros lo dice bien pero por la razón chica.** `logros-y-ranking.tsx:320`:
"El ranking aparece cuando una distribuidora te vincule", con el código y el
WhatsApp que ya manda el texto correcto. Es el camino completo —copiar, mandar,
que la distri lo cargue— pero enmarcado como una limitación **del ranking**, no
como la razón por la que la app entera está vacía. Y está en la sección 3+4,
scrolleando.

**Perfil lo dice textual y lo esconde.** `distri-section.tsx:392`: "Sin
distribuidora vinculada · Pedile a tu distribuidora que te invite por link o
que ingrese tu código personal para vincularte", con `CodigoGondolero` arriba.
Es exactamente el mensaje que hace falta. El problema es dónde está:

> **Las dos secciones son `ColapsableSection` con `defaultOpen={false}`**, y el
> `badge` es `null` cuando hay cero. O sea que el gondolero recién registrado ve
> dos títulos cerrados —"Mis zonas de trabajo" y "Mi distribuidora"— **sin una
> sola marca de que adentro hay algo que le falta**. El badge solo aparece con
> invitaciones pendientes o con más de una distri activa: justo los casos en que
> ya está resuelto.

### Lo que se hizo — los tres, el 25/9/2026

**Actividad queda MUDA a propósito.** Un recién registrado no tiene actividad y
eso es correcto; meterle un cartel ahí sería el mismo mensaje en cuatro lugares.

#### 1. Las bloqueadas, agrupadas por con quién hay que vincularse

`lib/campanas-bloqueadas.ts` + la sección "No disponibles para vos" en
`campanas-sections.tsx`. El motivo **no se reescribe**: sale de
`accesoACampana`, el mismo que decide `disponibles` y `ofertas`, así que la
pantalla no puede decir una cosa distinta de la que hace el gate.

**La decisión era tope o agrupación, y la resolvió cómo crece cada número:**

| | campañas bloqueadas | grupos |
|---|---|---|
| dev | 16 | **4** (Biomega sola son 11) |
| prod | 4 | **3** |

Las campañas crecen con el negocio; los grupos crecen con las distribuidoras
que operan en su zona, que es otro orden de magnitud. Si mañana Biomega publica
cincuenta, la lista por campaña pasa a 50 filas ilegibles y la agrupada sigue
siendo una línea con otro número adentro. **Un tope sobre las campañas habría
escondido información sin ordenarla; agrupar la ordena y no esconde nada.** Y la
unidad accionable no es la campaña: el texto de las once de Biomega es el mismo
texto once veces, y lo que puede hacer con eso es una sola cosa.

Igual hay un tope, pero **sobre los grupos** (`TOPE_GRUPOS = 4`), con un "y N
campañas más de M organizaciones". Hoy no muerde en ninguna base.

**Dos motivos NO se muestran**, y eso es parte del diseño: `actor_distinto` no
llega nunca —la query ya filtra por `actor_campana`— y `campana_sin_financiador`
es un problema de datos de la campaña, con un mensaje neutro a propósito y con
el que el gondolero no puede hacer nada. El que se tiene que enterar es quien la
creó, y para eso `accesoACampana` ya loguea.

#### 2. El vacío dejó de culpar a la geografía — y el cartel de zonas también

El 📭 decía *"campañas disponibles **en tu zona**"*. Ahora dice "Todavía no hay
campañas para vos", y con el bloque del punto 1 puesto **casi no se llega ahí**:
las bloqueadas cuentan como algo que mostrar, así que el vacío queda solo para
cuando no hay nada de nada.

> **Y el cartel amarillo de zonas ahora pide `tieneAlgunVinculo`.** Se mostraba
> siempre que faltaran zonas, incluso con CERO vínculos, y ahí miente por
> omisión: declarar localidades no habilita una sola campaña más mientras no lo
> vincule nadie. Era **el primer texto que leía un recién registrado** y le
> señalaba la causa equivocada. Con vínculo es exacto y se muestra igual.

#### 3. Los badges del perfil marcan el CERO

"Mis zonas de trabajo" → `Sin configurar` en ámbar. "Mi distribuidora" →
`Sin vincular` en ámbar, o `Pendiente` si ya hay una solicitud esperando.

El badge solo aparecía con invitaciones pendientes o con más de una distri
activa — **justo los casos en que ya está resuelto**. Ojo con
`ColapsableSection`: esconde el badge cuando vale `0` o `''`, así que el aviso
tiene que ser un string, no un número.

#### Lo que el control encontró, que la lectura no

`scripts/probar-campanas-bloqueadas.ts`, 9 casos. **Dos defectos míos, los dos
en los controles y no en la lib:**

1. **Una fixture que no probaba lo que decía.** Para disparar
   `campana_sin_financiador` había puesto `financiada_por='distri'` sin
   `distri_id`… y sin `marca_id`. El paso 2 de `accesoACampana` la deja pasar
   como de GondolApp —"sin ejecutora y sin marca no hay a quién pertenecer"—, o
   sea que el caso nunca llegaba al motivo que quería probar.
2. **Dos controles de orden que NO PODÍAN FALLAR.** Los nombres de las fixtures
   estaban en el mismo orden que los tamaños ("Biomega" 3, "Distri Norte" 1), así
   que ordenar por nombre daba el mismo resultado que ordenar por tamaño.
   **Verificado rompiendo el sort a propósito: quedaban en verde.** Con los
   nombres invertidos, la misma mutación pone tres en rojo.

---

## Filtro de provincia y KPI de provincias — HECHO el 26/9/2026

### La migración `20261008100000` — `panel_pdv` con geografía completa

Devuelve además `departamento_id/nombre` y `provincia_id/nombre`. La cadena es
de cuatro niveles porque **`localidades` no tiene `provincia_id`** —la
divergencia del dump que ya costó un embed a una columna inexistente—:

```
comercios.localidad_id → localidades.departamento_id
                       → departamentos.provincia_id → provincias
```

Resuelve **106/106 en dev y 98/98 en prod**. Los JOIN son LEFT: un comercio sin
localidad llega con las cuatro columnas en NULL, no desaparece.

> **Lo caro no fue el JOIN: fue el DROP.** `CREATE OR REPLACE` no puede cambiar
> el tipo de retorno, así que agregar columnas obliga a dropear. Y **con el
> DROP se van los permisos**: Supabase tiene un `ALTER DEFAULT PRIVILEGES` que
> le da EXECUTE a `anon` y `authenticated` sobre cada función nueva, de forma
> explícita. Recrear sin revocar **no deja la función como estaba: la deja
> abierta**, y el parámetro es una lista de campañas, un dato que varias
> pantallas muestran.
>
> El dry-run corre la migración **sin los REVOKE** para probar que el peligro
> es real. Encontró algo mejor de lo que el control esperaba: no llega a dejar
> la función abierta porque **el bloque de verificación de la propia migración
> la aborta** con `anon=t authenticated=t`.

### El parámetro: un string separado por comas

`?prov=2,6`. No por estética: **`hrefMapa` borra la clave cuando el valor es
`''`**, así que deseleccionar todo deja la URL sin la clave y la ausencia
vuelve a ser "todas". El invariante *"no existe forma de escribir «ninguna»"*
**sale del código que ya hay** en vez de depender de que cada llamador se
acuerde. Con claves repetidas habría que cambiar la firma de `hrefMapa` y cada
lector de Next pasaría a recibir `string | string[]`.

La selección se normaliza —ordenada y sin repetidos— para que la URL sea
canónica: sin eso, elegir dos provincias en distinto orden da links distintos
para la misma pantalla.

### LAS TRES LISTAS BLANCAS, que era el riesgo real

No era la serialización. Eran los lugares que **enumeran las claves** y tiran
en silencio la que no conocen. Es la tercera vez que un href que no conserva lo
que ya estaba muerde, y el modo de falla es el peor: **no rompe nada visible**.

| Dónde | Qué era | Cómo quedó |
|---|---|---|
| `hrefDelMapa` | el cuerpo listaba `alcance`, `campana`, `pintar` | recorre `SERIALIZAR`, una tabla que **el tipo obliga a tener completa** |
| `panel/page.tsx` | `` `${RUTA}?alcance=${...}` `` a mano, y `<SerieMensual>` mergea encima | armada con `hrefMapa` |
| `pantalla-mapa.tsx` | construye el `EstadoDelMapa` a mano | pasa `prov`, y el control lo verifica |

```ts
type Serializadores = {
  [K in keyof Required<EstadoDelMapa>]: (v: EstadoDelMapa[K]) => string | null
}
```

`Required<>` es lo que hace el trabajo. **Verificado agregando una clave al
tipo sin agregarla a la tabla: no compila** —*"Property 'claveNueva' is missing
in type ... but required in type 'Serializadores'"*—.

> **Pero el tipo protege cómo se ESCRIBE el estado, no cómo se CONSTRUYE.**
> Todos los campos de `EstadoDelMapa` son opcionales, así que armarlo sin
> `prov` compila igual — que es justo lo que hace `pantalla-mapa.tsx`. Para eso
> está el caso 7 de `probar-filtro-provincia.ts`: arma un estado con **todas**
> las claves del tipo (con un `satisfies` que impide que la fixture se quede
> vieja) y verifica que cada una sobreviva un ida y vuelta.

### Los dos números del KPI

Salen de `panel_pdv` sola: provincias distintas sobre todas las filas, y
provincias distintas donde `verdaderos > 0`. **`verdaderos > 0` es el mismo
predicado que `agruparCobertura` usa para `conPresencia`**, así que el KPI y la
tabla de cobertura no pueden divergir.

Se calcula sobre lo FILTRADO, igual que el resto de los KPIs: un número de
cabecera que ignorara el filtro contradiría al cuerpo, y de los dos errores
posibles ése es el peor —el que mira no sabe cuál de los dos le habla—.

**Con cero provincias el componente devuelve `null`**, no "0 de 0". Mismo
criterio que las métricas sin datos, que muestran "—" con "no se está
midiendo".

Y lo que cuenta el denominador, dicho sin vueltas: **provincias con una visita
viva, no con una medición**. Una provincia donde nadie contestó la pregunta de
presencia suma ahí y no en el otro número, que es lo que hace informativa la
pareja. El texto del KPI lo aclara.

### El aviso de excluidos, y por qué NO es para el cero de hoy

```
comercios sin localidad    dev 0 de 106    prod 0 de 98
```

El tramo de geocoding lo cerró entero. **Pero el cero es una foto, no una
propiedad**: el alta escribe `localidad_sugerida_id`, **no** `localidad_id`, así
que un comercio recién cargado no tiene provincia hasta que la distri confirma
la sugerencia en su bandeja.

O sea que el aviso se va a disparar seguido y **sobre los comercios más
nuevos**, que son los que la marca mira. Por eso el texto dice *"esperando que
la distribuidora confirme su localidad"* y no "sin localidad": lo primero es
accionable —alguien tiene algo que hacer y se sabe quién— y lo segundo suena a
dato roto.

El grupo equivalente de `agruparCobertura` se llama igual, por lo mismo.

> **Y el caso que evita la conclusión errónea:** si TODO lo pedido en la URL
> está fuera de los datos —un link viejo, una provincia donde se dejó de
> relevar— **no se filtra por nada**. Filtrar por un conjunto vacío daría una
> pantalla en blanco, y una pantalla en blanco se lee como "no hay datos", que
> es justo la lectura que este tramo vino a evitar. Se devuelve el universo y
> el aviso explica que ese pedazo del link no se aplicó.

### Una cosa que arreglé de paso y no era mía

`npm run typecheck:scripts` **ya estaba en rojo** antes de este tramo, por una
fixture de `PuntoSerie` sin `conValor` ni `verdaderos` en
`probar-panel-metricas.ts`. Verificado con el árbol limpio. Queda arreglada:
un typecheck que siempre falla es una guarda apagada.
