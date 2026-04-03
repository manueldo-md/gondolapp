-- Agregar columnas a la tabla configuracion existente
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS tipo text CHECK (tipo IN ('numero', 'booleano', 'texto')) DEFAULT 'numero';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS descripcion text DEFAULT '';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS seccion text CHECK (seccion IN ('fotos', 'gps', 'economia', 'niveles', 'operacion', 'compresion')) DEFAULT 'operacion';
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE configuracion ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles;

-- Actualizar los registros de compresión existentes
UPDATE configuracion SET tipo = 'numero', seccion = 'compresion', descripcion = 'Tamaño máximo de foto en KB' WHERE clave = 'compresion_max_kb';
UPDATE configuracion SET tipo = 'numero', seccion = 'compresion', descripcion = 'Ancho máximo de foto en píxeles' WHERE clave = 'compresion_max_width';
UPDATE configuracion SET tipo = 'numero', seccion = 'compresion', descripcion = 'Calidad de compresión JPEG (0.0-1.0)' WHERE clave = 'compresion_calidad';

-- Insertar nuevos valores por defecto (upsert para evitar duplicados)
INSERT INTO configuracion (clave, valor, tipo, descripcion, seccion) VALUES
-- FOTOS
('blur_threshold_mobile', '800', 'numero', 'Score mínimo de nitidez en mobile (Laplaciano)', 'fotos'),
('blur_threshold_desktop', '50', 'numero', 'Score mínimo de nitidez en desktop', 'fotos'),
('inclinacion_gamma_advertencia', '20', 'numero', 'Grados de inclinación horizontal para advertencia visual', 'fotos'),
('inclinacion_gamma_bloqueo', '25', 'numero', 'Grados de inclinación horizontal para advertencia al capturar', 'fotos'),
('inclinacion_beta_min', '60', 'numero', 'Ángulo vertical mínimo aceptable (beta)', 'fotos'),
('inclinacion_beta_max', '100', 'numero', 'Ángulo vertical máximo aceptable (beta)', 'fotos'),
-- GPS
('gps_radio_metros', '50', 'numero', 'Radio de validación GPS en metros', 'gps'),
('gps_timeout_segundos', '15', 'numero', 'Timeout de obtención de GPS en segundos', 'gps'),
-- ECONOMÍA
('tokens_crear_campana', '15', 'numero', 'Tokens que consume crear una campaña', 'economia'),
('puntos_canje_celular', '300', 'numero', 'Puntos mínimos para canjear crédito de celular', 'economia'),
('puntos_canje_nafta', '500', 'numero', 'Puntos mínimos para canjear nafta YPF', 'economia'),
('puntos_canje_giftcard', '1000', 'numero', 'Puntos mínimos para canjear Gift Card ML', 'economia'),
('puntos_canje_transferencia', '2000', 'numero', 'Puntos mínimos para canjear transferencia bancaria', 'economia'),
-- NIVELES
('nivel_fotos_casual_a_activo', '50', 'numero', 'Fotos aprobadas para pasar de Casual a Activo', 'niveles'),
('nivel_fotos_activo_a_pro', '100', 'numero', 'Fotos aprobadas para pasar de Activo a Pro', 'niveles'),
-- OPERACIÓN
('sla_canjes_horas', '48', 'numero', 'SLA de procesamiento de canjes en horas', 'operacion'),
('alerta_gondolero_inactivo_dias', '14', 'numero', 'Días sin actividad para alerta de gondolero inactivo', 'operacion'),
('alerta_comercio_sin_visita_dias', '30', 'numero', 'Días sin visita para alerta de comercio', 'operacion'),
('alerta_ignorada_reactivacion_dias', '7', 'numero', 'Días hasta reactivar una alerta ignorada', 'operacion'),
('offline_queue_expiry_horas', '72', 'numero', 'Horas de expiración de fotos en cola offline', 'operacion')
ON CONFLICT (clave) DO NOTHING;
