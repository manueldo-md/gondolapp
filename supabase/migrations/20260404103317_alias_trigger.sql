-- =============================================================================
-- Migration 015: Actualizar handle_new_user para leer alias desde metadata
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tipo_actor, nombre, alias, celular, distri_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'tipo_actor', 'gondolero'),
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'alias', '')), ''),
    NEW.raw_user_meta_data->>'celular',
    CASE
      WHEN NEW.raw_user_meta_data->>'distri_id' IS NOT NULL
        AND NEW.raw_user_meta_data->>'distri_id' != ''
      THEN (NEW.raw_user_meta_data->>'distri_id')::uuid
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
