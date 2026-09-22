ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS public_token uuid DEFAULT gen_random_uuid();
ALTER TABLE doctors ADD COLUMN IF NOT EXISTS display_room text;
UPDATE queue_entries SET public_token=gen_random_uuid() WHERE public_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_public_token ON queue_entries(public_token);
CREATE INDEX IF NOT EXISTS idx_queue_entries_hospital_token_date_stage ON queue_entries(hospital_id,token_date,stage,token_number);