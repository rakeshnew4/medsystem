-- CareFlow OPD/IPD foundation
-- Keeps existing OPD workflow intact while making IPD admissions and bed history explicit.

CREATE TABLE IF NOT EXISTS care_encounters (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  encounter_type TEXT NOT NULL CHECK (encounter_type IN ('opd','ipd')),
  appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
  admission_id BIGINT REFERENCES admissions(id) ON DELETE SET NULL,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reason TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_encounters_patient
  ON care_encounters(hospital_id, patient_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_care_encounters_type
  ON care_encounters(hospital_id, encounter_type, status, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_care_encounter_appointment
  ON care_encounters(appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bed_assignments (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  admission_id BIGINT NOT NULL REFERENCES admissions(id) ON DELETE CASCADE,
  bed_id BIGINT NOT NULL REFERENCES beds(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  released_at TIMESTAMP,
  reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bed_assignments_admission
  ON bed_assignments(hospital_id, admission_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_bed_assignments_bed
  ON bed_assignments(hospital_id, bed_id, assigned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_bed_assignment
  ON bed_assignments(bed_id)
  WHERE released_at IS NULL;

ALTER TABLE admissions ADD COLUMN IF NOT EXISTS admission_number TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS admission_type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_summary TEXT;
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_admission_number
  ON admissions(hospital_id, admission_number)
  WHERE admission_number IS NOT NULL;

ALTER TABLE vitals ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;
ALTER TABLE doctor_visits ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;
ALTER TABLE medications ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;
ALTER TABLE clinical_reports ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;
ALTER TABLE followups ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vitals_encounter ON vitals(encounter_id);
CREATE INDEX IF NOT EXISTS idx_doctor_visits_encounter ON doctor_visits(encounter_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_encounter ON lab_orders(encounter_id);
CREATE INDEX IF NOT EXISTS idx_medications_encounter ON medications(encounter_id);
CREATE INDEX IF NOT EXISTS idx_reports_encounter ON clinical_reports(encounter_id);
CREATE INDEX IF NOT EXISTS idx_followups_encounter ON followups(encounter_id);

-- Existing admissions become explicit IPD encounters.
INSERT INTO care_encounters (
  hospital_id, patient_id, encounter_type, admission_id, doctor_id,
  status, started_at, ended_at, created_at, updated_at
)
SELECT
  a.hospital_id,
  a.patient_id,
  'ipd',
  a.id,
  a.admitting_doctor_id,
  CASE WHEN a.discharged_at IS NULL THEN 'open' ELSE 'completed' END,
  a.admitted_at,
  a.discharged_at,
  a.created_at,
  a.updated_at
FROM admissions a
WHERE NOT EXISTS (
  SELECT 1 FROM care_encounters ce WHERE ce.admission_id = a.id
);

-- Preserve current bed occupancy in the new assignment history.
INSERT INTO bed_assignments (hospital_id, admission_id, bed_id, assigned_at, released_at, reason)
SELECT
  a.hospital_id,
  a.id,
  a.bed_id,
  a.admitted_at,
  a.discharged_at,
  'Migrated from existing admission'
FROM admissions a
WHERE a.bed_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bed_assignments ba WHERE ba.admission_id = a.id AND ba.bed_id = a.bed_id
  );
-- Existing completed/open doctor visits are OPD records unless already tied to IPD.
INSERT INTO care_encounters (
  hospital_id, patient_id, encounter_type, appointment_id, doctor_id,
  status, started_at, ended_at, reason, created_at, updated_at
)
SELECT
  v.hospital_id,
  v.patient_id,
  'opd',
  v.appointment_id,
  v.doctor_id,
  CASE WHEN v.visit_status='completed' THEN 'completed' ELSE 'open' END,
  v.started_at,
  v.ended_at,
  'Migrated OPD consultation',
  v.started_at,
  COALESCE(v.ended_at,v.started_at)
FROM doctor_visits v
WHERE v.encounter_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM care_encounters ce
    WHERE ce.hospital_id=v.hospital_id
      AND ce.patient_id=v.patient_id
      AND ce.encounter_type='opd'
      AND (
        (v.appointment_id IS NOT NULL AND ce.appointment_id=v.appointment_id)
        OR (v.appointment_id IS NULL AND ce.started_at=v.started_at)
      )
  );

UPDATE doctor_visits v
SET encounter_id=ce.id
FROM care_encounters ce
WHERE v.encounter_id IS NULL
  AND ce.hospital_id=v.hospital_id
  AND ce.patient_id=v.patient_id
  AND ce.encounter_type='opd'
  AND (
    (v.appointment_id IS NOT NULL AND ce.appointment_id=v.appointment_id)
    OR (v.appointment_id IS NULL AND ce.started_at=v.started_at)
  );