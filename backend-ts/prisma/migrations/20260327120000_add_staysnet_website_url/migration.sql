-- Add staysnet_website_url to tenant_settings for public-facing view-unit links (e.g. https://vivarestay.com)
ALTER TABLE "tenant_settings"
  ADD COLUMN IF NOT EXISTS "staysnet_website_url" TEXT;
