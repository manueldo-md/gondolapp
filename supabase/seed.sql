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

-- Sin `zona_id`: la columna se dropea en `20261005100000`. Acá ya escribía NULL
-- —este archivo nunca insertó en `zonas`, así que los cinco subselects no
-- matcheaban nada—, pero después del DROP el statement sería un error duro y el
-- seed entero dejaría de correr. La geografía que la app lee hoy es
-- `localidad_id`, del padrón, que no se carga por migración y por eso tampoco
-- se pone acá.
INSERT INTO comercios (id, nombre, direccion, lat, lng, tipo, validado)
VALUES
  ('33333333-0000-0000-0000-000000000001',
   'Super Norte',
   'Av. Libertad 1223, Concordia',
   -31.3850, -58.0178, 'autoservicio', true),

  ('33333333-0000-0000-0000-000000000002',
   'Kiosco El Cid',
   'San Luis 456, Concordia',
   -31.3920, -58.0210, 'kiosco', true),

  ('33333333-0000-0000-0000-000000000003',
   'Almacén Don Jorge',
   'Rivadavia 789, Colón',
   -32.2280, -58.1460, 'almacen', true),

  ('33333333-0000-0000-0000-000000000004',
   'Super Central',
   '25 de Mayo 100, Concepción del Uruguay',
   -32.4820, -58.2340, 'autoservicio', true),

  ('33333333-0000-0000-0000-000000000005',
   'Almacén La Esquina',
   'Urquiza 321, Concordia',
   -31.3900, -58.0240, 'almacen', false);

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
INSERT INTO bloques_foto (campana_id, orden, instruccion)
VALUES
  ('44444444-0000-0000-0000-000000000001', 1,
   'Góndola de snacks · incluir Mantecol y Maní Confitado en el encuadre'),
  ('44444444-0000-0000-0000-000000000001', 2,
   'Sección golosinas · Georgalos surtido · encuadre completo de la sección');

-- Sin zona de campaña: `campana_zonas` es del sistema viejo y se va en el
-- tramo del legacy de zonas. Estos dos INSERT ya no insertaban nada — el seed
-- nunca cargó `zonas`, así que el SELECT no matcheaba una sola fila— y
-- después del DROP serían un error duro que voltea el seed entero. Es el mismo
-- caso que el `zona_id` de comercios, sacado el 25/9/2026.

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
