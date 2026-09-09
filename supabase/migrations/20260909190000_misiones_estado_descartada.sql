-- misiones.estado — agregar 'descartada'
--
-- QUÉ CUBRE: el gondolero puede descartar la recaptura pendiente de una misión
-- cuando ya no puede volver al comercio. La misión se cierra sin acreditar.
--
-- POR QUÉ UN ESTADO NUEVO y no uno de los cuatro que ya había:
--   - 'rechazada' significa "el revisor la rechazó". Mezclarlo con un descarte
--     del gondolero borra la diferencia en todos los paneles y en cualquier
--     disputa posterior.
--   - 'parcial' no lo escribe ni lo lee nadie en el código, pero la palabra
--     dice "incompleta", que se confunde con 'pendiente'.
--
-- Se combina con bounty_estado='anulado', que ya existe en el CHECK de la
-- tabla y hasta ahora ningún código escribía sobre misiones. La combinación
-- estado='descartada' + bounty_estado='anulado' es "cerrada sin acreditar".
--
-- OJO: sin el 'anulado' el gondolero termina cobrando igual. aprobarMisionCore
-- libera el bounty con un UPDATE sobre TODAS las misiones del gondolero en la
-- campaña que estén en 'retenido' — la descartada entra en esa barrida.

ALTER TABLE misiones DROP CONSTRAINT IF EXISTS misiones_estado_check;

ALTER TABLE misiones ADD CONSTRAINT misiones_estado_check
  CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'parcial', 'descartada'));

-- Las misiones descartadas se excluyen del máximo de misiones por gondolero y
-- del aviso de fotos rechazadas, así que se consultan por (gondolero, campaña).
CREATE INDEX IF NOT EXISTS misiones_gondolero_campana_estado_idx
  ON misiones (gondolero_id, campana_id, estado);
