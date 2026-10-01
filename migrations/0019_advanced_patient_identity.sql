-- HMIS-aligned richer identity layer without forcing every OPD registration field.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS registration_source TEXT NOT NULL DEFAULT 'staff';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS registration_source_locked BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS patient_identity (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  title TEXT,
  sex TEXT,
  nic_passport TEXT,
  alternate_phone TEXT,
  address TEXT,
  area TEXT,
  blood_group TEXT,
  occupation TEXT,
  emergency_contact TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_identity_hospital_nic
  ON patient_identity(hospital_id,nic_passport)
  WHERE nic_passport IS NOT NULL AND nic_passport <> '';

CREATE INDEX IF NOT EXISTS idx_patient_identity_hospital_phone
  ON patient_identity(hospital_id,alternate_phone)
  WHERE alternate_phone IS NOT NULL AND alternate_phone <> '';