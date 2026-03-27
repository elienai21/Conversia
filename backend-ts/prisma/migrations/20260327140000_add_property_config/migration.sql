-- Add listing_id and required_fields to task_queue
ALTER TABLE "task_queue"
  ADD COLUMN IF NOT EXISTS "listing_id" TEXT,
  ADD COLUMN IF NOT EXISTS "required_fields" TEXT;

-- Create property_configs table
CREATE TABLE IF NOT EXISTS "property_configs" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            UUID NOT NULL,
  "listing_id"           TEXT NOT NULL,
  "listing_name"         TEXT,
  "has_garage"           BOOLEAN NOT NULL DEFAULT false,
  "has_facial_biometrics" BOOLEAN NOT NULL DEFAULT false,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "property_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ix_property_config_tenant_listing"
  ON "property_configs"("tenant_id", "listing_id");
