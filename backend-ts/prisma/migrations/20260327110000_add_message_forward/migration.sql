-- AddColumn: forwarded_from_id on messages (self-reference for forwarded messages)
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "forwarded_from_id" UUID REFERENCES "messages"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ix_messages_forwarded_from" ON "messages"("forwarded_from_id");
