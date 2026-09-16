-- fecha_fin: obligatoria en campañas puntuales, prohibida en las de seguimiento
--
-- LA REGLA (16/9/2026): una campaña puntual sin fecha de fin no existe — si no
-- tiene fin, es continua, y eso es una campaña de seguimiento. Ordena las dos
-- modalidades igual que las otras dos restricciones que ya pusimos:
--
--   tope_total_comercios   → solo puntual   (campanas_tope_solo_puntual)
--   visitas_por_semana     → solo seguimiento (campanas_frecuencia_solo_seguimiento)
--   fecha_fin              → solo puntual, y obligatoria  ← esta
--
-- POR QUÉ AHORA: sin fecha_fin una campaña puntual no vence nunca, así que el
-- gate que rechaza misiones de campañas vencidas no dispararía jamás para ella.
-- Las campañas sin fecha serían exactamente las que siguen aceptando misiones
-- para siempre — el problema que el gate viene a cerrar.
--
-- ── LA EXCEPCIÓN DE BORRADOR, QUE NO ES OPCIONAL ────────────────────────────
-- Un borrador se guarda con datos incompletos mientras el creador arma la
-- campaña. Sin exceptuarlo, guardar un borrador antes de completar la fecha
-- falla, y el editor se vuelve inusable.
--
-- ── POR QUÉ NOT VALID ───────────────────────────────────────────────────────
-- Al 16/9/2026 hay 10 campañas activas en dev y 5 en producción sin fecha_fin,
-- todas puntuales. NOT VALID hace que el constraint rija para los INSERT y los
-- UPDATE sin validar las filas que ya están.
--
-- Se descartó resolverlas con un UPDATE masivo: ponerles a todas una fecha
-- futura inventada es fabricar un dato de negocio, y ponerles una pasada las
-- cierra y bloquea misiones que pueden estar en curso. Van una por una, con
-- fecha real, decididas por quien las creó.
--
-- Se descartó también convertirlas a 'seguimiento': no lo son —son puntuales a
-- las que el creador dejó el campo vacío— y además el trigger
-- campanas_modalidad_inmutable bloquea cambiar la modalidad de una campaña que
-- ya tiene misiones, que es el caso de la mayoría.
--
-- DOS COSAS QUE HAY QUE SABER DE NOT VALID:
--   1. SÍ se aplica al hacer UPDATE de una fila vieja. Editar una de las 15 sin
--      ponerle fecha va a fallar. Es deseable —fuerza la limpieza al tocarla—
--      pero sorprende si no se sabe.
--   2. Mientras esas 15 sigan sin fecha, el gate por vencimiento no las cubre.
--      NOT VALID desbloquea la regla; no resuelve el agujero.
--
-- Cuando estén todas limpias:
--   ALTER TABLE campanas VALIDATE CONSTRAINT campanas_fecha_fin_por_modalidad;

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_fecha_fin_por_modalidad;
ALTER TABLE campanas ADD CONSTRAINT campanas_fecha_fin_por_modalidad
  CHECK (
    estado = 'borrador'
    OR (modalidad = 'puntual'     AND fecha_fin IS NOT NULL)
    OR (modalidad = 'seguimiento' AND fecha_fin IS NULL)
  ) NOT VALID;

COMMENT ON COLUMN campanas.fecha_fin IS
  'Último día en que la campaña acepta misiones. Obligatoria en modalidad puntual, nula en seguimiento (que no termina). El gate está en registrarMision; el estado NO se cierra solo — "vencida" se deriva al leer, ver lib/campana-vigencia.ts.';
