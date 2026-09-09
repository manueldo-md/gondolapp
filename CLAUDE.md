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
  tipo_contenido text           -- propios | competencia | ambos
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
- **Commitear y pushear a `dev`, nunca a `main`.** `main` solo avanza por
  fast-forward desde `dev`, y ese merge lo pide el usuario explícitamente. Ver
  "Regla de ramas". (Hasta el 8/9/2026 acá decía "commit y push automático a
  main"; con dos ambientes eso deploya a producción sin pasar por dev.)
- Solo pausar ante: borrado de archivos, cambios en `.env.local` o
  `.env.dev.local`, y cualquier escritura sobre producción
- Nunca pedir permiso para leer archivos del proyecto

---

## 18. Features pendientes de diseño

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
5. Cualquier otra migración pendiente entre ambos proyectos Supabase
6. Correr el script de diagnóstico de misiones en limbo y decidir si repararlas
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

### Notificaciones push — pendiente V2
La app es una PWA. Supabase Realtime + badge en navbar es el canal actual para
avisar al gondolero. Las push notifications nativas del browser (Service Worker +
Web Push API) están en V2. Ver sección "EXCLUIDO DEL MVP" en §8.
Antes de implementar: evaluar soporte en iOS Safari (requiere iOS 16.4+ y que
el usuario haya instalado la PWA en el home screen).

### distri_id null en gondoleros de dev
El seed no vincula automáticamente los gondoleros de dev a Biomega. Solución:
correr el bloque SQL al final de `supabase/seed.sql` después de crear los usuarios
en Supabase Auth. Ver comentario "VINCULAR GONDOLEROS DE DEV A BIOMEGA" en el seed.
