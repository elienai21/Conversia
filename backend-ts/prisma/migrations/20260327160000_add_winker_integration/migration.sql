ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "winker_api_token" TEXT,
  ADD COLUMN IF NOT EXISTS "winker_portal_id" TEXT;
