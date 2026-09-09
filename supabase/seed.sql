-- =============================================================================
-- GondolApp — Datos de prueba para el piloto
-- Archivo: supabase/seed.sql
-- SOLO para entorno de desarrollo/staging — NUNCA en producción
-- =============================================================================

-- IMPORTANTE: Ejecutar DESPUÉS de las migraciones
-- Los UUIDs son fijos para consistencia entre resets

-- =============================================================================
-- DISTRIBUIDORAS
-- =============================================================================

INSERT INTO distribuidoras (id, razon_social, cuit, tokens_disponibles, validada)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Biomega S.A.', '30-71234567-8', 840, true),
  ('11111111-0000-0000-0000-000000000002', 'Distri Norte S.R.L.', '30-71234567-9', 250, true),
  ('11111111-0000-0000-0000-000000000003', 'Distribuidora Del Valle', '30-71234567-0', 0, false);

-- =============================================================================
-- MARCAS
-- =============================================================================

INSERT INTO marcas (id, razon_social, cuit, tokens_disponibles, fondo_resguardo, validada)
VALUES
  ('22222222-0000-0000-0000-000000000001', 'Georgalos S.A. (Entrenuts)', '30-52345678-1', 1240, 140, true),
  ('22222222-0000-0000-0000-000000000002', 'Natura Cosméticos', '30-52345678-2', 320, 64, true),
  ('22222222-0000-0000-0000-000000000003', 'Molinos Río de la Plata', '30-52345678-3', 0, 0, false);

-- =============================================================================
-- COMERCIOS DE PRUEBA — Entre Ríos
-- =============================================================================

INSERT INTO comercios (id, nombre, direccion, lat, lng, tipo, validado, zona_id)
VALUES
  ('33333333-0000-0000-0000-000000000001',
   'Super Norte',
   'Av. Libertad 1223, Concordia',
   -31.3850, -58.0178, 'autoservicio', true,
   (SELECT id FROM zonas WHERE nombre = 'Concordia')),

  ('33333333-0000-0000-0000-000000000002',
   'Kiosco El Cid',
   'San Luis 456, Concordia',
   -31.3920, -58.0210, 'kiosco', true,
   (SELECT id FROM zonas WHERE nombre = 'Concordia')),

  ('33333333-0000-0000-0000-000000000003',
   'Almacén Don Jorge',
   'Rivadavia 789, Colón',
   -32.2280, -58.1460, 'almacen', true,
   (SELECT id FROM zonas WHERE nombre = 'Colón')),

  ('33333333-0000-0000-0000-000000000004',
   'Super Central',
   '25 de Mayo 100, Concepción del Uruguay',
   -32.4820, -58.2340, 'autoservicio', true,
   (SELECT id FROM zonas WHERE nombre = 'Concepción del Uruguay')),

  ('33333333-0000-0000-0000-000000000005',
   'Almacén La Esquina',
   'Urquiza 321, Concordia',
   -31.3900, -58.0240, 'almacen', false,
   (SELECT id FROM zonas WHERE nombre = 'Concordia'));

-- =============================================================================
-- CAMPAÑA DE PRUEBA — Activa
-- =============================================================================

INSERT INTO campanas (
  id, nombre, tipo, marca_id, distri_id, financiada_por,
  estado, fecha_inicio, fecha_fin, fecha_limite_inscripcion,
  objetivo_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
  puntos_por_foto, instruccion, tokens_creacion, presupuesto_tokens
)
VALUES (
  '44444444-0000-0000-0000-000000000001',
  'Relevamiento snacks · Entre Ríos Q1 2026',
  'relevamiento',
  '22222222-0000-0000-0000-000000000001',  -- Georgalos
  '11111111-0000-0000-0000-000000000001',  -- Biomega
  'marca',
  'activa',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  CURRENT_DATE + INTERVAL '15 days',
  130,  -- objetivo de comercios
  20,   -- max por gondolero
  3,    -- mínimo para cobrar
  120,  -- puntos por foto
  'Fotografiar la sección de snacks y golosinas. Incluir Mantecol, Maní Confitado y Alfajores Georgalos en el encuadre si están presentes.',
  15,   -- tokens de creación
  500   -- presupuesto de tokens
);

-- Bloques de foto para la campaña
INSERT INTO bloques_foto (campana_id, orden, instruccion, tipo_contenido)
VALUES
  ('44444444-0000-0000-0000-000000000001', 1,
   'Góndola de snacks · incluir Mantecol y Maní Confitado en el encuadre', 'propios'),
  ('44444444-0000-0000-0000-000000000001', 2,
   'Sección golosinas · Georgalos surtido · encuadre completo de la sección', 'propios');

-- Zona de la campaña
INSERT INTO campana_zonas (campana_id, zona_id)
SELECT '44444444-0000-0000-0000-000000000001', id
FROM zonas
WHERE nombre IN ('Entre Ríos', 'Concordia', 'Colón', 'Concepción del Uruguay');

-- Campaña de mapa (propia de GondolApp)
INSERT INTO campanas (
  id, nombre, tipo, financiada_por,
  estado, fecha_inicio, fecha_fin,
  objetivo_comercios, max_comercios_por_gondolero, min_comercios_para_cobrar,
  puntos_por_foto, instruccion, presupuesto_tokens
)
VALUES (
  '44444444-0000-0000-0000-000000000002',
  'Mapa base · Concordia · cobertura inicial',
  'comercios',
  'gondolapp',
  'activa',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '60 days',
  300,
  50,
  1,  -- mínimo 1 para cobrar (facilitar)
  100,
  'Registrar comercios: almacenes, kioscos y autoservicios. Fotografiar la fachada del local de frente. Ingresar nombre del negocio y dirección aproximada.',
  200
);

INSERT INTO campana_zonas (campana_id, zona_id)
SELECT '44444444-0000-0000-0000-000000000002', id
FROM zonas WHERE nombre = 'Concordia';

-- =============================================================================
-- USUARIOS DE PRUEBA
-- IMPORTANTE: Los perfiles se crean via Supabase Auth.
-- Estos INSERTs son para cuando se crean los usuarios manualmente.
-- En desarrollo: crear los usuarios en Supabase Dashboard → Auth → Users
-- y luego el trigger on_auth_user_created crea el perfil automáticamente.
-- =============================================================================

-- Usuarios a crear manualmente en Supabase Auth para el piloto:
--
-- gondolero1@test.com → tipo_actor: gondolero, nombre: Agustín R.
-- gondolero2@test.com → tipo_actor: gondolero, nombre: Mariana G.
-- distri@biomega.com  → tipo_actor: distribuidora, nombre: Gerente Biomega
-- marca@georgalos.com → tipo_actor: marca, nombre: Trade Marketing Georgalos
-- admin@gondolapp.com → tipo_actor: admin, nombre: Manuel (Admin)
--
-- Después de crearlos, actualizar manualmente los distri_id y marca_id:
-- UPDATE profiles SET distri_id = '11111111-0000-0000-0000-000000000001'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'distri@biomega.com');
--
-- UPDATE profiles SET marca_id = '22222222-0000-0000-0000-000000000001'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'marca@georgalos.com');

-- =============================================================================
-- FIN DEL SEED
-- =============================================================================
