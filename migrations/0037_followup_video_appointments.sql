ALTER TABLE followups ADD COLUMN IF NOT EXISTS appointment_id bigint REFERENCES appointments(id) ON DELETE SET NULL;
ALTER TABLE followups ADD COLUMN IF NOT EXISTS consultation_type text NOT NULL DEFAULT 'in_person';
CREATE INDEX IF NOT EXISTS idx_followups_appointment_id ON followups(appointment_id);