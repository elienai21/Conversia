-- AddColumn: service_orders — operational fields
ALTER TABLE "service_orders"
  ADD COLUMN IF NOT EXISTS "origin"               TEXT,
  ADD COLUMN IF NOT EXISTS "category"             TEXT,
  ADD COLUMN IF NOT EXISTS "subcategory"          TEXT,
  ADD COLUMN IF NOT EXISTS "priority"             TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS "impact_on_stay"       TEXT,
  ADD COLUMN IF NOT EXISTS "guest_name"           TEXT,
  ADD COLUMN IF NOT EXISTS "reservation_code"     TEXT,
  ADD COLUMN IF NOT EXISTS "payment_responsible"  TEXT,
  ADD COLUMN IF NOT EXISTS "due_date"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "started_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completed_at"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "notes"                TEXT,
  ADD COLUMN IF NOT EXISTS "problems"             TEXT;
