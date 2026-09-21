ALTER TABLE appointments ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_public_token ON appointments(public_token);