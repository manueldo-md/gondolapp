-- Un comercio se releva una sola vez por campaña puntual
--
-- ETAPA 2 de la campaña de seguimiento.
--
-- LA REGLA: en una campaña 'puntual' un comercio tiene como máximo una misión
-- viva. En una de 'seguimiento' se visita muchas veces, que es todo el punto.
-- El descarte libera el comercio; una foto rechazada NO lo libera, porque la
-- misión sigue viva y el gondolero la puede rehacer.
--
-- POR QUÉ UN ÍNDICE ÚNICO Y NO UN TRIGGER QUE CHEQUEE:
--   Un trigger que hace SELECT y aborta tiene race condition — dos
--   transacciones concurrentes hacen el SELECT, ninguna ve conflicto, las dos
--   insertan. Y falla justo en el único caso donde el bloqueo importa de
--   verdad: dos gondoleros que trabajaron sin señal sobre el mismo comercio y
--   sincronizan al mismo tiempo. Un índice único es la única garantía real bajo
--   concurrencia.
--
-- POR QUÉ HACE FALTA UN FLAG DESNORMALIZADO:
--   Postgres exige que el predicado de un índice parcial sea inmutable y
--   referencie solo columnas de la propia tabla: sin subqueries, sin mirar otra
--   tabla. Así que el índice no puede consultar campanas.modalidad y necesita
--   el dato replicado localmente en misiones.
--
--   ESTO NO CONTRADICE el principio de lib/campana-avance.ts ("derivado, no
--   guardado", con el precedente de comercios_relevados que se desincronizó y
--   tuvo una alerta rota durante meses). La diferencia es de naturaleza, no de
--   grado:
--
--     · comercios_relevados era estado que CAMBIA EN EL TIEMPO — cada misión
--       nueva lo desactualiza. Guardarlo era pedir que se desincronice.
--     · unico_por_comercio es un HECHO FIJO AL INSERTAR. Se deriva de
--       campana_id, que es inmutable para una misión, así que no puede quedar
--       viejo.
--
--   Y no se guarda por conveniencia sino porque POSTGRES LO NECESITA
--   LOCALMENTE para poder garantizar la restricción. No hay versión de esto
--   sin la columna.
--
--   La guarda que lo mantiene cierto es la pieza 5: prohibir cambiar la
--   modalidad de una campaña que ya tiene misiones, en vez de resolverlo con un
--   backfill que habría que acordarse de correr.
--
-- ORDEN: las piezas van en este orden y no en otro. El backfill tiene que
-- correr antes del índice, y los duplicados tienen que estar limpios antes de
-- todo (verificado vacío en dev y prod antes de aplicar esto).


-- ── 1. El flag ───────────────────────────────────────────────────────────────
-- Default true = el caso seguro. Si algo falla, bloquea de más, nunca de menos.
ALTER TABLE misiones
  ADD COLUMN IF NOT EXISTS unico_por_comercio boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN misiones.unico_por_comercio IS
  'Derivado de campanas.modalidad al insertar. true = campaña puntual, el comercio no se puede relevar dos veces. Lo escribe el trigger, no la app.';


-- ── 2. Backfill ──────────────────────────────────────────────────────────────
-- Las misiones con campana_id NULL no las alcanza el FROM y quedan en true.
UPDATE misiones m
SET unico_por_comercio = (c.modalidad = 'puntual')
FROM campanas c
WHERE c.id = m.campana_id
  AND m.unico_por_comercio IS DISTINCT FROM (c.modalidad = 'puntual');


-- ── 3. El trigger ────────────────────────────────────────────────────────────
-- BEFORE INSERT solamente, no UPDATE: el flag se deriva de campana_id, que no
-- cambia para una misión ya creada.
--
-- Pisa lo que mande la app A PROPÓSITO. El valor no se acepta del cliente: no
-- se puede olvidar de mandarlo ni falsearlo para saltear el bloqueo.
CREATE OR REPLACE FUNCTION misiones_set_unico_por_comercio()
RETURNS TRIGGER AS $$
BEGIN
  SELECT (c.modalidad = 'puntual')
    INTO NEW.unico_por_comercio
  FROM campanas c
  WHERE c.id = NEW.campana_id;

  -- campana_id NULL o campaña inexistente: el caso seguro es bloquear.
  IF NEW.unico_por_comercio IS NULL THEN
    NEW.unico_por_comercio := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_misiones_unico_por_comercio ON misiones;
CREATE TRIGGER trigger_misiones_unico_por_comercio
  BEFORE INSERT ON misiones
  FOR EACH ROW
  EXECUTE FUNCTION misiones_set_unico_por_comercio();


-- ── 4. El índice ─────────────────────────────────────────────────────────────
-- IS DISTINCT FROM y no != : misiones.estado es nullable (DEFAULT 'pendiente'
-- pero sin NOT NULL). Con != , una fila con estado NULL evalúa el predicado a
-- NULL, se cae del índice y no queda bloqueada por nada.
--
-- Las descartadas quedan fuera del índice, así que el descarte libera el
-- comercio y varias descartadas del mismo par conviven sin conflicto.
--
-- El retake no lo toca: registrarRecaptura inserta en fotos sobre la misión
-- existente, nunca en misiones. La misión sigue viva y el comercio bloqueado,
-- que es lo correcto.
CREATE UNIQUE INDEX IF NOT EXISTS misiones_campana_comercio_uniq
  ON misiones (campana_id, comercio_id)
  WHERE unico_por_comercio AND estado IS DISTINCT FROM 'descartada';


-- ── 5. La guarda de inmutabilidad ────────────────────────────────────────────
-- Sin esto el flag SÍ podría quedar viejo, y el principio de campana-avance.ts
-- tendría razón. Es lo que hace verdadero el argumento de arriba.
CREATE OR REPLACE FUNCTION campanas_modalidad_inmutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.modalidad IS DISTINCT FROM OLD.modalidad
     AND EXISTS (SELECT 1 FROM misiones WHERE campana_id = OLD.id) THEN
    RAISE EXCEPTION
      'No se puede cambiar la modalidad de una campaña que ya tiene misiones (campana_id=%)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_campanas_modalidad_inmutable ON campanas;
CREATE TRIGGER trigger_campanas_modalidad_inmutable
  BEFORE UPDATE ON campanas
  FOR EACH ROW
  EXECUTE FUNCTION campanas_modalidad_inmutable();
