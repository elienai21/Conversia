-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "instagram_page_access_token" TEXT,
ADD COLUMN     "instagram_page_id" TEXT,
ADD COLUMN     "instagram_verify_token" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "instagram_page_id" TEXT;
