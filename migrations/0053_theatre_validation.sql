ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validated_by TEXT;
CREATE INDEX IF NOT EXISTS idx_theatre_procedures_validated ON theatre_procedures(hospital_id,validated_at);