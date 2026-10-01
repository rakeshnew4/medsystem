ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS ward_returned_at TIMESTAMPTZ;
ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS ward_return_notes TEXT;
ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS ward_returned_by TEXT;
CREATE INDEX IF NOT EXISTS idx_theatre_proc_ward_return ON theatre_procedures(hospital_id,ward_returned_at);