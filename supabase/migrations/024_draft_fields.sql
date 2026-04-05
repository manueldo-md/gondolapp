-- Draft fields for campaign editing workflow (Opción A)
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS draft_descripcion text;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS draft_zonas jsonb;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS draft_bounty numeric;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS draft_bloques jsonb;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS tiene_draft boolean DEFAULT false;
ALTER TABLE campanas ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_campanas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_campanas_updated_at ON campanas;
CREATE TRIGGER trigger_campanas_updated_at
  BEFORE UPDATE ON campanas
  FOR EACH ROW
  EXECUTE FUNCTION update_campanas_updated_at();
