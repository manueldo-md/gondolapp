import { z } from 'zod'

// ── AUTH ──────────────────────────────────────────────────────────────────────

export const schemaLogin = z.object({
  email: z
    .string()
    .min(1, 'El email es obligatorio')
    .email('Ingresá un email válido'),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export const schemaRegistro = z
  .object({
    email: z
      .string()
      .min(1, 'El email es obligatorio')
      .email('Ingresá un email válido'),
    nombre: z
      .string()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre es demasiado largo'),
    tipo_actor: z.enum(['gondolero', 'fixer', 'distribuidora', 'marca'], {
      required_error: 'Seleccioná el tipo de cuenta',
    }),
    celular: z
      .string()
      .optional()
      .refine(
        (val) => !val || /^(\+54|54)?9?\d{10}$/.test(val.replace(/[\s\-\(\)]/g, '')),
        'Ingresá un número de celular válido'
      ),
    distri_id: z.string().uuid().optional(),
    password: z
      .string()
      .min(6, 'La contraseña debe tener al menos 6 caracteres'),
    confirmPassword: z
      .string()
      .min(1, 'Confirmá tu contraseña'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

// ── COMERCIO ──────────────────────────────────────────────────────────────────

export const schemaComercio = z.object({
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  direccion: z
    .string()
    .max(200, 'La dirección es demasiado larga')
    .optional(),
  lat: z
    .number()
    .min(-90, 'Latitud inválida')
    .max(90, 'Latitud inválida'),
  lng: z
    .number()
    .min(-180, 'Longitud inválida')
    .max(180, 'Longitud inválida'),
  tipo: z.enum(['autoservicio', 'almacen', 'kiosco', 'mayorista', 'otro'], {
    required_error: 'Seleccioná el tipo de comercio',
  }),
})

// ── CAMPAÑA ───────────────────────────────────────────────────────────────────

export const schemaCampanaPaso1 = z.object({
  nombre: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  tipo: z.enum(['relevamiento', 'precio', 'cobertura', 'pop', 'mapa', 'comercios', 'interna'], {
    required_error: 'Seleccioná el tipo de campaña',
  }),
  instruccion: z
    .string()
    .min(10, 'La instrucción debe ser más descriptiva')
    .max(500, 'La instrucción es demasiado larga'),
  puntos_por_foto: z
    .number()
    .int('Debe ser un número entero')
    .min(0, 'Los puntos no pueden ser negativos')
    .max(10000, 'Máximo 10.000 puntos por foto'),
  puntos_por_mision: z
    .number()
    .int('Debe ser un número entero')
    .min(0, 'Los puntos no pueden ser negativos')
    .max(100000, 'Máximo 100.000 puntos por misión'),
  zona_ids: z
    .array(z.string().uuid())
    .min(1, 'Seleccioná al menos una zona'),
  bloques: z
    .array(z.object({
      orden: z.number().int().positive(),
      instruccion: z
        .string()
        .min(5, 'La instrucción del bloque es muy corta')
        .max(200, 'La instrucción es demasiado larga'),
      tipo_contenido: z.enum(['propios', 'competencia', 'ambos']),
    }))
    .min(1, 'Agregá al menos un bloque de foto'),
})

export const schemaCampanaPaso2 = z
  .object({
    fecha_inicio: z
      .string()
      .min(1, 'La fecha de inicio es obligatoria'),
    fecha_fin: z
      .string()
      .min(1, 'La fecha de fin es obligatoria'),
    fecha_limite_inscripcion: z
      .string()
      .min(1, 'La fecha límite de inscripción es obligatoria'),
    objetivo_comercios: z
      .number()
      .int()
      .positive('El objetivo debe ser mayor a 0')
      .max(10000, 'El objetivo es demasiado alto'),
    max_comercios_por_gondolero: z
      .number()
      .int()
      .positive()
      .max(200, 'Máximo 200 comercios por gondolero'),
    min_comercios_para_cobrar: z
      .number()
      .int()
      .min(1, 'Mínimo 1 comercio para cobrar'),
    tope_total_comercios: z
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
    es_abierta: z.boolean(),
  })
  .refine(
    (data) => new Date(data.fecha_fin) > new Date(data.fecha_inicio),
    {
      message: 'La fecha de fin debe ser posterior al inicio',
      path: ['fecha_fin'],
    }
  )
  .refine(
    (data) => new Date(data.fecha_limite_inscripcion) <= new Date(data.fecha_fin),
    {
      message: 'La fecha límite de inscripción debe ser antes del fin',
      path: ['fecha_limite_inscripcion'],
    }
  )
  .refine(
    (data) => data.min_comercios_para_cobrar <= data.max_comercios_por_gondolero,
    {
      message: 'El mínimo para cobrar no puede superar el máximo por gondolero',
      path: ['min_comercios_para_cobrar'],
    }
  )

// ── CAPTURA DE FOTO ───────────────────────────────────────────────────────────

export const schemaDeclaracion = z.object({
  declaracion: z.enum(
    ['producto_presente', 'producto_no_encontrado', 'solo_competencia'],
    { required_error: 'Seleccioná qué encontraste' }
  ),
  precio_confirmado: z
    .number()
    .positive('El precio debe ser mayor a 0')
    .optional()
    .nullable(),
})

// ── CANJE ─────────────────────────────────────────────────────────────────────

export const schemaCanje = z.object({
  premio: z.enum(['nafta_ypf', 'giftcard_ml', 'credito_celular', 'transferencia'], {
    required_error: 'Seleccioná el premio',
  }),
  puntos: z
    .number()
    .int()
    .positive('Los puntos deben ser mayor a 0'),
})

// ── PERFIL ────────────────────────────────────────────────────────────────────

export const schemaPerfil = z.object({
  nombre: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre es demasiado largo'),
  celular: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^(\+54|54)?9?\d{10}$/.test(val.replace(/[\s\-\(\)]/g, '')),
      'Ingresá un número válido'
    ),
})

// ── DISTRIBUIDORA / MARCA ─────────────────────────────────────────────────────

export const schemaEmpresa = z.object({
  razon_social: z
    .string()
    .min(2, 'La razón social debe tener al menos 2 caracteres')
    .max(150, 'La razón social es demasiado larga'),
  cuit: z
    .string()
    .regex(/^\d{2}-?\d{8}-?\d{1}$/, 'Ingresá un CUIT válido (XX-XXXXXXXX-X)'),
})

// ── TIPOS INFERIDOS ───────────────────────────────────────────────────────────

export type LoginForm = z.infer<typeof schemaLogin>
export type RegistroForm = z.infer<typeof schemaRegistro>
export type ComercioForm = z.infer<typeof schemaComercio>
export type CampanaPaso1Form = z.infer<typeof schemaCampanaPaso1>
export type CampanaPaso2Form = z.infer<typeof schemaCampanaPaso2>
export type DeclaracionForm = z.infer<typeof schemaDeclaracion>
export type CanjeForm = z.infer<typeof schemaCanje>
export type PerfilForm = z.infer<typeof schemaPerfil>
export type EmpresaForm = z.infer<typeof schemaEmpresa>
