-- campanas.modalidad + campanas.visitas_por_semana
--
-- ETAPA 1 de la campaña de seguimiento: SOLO LAS COLUMNAS, SIN COMPORTAMIENTO.
-- Nada las lee todavía. Toda campaña existente queda 'puntual' por el default,
-- así que el comportamiento de la app no cambia en nada al aplicar esto.
--
-- QUÉ ES UNA CAMPAÑA DE SEGUIMIENTO: control de góndola recurrente. Un repositor
-- visita los mismos comercios varias veces por semana y lo que importa no es el
-- resultado agregado sino la visita en sí — que fue, cuándo, y la foto. No tiene
-- fecha de cierre, y un mismo comercio se releva muchas veces: eso es lo
-- esperado, no un error.
--
-- POR QUÉ UNA COLUMNA NUEVA Y NO UN VALOR MÁS EN `tipo`:
--   `tipo` ('relevamiento','precio','cobertura','pop','mapa','comercios',
--   'interna') es una taxonomía de ASUNTO — qué se está midiendo. La modalidad
--   es una taxonomía de FORMA — cómo se comporta la campaña en el tiempo. Son
--   ortogonales: una campaña de seguimiento puede ser de 'pop' (¿sigue puesto
--   el exhibidor?) o de 'precio' (¿cambió esta semana?). Meter 'seguimiento'
--   dentro de `tipo` obliga a elegir uno de los dos y perder el otro.
--
--   Además `tipo` es NOT NULL con CHECK y está espejado en el enum de Zod
--   (lib/validations/index.ts) y en los cuatro formularios duplicados de
--   creación de campaña. Agregarle un valor toca los seis lugares. Una columna
--   nueva con default no toca ninguno.
--
--   El precedente de hacerlo así ya está en esta misma tabla: `actor_campana`
--   ('gondolero' | 'fixer') es otro eje estructural que se resolvió con columna
--   propia en vez de sobrecargar `tipo`.

ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'puntual';

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_modalidad_check;
ALTER TABLE campanas ADD CONSTRAINT campanas_modalidad_check
  CHECK (modalidad IN ('puntual', 'seguimiento'));

-- Frecuencia esperada de visitas por comercio. La semana es lunes a domingo.
-- Nullable: solo tiene sentido en seguimiento, y además una campaña en
-- 'borrador' puede guardarse antes de que el usuario complete el campo.
-- El techo de 14 (dos por día) es para atajar el typo de un 300, no una regla
-- de negocio.
ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS visitas_por_semana integer;

ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_visitas_por_semana_check;
ALTER TABLE campanas ADD CONSTRAINT campanas_visitas_por_semana_check
  CHECK (visitas_por_semana IS NULL OR visitas_por_semana BETWEEN 1 AND 14);

-- Una campaña puntual no puede tener frecuencia: el dato no significaría nada
-- y más adelante induciría a leerlo donde no corresponde.
--
-- OJO PARA LA ETAPA 3: esto hace que cambiar una campaña de 'seguimiento' a
-- 'puntual' falle si no se limpia `visitas_por_semana` en el mismo UPDATE. Es
-- una falla deseable —obliga a manejar el caso— pero hay que saberlo al escribir
-- el formulario.
ALTER TABLE campanas DROP CONSTRAINT IF EXISTS campanas_frecuencia_solo_seguimiento;
ALTER TABLE campanas ADD CONSTRAINT campanas_frecuencia_solo_seguimiento
  CHECK (modalidad = 'seguimiento' OR visitas_por_semana IS NULL);

COMMENT ON COLUMN campanas.modalidad IS
  'puntual = se releva cada comercio una vez y la campaña cierra. seguimiento = control recurrente, sin cierre, un comercio se visita muchas veces.';
COMMENT ON COLUMN campanas.visitas_por_semana IS
  'Solo en modalidad seguimiento. Visitas esperadas por comercio por semana (lunes a domingo).';

-- NOTA PARA LA ETAPA 2 (índice único por comercio, solo en campañas puntuales):
--
-- Postgres exige que el predicado de un índice parcial referencie solo columnas
-- de la propia tabla — sin subqueries y sin mirar otra tabla. Así que el índice
-- sobre `misiones` no puede consultar `campanas.modalidad` y va a necesitar un
-- flag desnormalizado en `misiones`, poblado por un trigger BEFORE INSERT.
--
-- Eso NO contradice el principio escrito en lib/campana-avance.ts ("derivado, no
-- guardado", con el precedente de `comercios_relevados` que se desincronizó y
-- tuvo una alerta rota durante meses). La diferencia es de naturaleza, no de
-- grado: aquello era estado que CAMBIA EN EL TIEMPO —cada misión nueva lo
-- desactualiza— y por eso guardarlo era pedir que se desincronice. Esto es un
-- HECHO FIJO AL INSERTAR: se deriva de campana_id, que es inmutable para una
-- misión, así que nunca puede quedar viejo. Y no se guarda por conveniencia
-- sino porque Postgres LO NECESITA LOCALMENTE para poder garantizar la
-- restricción: la alternativa —un trigger que hace SELECT y aborta— tiene race
-- condition y falla justo en el caso que importa, dos gondoleros sincronizando
-- offline al mismo tiempo.
--
-- La guarda que lo mantiene cierto: prohibir cambiar la modalidad de una
-- campaña que ya tiene misiones, en vez de resolverlo con un backfill.
