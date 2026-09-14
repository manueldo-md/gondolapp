-- campanas.minimo_comercios — el piso de representatividad del relevamiento
--
-- QUÉ ES: la cantidad mínima de PDV para que el estudio sirva. Por debajo de
-- ese número el relevamiento no es representativo y no se le muestra a una
-- marca como conclusión.
--
-- NO CONFUNDIR con las otras dos columnas parecidas de esta misma tabla:
--   minimo_comercios          → piso de representatividad del ESTUDIO
--   tope_total_comercios      → techo operativo; al alcanzarlo la campaña
--                               se cierra sola
--   min_comercios_para_cobrar → misiones que un GONDOLERO tiene que completar
--                               para cobrar. Nada que ver con las otras dos
--
-- POR QUÉ ADD Y NO RENAME de objetivo_comercios: un RENAME tiene siempre una
-- ventana rota. Si se renombra primero, el código desplegado pide la columna
-- vieja y PostgREST devuelve 42703; si se despliega el código primero, pide la
-- nueva que todavía no existe. Expand/contract no tiene ese estado: se agrega
-- la nueva, se migra el código, y recién después se borra la vieja.
-- El DROP de objetivo_comercios va en una migración aparte, cuando ningún
-- código mencione el nombre viejo Y esté verificado en producción.
--
-- NULLABLE A PROPÓSITO: el editor la pide obligatoria para las campañas
-- nuevas, pero las 23 existentes no tienen valor y no se les inventa uno.
-- Un mínimo inventado o certifica como representativo un estudio que no lo es,
-- o invalida uno que sí — las dos direcciones son peores que no tener número.
-- Las campañas sin mínimo se muestran como "sin mínimo definido".

ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS minimo_comercios integer;

COMMENT ON COLUMN campanas.minimo_comercios IS
  'Piso de PDV para que el relevamiento sea representativo: por debajo no se muestra como conclusión a una marca. Distinto de min_comercios_para_cobrar (misiones por gondolero para cobrar) y de tope_total_comercios (techo que cierra la campaña).';
