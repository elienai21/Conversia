ALTER TABLE "property_configs"
  ADD COLUMN IF NOT EXISTS "winker_portal_id" TEXT,
  ADD COLUMN IF NOT EXISTS "winker_unit_id"   TEXT;
