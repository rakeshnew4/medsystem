-- Nursing triage foundation
CREATE TABLE IF NOT EXISTS triage_assessments (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  queue_entry_id BIGINT REFERENCES queue_entries(id) ON DELETE SET NULL,
  encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL,
  assessed_by TEXT,
  acuity TEXT NOT NULL DEFAULT 'routine',
  chief_complaint TEXT,
  pain_score INTEGER,
  consciousness TEXT,
  mobility TEXT,
  pregnancy_status TEXT,
  red_flags TEXT,
  disposition TEXT,
  notes TEXT,
  assessed_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT triage_acuity_chk CHECK (acuity IN ('emergency','urgent','priority','routine')),
  CONSTRAINT triage_pain_chk CHECK (pain_score IS NULL OR (pain_score >= 0 AND pain_score <= 10))
);
CREATE INDEX IF NOT EXISTS idx_triage_patient ON triage_assessments(hospital_id,patient_id,assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_queue ON triage_assessments(hospital_id,queue_entry_id,assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_acuity ON triage_assessments(hospital_id,acuity,assessed_at DESC);