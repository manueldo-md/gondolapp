-- Una campaña de seguimiento no puede tener tope de comercios
--
-- QUÉ EVITA: una campaña de seguimiento no cierra — es control recurrente, sin
-- fecha de fin, y un comercio se visita muchas veces a propósito. Pero hoy nada
-- impedía cargarle `tope_total_comercios`, y con un tope cargado
-- `registrarMision` la CIERRA SOLA al alcanzarlo:
--
--   if (campana.tope_total_comercios != null && nuevoRelevados >= tope) → cerrada
--
-- O sea, una campaña que por definición no termina, terminándose sin que nadie
-- lo haya pedido. El CHECK de la migración de modalidad solo restringía
-- `visitas_por_semana`; este cierra el otro lado.
--
-- OJO SI FALLA AL APLICAR: si ya existe alguna campaña con
-- modalidad='seguimiento' y tope_total_comercios no nulo, el ALTER se rechaza.
-- Al 16/9/2026 no hay ninguna campaña de seguimiento creada, así que debería
-- entrar limpio. Si fallara, revisar con:
--
--   SELECT id, nombre, tope_total_comercios FROM campanas
--   WHERE modalidad = 'seguimiento' AND tope_total_comercios IS NOT NULL;
--
-- y decidir a mano: el tope de una campaña de seguimiento es un dato cargado por
-- error, no un dato a preservar.

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_tope_solo_puntual;
ALTER TABLE campanas ADD CONSTRAINT campanas_tope_solo_puntual
  CHECK (modalidad = 'puntual' OR tope_total_comercios IS NULL);

COMMENT ON COLUMN campanas.tope_total_comercios IS
  'Techo de comercios distintos: al alcanzarlo la campaña se cierra sola. Solo aplica a modalidad puntual — una de seguimiento no cierra, y el CHECK campanas_tope_solo_puntual lo impide.';
