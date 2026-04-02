# GondolApp

> El mapa en tiempo real del consumo masivo argentino.

Plataforma de inteligencia de mercado para el canal tradicional de distribución argentino. Conecta gondoleros (vendedores de campo), distribuidoras y marcas a través de fotos de góndola geolocalizadas.

**Piloto:** Biomega (distribuidora, Entre Ríos) + Georgalos/Entrenuts (marcas).

---

## Stack tecnológico

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend/DB:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Deploy:** Vercel
- **UI:** shadcn/ui + Radix UI + Lucide React
- **Estado:** Zustand + React Query

---

## Setup inicial

### Prerequisitos

- Node.js 18+
- npm o pnpm
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Vercel](https://vercel.com) (gratis)
- Cuenta en [GitHub](https://github.com)

### 1. Clonar el repositorio

```bash
git clone https://github.com/tu-usuario/gondolapp.git
cd gondolapp
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Completar los valores en `.env.local`:

1. Ir a [supabase.com](https://supabase.com) → crear proyecto nuevo
2. Ir a Settings → API
3. Copiar `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
4. Copiar `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Copiar `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

### 4. Configurar la base de datos

```bash
# Instalar Supabase CLI si no está instalado
npm install -g supabase

# Login
supabase login

# Conectar al proyecto remoto (obtener project-id del dashboard)
supabase link --project-ref tu-project-id

# Aplicar migraciones
supabase db push

# Generar tipos TypeScript desde el schema
npm run db:types
```

Alternativamente, ejecutar manualmente el SQL de `supabase/migrations/` en el editor SQL de Supabase.

### 5. Configurar Storage en Supabase

En el dashboard de Supabase → Storage → crear los siguientes buckets:

| Bucket | Público | Descripción |
|--------|---------|-------------|
| `fotos-gondola` | No | Fotos de góndolas de campañas |
| `fotos-fachada` | No | Fotos de fachada de comercios |
| `avatares` | Sí | Fotos de perfil (no usadas en MVP) |

### 6. Configurar Auth en Supabase

En Supabase → Authentication → Settings:
- Email confirmations: **Desactivar** en desarrollo
- Enable email OTP: **Activar**
- Site URL: `http://localhost:3000`
- Redirect URLs agregar: `http://localhost:3000/auth/callback`

### 7. Correr en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

---

## Estructura de las rutas

| URL | Interfaz | Para quién |
|-----|----------|------------|
| `/gondolero/*` | Mobile PWA | Gondoleros y fixers |
| `/distribuidora/*` | Panel web desktop | Distribuidoras |
| `/marca/*` | Panel web desktop | Marcas |
| `/admin/*` | Panel interno | Equipo GondolApp |
| `/auth/*` | Login/registro | Todos los actores |

---

## Comandos disponibles

```bash
npm run dev          # Servidor de desarrollo (localhost:3000)
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Linting con ESLint
npm run db:types     # Generar tipos TypeScript desde Supabase
npm run db:push      # Aplicar migraciones a Supabase
```

---

## Deploy en Vercel

### Primera vez

1. Ir a [vercel.com](https://vercel.com) → Add New → Project
2. Importar el repositorio de GitHub
3. Framework Preset: **Next.js** (auto-detectado)
4. Agregar las variables de entorno (las mismas que en `.env.local`)
5. Deploy

### Deploy automático

Cada push a `main` hace deploy automático a producción.
Cada PR genera un preview deployment con URL única.

---

## Documentación

- [`CLAUDE.md`](./CLAUDE.md) — Contexto completo del proyecto para Claude Code
- [`docs/GondolApp_Frontend_V1.md`](./docs/) — Especificación funcional del frontend
- [`docs/GondolApp_Backend_V1.md`](./docs/) — Especificación del panel de administración
- [`docs/Plan_de_Negocio_V4.md`](./docs/) — Plan de negocio

---

## Flujo de trabajo con Git

```bash
# Crear rama para nueva feature
git checkout -b feature/gondolero-captura

# Commits descriptivos en español
git commit -m "feat: agregar validación GPS en flujo de captura"
git commit -m "fix: corregir cálculo de distancia Haversine"
git commit -m "chore: actualizar tipos de Supabase"

# Push y abrir PR
git push origin feature/gondolero-captura
```

---

## Contexto del negocio

Ver [`CLAUDE.md`](./CLAUDE.md) para el contexto completo incluyendo:
- Los cuatro actores del ecosistema
- Esquema de base de datos completo
- Reglas de negocio críticas
- Alcance del MVP vs V2+
- Convenciones de código

---

*Versión 1.0 — Marzo 2026*
