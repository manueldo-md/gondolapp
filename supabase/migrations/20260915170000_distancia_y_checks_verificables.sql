-- Distancia al comercio en la foto, y marcado de los checks GPS no verificables
--
-- ORIGEN: el 15/9/2026 se detectó que un gondolero podía registrar una misión a
-- 1,5 km del comercio. Tres hallazgos encadenados, y esta migración habilita el
-- arreglo de los tres.
--
-- =============================================================================
-- 1. fotos.distancia_metros
-- =============================================================================
-- Distancia entre la posición del dispositivo al capturar y la del comercio,
-- calculada EN EL SERVIDOR al registrar la misión. Hasta ahora no se calculaba
-- en ningún lado: el cliente la mostraba en pantalla y la tiraba.
--
-- POR QUÉ COLUMNA Y NO CÁLCULO AL LEER:
--   Las coordenadas de un comercio son mutables — la validación las corrige, y
--   justamente estamos por corregir las de los comercios mal ubicados. Si la
--   distancia se calculara al leer, arreglar el pin de un comercio REESCRIBIRÍA
--   RETROACTIVAMENTE la auditoría de todas sus misiones históricas: una misión
--   que estaba a 1,5 km pasaría a estar a 30 metros sin que quede rastro. Un
--   registro de auditoría que cambia cuando cambia un dato ajeno no es un
--   registro de auditoría.
--
--   Y la decisión de bloquear se toma contra las coordenadas DE ESE MOMENTO.
--   Guardarla registra lo que el sistema efectivamente decidió, que es lo que
--   hace falta el día que alguien discuta un rechazo.
--
--   No se pierde nada: fotos.lat/lng y comercios.lat/lng siguen estando, así que
--   la distancia "según los datos de hoy" se puede calcular igual cuando sirva.
--   Esta columna agrega el hecho histórico sin tapar el actual.
--
-- VA EN fotos Y NO EN misiones porque es donde vive lat/lng, y en una misión de
-- varias fotos el gondolero puede moverse entre una y otra. La distancia de la
-- misión se deriva de las de sus fotos; al revés no.
--
-- NULL = histórico anterior a este cambio, o foto sin coordenadas. No es 0.

ALTER TABLE fotos
  ADD COLUMN IF NOT EXISTS distancia_metros integer;

COMMENT ON COLUMN fotos.distancia_metros IS
  'Metros entre la posición del dispositivo al capturar y la del comercio, calculada en el servidor al registrar. NULL = anterior al 15/9/2026 o sin coordenadas. Es un hecho histórico: no se recalcula si se corrigen las coordenadas del comercio.';


-- =============================================================================
-- NOTA — comercios_checks, sin columna de marcado
-- =============================================================================
-- El otro hallazgo del 15/9/2026: registrarMision llamaba a
-- registrarChecksGPSInterno con las coordenadas DEL COMERCIO en lugar de las del
-- dispositivo. Esa posición se usa para dos cosas y las dos quedaban rotas:
--
--   a) Filtrar qué comercios pendiente_validacion reciben check (dist <= 20m).
--      La distancia de un comercio a sí mismo es 0, así que EL FILTRO SE
--      AUTOCUMPLÍA: el comercio destino recibía su check siempre, estuviera el
--      gondolero en la puerta o a 1,5 km.
--   b) Guardarse como latitud/longitud de la fila, así que todos los checks de
--      un mismo comercio salían idénticos y no probaban presencia de nadie.
--
--   Y buscaba vecinos a 20m del COMERCIO y no del gondolero, así que comercios
--   vecinos recibían checks de alguien que pudo no haber estado cerca.
--
-- Se evaluó agregar `posicion_verificada boolean` para marcar las filas viejas
-- como no verificables. No hizo falta: eran 2 en producción y 15 en dev, las de
-- producción con las coordenadas del comercio, o sea que ninguna probaba nada.
-- Se borraron en las dos bases el 15/9/2026 y la tabla arranca limpia. Una
-- columna para distinguir 17 filas que ya no existen habría sido deuda, no
-- información.
--
-- El arreglo vive en el código (captura/actions.ts pasa params.lat/lng), no acá.
