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
├── .env.local                   # Variables de entorno (NUNCA commitear)
├── .env.example                 # Template de variables (sí commitear)
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
# Rama principal
main → producción en Vercel (auto-deploy)

# Ramas de desarrollo
feature/gondolero-captura
feature/distribuidora-panel
feature/marca-campanas
feature/admin-basico

# Mensajes de commit en español
git commit -m "feat: agregar validación GPS en flujo de captura"
git commit -m "fix: corregir cálculo de puntos en tablero"
git commit -m "chore: actualizar esquema de base de datos"
```

**Vercel:**
- Conectado al repo de GitHub
- Deploy automático en push a `main`
- Preview deployments en cada PR
- Variables de entorno configuradas en el dashboard de Vercel

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
- Commit y push automático a main al terminar cada tarea
- Solo pausar ante: borrado de archivos, cambios en .env.local
- Nunca pedir permiso para leer archivos del proyecto

---

*Última actualización: Marzo 2026*
*Versión del documento: 1.0*
