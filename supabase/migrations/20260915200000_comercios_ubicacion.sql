-- Corrección de la ubicación de un comercio: historial y reportes
--
-- ORIGEN: relevando el aviso de "estás a 1,5 km del comercio" se descubrió que
-- **no existe en toda la aplicación una forma de corregir la ubicación de un
-- comercio**. Se rastrearon los siete UPDATE sobre `comercios` que hay en la
-- app: escriben `validado`, `estado` y `foto_fachada_url`. Ninguno toca
-- lat/lng, ni desde la distribuidora ni desde el admin.
--
-- O sea que cada pin mal puesto era un problema PERMANENTE: el comercio quedaba
-- invisible para la lista de cercanos —que filtra por radio— e inalcanzable
-- para el bloqueo de 200m, y el único camino que le quedaba al gondolero era
-- crear un comercio nuevo, que es justo lo que ensucia la tabla.
--
-- Y el aviso que se le mostraba ("avisale a tu distribuidora para que corrija
-- la dirección") le pedía una acción que no podía ejecutar, a alguien que
-- tampoco podía.
--
-- LA DECISIÓN DE PRODUCTO (15/9/2026): cualquier distribuidora puede corregir
-- cualquier comercio, y el control es el RASTRO VISIBLE, no el permiso. El mapa
-- de comercios es un activo compartido: quien tiene evidencia de que un pin está
-- mal es quien mandó un gondolero ahí, y restringir la corrección al "dueño"
-- dejaría sin arreglar exactamente el caso que originó esto — el gondolero que
-- llega a un comercio mal ubicado que registró otro.
--
-- La ubicación nueva NO se elige en un mapa: sale de los reportes de los
-- gondoleros. Un gondolero parado en la puerta con un GPS es más preciso que
-- alguien arrastrando un pin sobre una foto satelital desde la oficina, y en el
-- canal tradicional un almacén sin cartel no se distingue desde el aire. Eso
-- convierte la corrección en un acto de CONFIRMAR EVIDENCIA y no de opinar.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Historial de correcciones
-- ─────────────────────────────────────────────────────────────────────────────
-- VA PRIMERO porque la tabla de reportes la referencia.
--
-- TABLA Y NO COLUMNAS EN `comercios`: unas columnas
-- (ubicacion_corregida_por/_at/lat_anterior) serían más baratas pero guardan
-- SOLO LA ÚLTIMA corrección. El precedente está en esta misma base:
-- `comercios_checks` usa UNIQUE (comercio_id, gondolero_id) con upsert, pisó
-- todas las visitas menos la última, y cuando el 15/9/2026 se quiso recalcular
-- el histórico no había nada que recalcular. Un pin que se corrige dos veces es
-- el mismo caso.
--
-- lat_anterior/lng_anterior no son redundantes: son lo que permite reconstruir
-- qué veía el sistema antes del cambio, y sin eso no se puede decir "esta foto
-- es anterior a la corrección" al cruzar contra fotos.created_at.
CREATE TABLE IF NOT EXISTS comercios_ubicacion_historial (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id   uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  lat_anterior  numeric,
  lng_anterior  numeric,
  lat_nueva     numeric NOT NULL,
  lng_nueva     numeric NOT NULL,
  corregido_por uuid REFERENCES profiles(id),
  distri_id     uuid REFERENCES distribuidoras(id),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comercios_ubicacion_historial_comercio_idx
  ON comercios_ubicacion_historial (comercio_id, created_at DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reportes de ubicación del gondolero
-- ─────────────────────────────────────────────────────────────────────────────
-- Se crea en esta etapa aunque todavía no la escriba nadie: la Parte B agrega el
-- botón en la app del gondolero y la Parte C la consume para proponer la
-- corrección.
--
-- SIN UNIQUE (comercio_id, gondolero_id), a propósito, y es el mismo aprendizaje
-- que arriba: cada reporte es una observación con fecha, y las observaciones no
-- se pisan. La contracara es que el mismo gondolero puede reportar varias veces,
-- así que **la dispersión se mide sobre gondoleros DISTINTOS y no sobre filas**.
-- Eso además hace innecesaria una clave de idempotencia para la cola offline:
-- un reporte duplicado por un reintento no infla el conteo.
CREATE TABLE IF NOT EXISTS comercios_reportes_ubicacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comercio_id      uuid NOT NULL REFERENCES comercios(id) ON DELETE CASCADE,
  gondolero_id     uuid REFERENCES profiles(id),
  -- Posición real del dispositivo al reportar.
  lat              numeric NOT NULL,
  lng              numeric NOT NULL,
  -- Distancia al pin VIGENTE EN ESE MOMENTO. Misma razón que
  -- fotos.distancia_metros: cuando el pin se corrija este número ya no se puede
  -- recalcular, y es el que explica por qué se reportó.
  distancia_metros integer,
  estado           text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente','aplicado','descartado')),
  -- La corrección que consumió este reporte. NULL mientras está pendiente.
  resuelto_en      uuid REFERENCES comercios_ubicacion_historial(id),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comercios_reportes_ubicacion_comercio_idx
  ON comercios_reportes_ubicacion (comercio_id, estado);


-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: activada y SIN policy permisiva
-- ─────────────────────────────────────────────────────────────────────────────
-- A PROPÓSITO NO SE COPIA el patrón del resto del proyecto:
--
--   CREATE POLICY "service_role_all" ON <tabla> FOR ALL USING (true);
--
-- Se llama service_role_all pero **no tiene cláusula TO**, así que aplica a
-- PUBLIC — `authenticated` incluido. Y `service_role` bypassea RLS por
-- definición, con lo cual esa policy nunca hizo falta para él: lo único que
-- hace es abrirle la tabla a cualquier usuario logueado. Es el agujero que se
-- encontró en `misiones` el 15/9/2026.
--
-- Estas dos tablas se tocan solo desde server actions con service role, así que
-- no necesitan ninguna policy. Copiar el patrón habría sido replicar un bug
-- conocido en tablas nuevas.
ALTER TABLE comercios_ubicacion_historial  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercios_reportes_ubicacion   ENABLE ROW LEVEL SECURITY;
