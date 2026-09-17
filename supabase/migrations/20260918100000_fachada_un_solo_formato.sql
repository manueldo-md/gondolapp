-- ─────────────────────────────────────────────────────────────────────────────
-- `comercios.foto_fachada_url` — un solo formato: STORAGE PATH
--
-- La columna tenía DOS formatos según por dónde entró el comercio:
--   · `crearComercioNuevo`        → storage path  (`fachadas/<campana>/<ts>_<user>.jpg`)
--   · `crearComercioParaCaptura`  → URL pública completa
--
-- Las cinco pantallas que muestran fachadas hacen `createSignedUrl(valor)`, o
-- sea que asumen un path. Con una URL adentro, el "path" que le llega a Storage
-- es `https:/proyecto.supabase.co/...`, no existe ningún objeto así, la firma
-- falla y el thumb queda roto.
--
-- Verificado en dev el 17/9/2026: las filas con URL fallan al firmar, las que
-- tienen path firman bien, y los archivos de las 7 existen. O sea que el formato
-- nuevo era el correcto y el viejo el roto.
--
-- ── POR QUÉ GANA EL PATH ────────────────────────────────────────────────────
-- 1. **Los dos buckets son PRIVADOS** (`fotos-gondola`, `fotos-fachada`). La URL
--    guardada es `/object/public/…`, que en un bucket privado no sirve para
--    nada. No es preferencia de formato: la URL era dato malo.
-- 2. **La URL lleva el dominio del proyecto adentro.** Un dump de dev restaurado
--    en prod —o al revés— deja filas apuntando al storage del otro ambiente. Un
--    path es relativo al bucket del cliente que firma: siempre resuelve contra
--    el ambiente donde corre.
-- 3. El código ya esperaba un path en los cinco lugares, y `fotos.storage_path`
--    ya establece la convención.
--
-- Al 17/9/2026: dev tiene 3 filas para convertir, prod 0 (su única fachada ya es
-- un path). La migración es idempotente igual — corre sobre lo que haya.
-- ─────────────────────────────────────────────────────────────────────────────

-- Extrae lo que sigue a `/object/public/<bucket>/` o `/object/sign/<bucket>/`,
-- y corta en `?` para no arrastrar el token de una URL ya firmada.
--
-- Las URLs que NO son de nuestro storage (Drive, picsum, cualquier otra) no
-- matchean y se dejan intactas: convertirlas a un path inventado sería peor que
-- dejarlas rotas, porque `pathDeFachada` las reconoce como ajenas y las muestra
-- tal cual.
UPDATE comercios
SET foto_fachada_url = substring(
      foto_fachada_url FROM '/object/(?:public|sign)/[^/]+/([^?]+)'
    )
WHERE foto_fachada_url IS NOT NULL
  AND foto_fachada_url ~ '^https?://'
  AND foto_fachada_url ~ '/object/(public|sign)/[^/]+/';

COMMENT ON COLUMN comercios.foto_fachada_url IS
  'STORAGE PATH dentro del bucket fotos-gondola (prefijo fachadas/), no una URL. '
  'La URL se resuelve al leer con lib/storage-fotos.ts, que firma: el bucket es '
  'privado. Guardar la URL metía el dominio del proyecto en los datos.';

-- Verificación — tiene que devolver 0 filas:
--
--   SELECT id, nombre, foto_fachada_url
--   FROM comercios
--   WHERE foto_fachada_url ~ '^https?://';
