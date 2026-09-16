-- visitas_por_semana obligatoria en las campañas de seguimiento
--
-- ETAPA 3 de la campaña de seguimiento — la que permite crear una desde la UI.
--
-- QUÉ FALTABA: el CHECK de la migración 20260915120000 es
--
--   campanas_frecuencia_solo_seguimiento
--     CHECK (modalidad = 'seguimiento' OR visitas_por_semana IS NULL)
--
-- que PROHÍBE las visitas en puntual pero NO las EXIGE en seguimiento. Una
-- campaña de seguimiento con visitas_por_semana NULL es válida para la base.
--
-- POR QUÉ IMPORTA: el formulario la pide como obligatoria, pero una regla que
-- vive solo en el cliente no es una regla — el POST se puede armar a mano. Es
-- exactamente lo que pasó con fecha_fin: se validaba en el editor y la base
-- aceptaba campañas sin fecha, que después no vencían nunca.
--
-- Y acá el dato no es cosmético: visitas_por_semana ES la definición de la
-- campaña. Una de seguimiento sin frecuencia no le dice al gondolero cada
-- cuánto volver ni a la marca qué esperar. No es un campo incompleto, es una
-- campaña que no significa nada.
--
-- Las cuatro restricciones quedan espejadas:
--   fecha_fin              → obligatoria en puntual, prohibida en seguimiento
--   tope_total_comercios   → solo puntual
--   visitas_por_semana     → solo seguimiento, Y obligatoria ahí
--
-- ANTES DE APLICAR, verificar que no haya ninguna que lo viole:
--
--   SELECT id, nombre, modalidad, visitas_por_semana, estado
--   FROM campanas
--   WHERE modalidad = 'seguimiento' AND visitas_por_semana IS NULL;
--
-- Tiene que devolver cero filas: hasta esta etapa ningún editor podía crear una
-- campaña de seguimiento. Si devuelve algo, PARAR — significa que alguna se
-- creó por otro camino y hay que entender cuál antes de seguir.

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_visitas_obligatorias_seguimiento;

ALTER TABLE campanas ADD CONSTRAINT campanas_visitas_obligatorias_seguimiento
  CHECK (modalidad = 'puntual' OR visitas_por_semana IS NOT NULL);
