-- Agrega columna activo a profiles para gestión de cuentas desde admin
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
