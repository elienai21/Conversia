-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "auto_response_intents" TEXT,
ADD COLUMN     "enable_auto_response" BOOLEAN NOT NULL DEFAULT false;
