CREATE TABLE staff_profiles (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'pending',
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_hospital ON staff_profiles(hospital_id);
CREATE INDEX idx_staff_role ON staff_profiles(hospital_id,role);

CREATE TABLE queue_entries (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  stage TEXT NOT NULL DEFAULT 'waiting',
  priority TEXT NOT NULL DEFAULT 'normal',
  token TEXT,
  reason TEXT,
  notes TEXT,
  checked_in_at TIMESTAMP NOT NULL DEFAULT now(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_board ON queue_entries(hospital_id,stage,created_at);
CREATE INDEX idx_queue_patient ON queue_entries(hospital_id,patient_id);

CREATE TABLE vitals (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  queue_entry_id BIGINT REFERENCES queue_entries(id) ON DELETE SET NULL,
  recorded_by TEXT,
  blood_pressure_systolic NUMERIC,
  blood_pressure_diastolic NUMERIC,
  pulse INTEGER,
  temperature NUMERIC,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  spo2 NUMERIC,
  respiratory_rate INTEGER,
  notes TEXT,
  recorded_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_vitals_patient ON vitals(hospital_id,patient_id,recorded_at DESC);

CREATE TABLE doctor_visits (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  appointment_id BIGINT REFERENCES appointments(id) ON DELETE SET NULL,
  queue_entry_id BIGINT REFERENCES queue_entries(id) ON DELETE SET NULL,
  visit_number INTEGER NOT NULL DEFAULT 1,
  visit_status TEXT NOT NULL DEFAULT 'open',
  clinical_notes TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  ended_at TIMESTAMP
);

CREATE INDEX idx_visits_patient ON doctor_visits(hospital_id,patient_id,started_at DESC);

CREATE TABLE lab_orders (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  visit_id BIGINT REFERENCES doctor_visits(id) ON DELETE SET NULL,
  queue_entry_id BIGINT REFERENCES queue_entries(id) ON DELETE SET NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ordered',
  ordered_at TIMESTAMP NOT NULL DEFAULT now(),
  completed_at TIMESTAMP,
  result_summary TEXT,
  notes TEXT
);

CREATE INDEX idx_lab_patient ON lab_orders(hospital_id,patient_id,ordered_at DESC);

CREATE TABLE medications (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  visit_id BIGINT REFERENCES doctor_visits(id) ON DELETE SET NULL,
  medicine_name TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  prescribed_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_meds_patient ON medications(hospital_id,patient_id,prescribed_at DESC);

CREATE TABLE clinical_reports (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id BIGINT REFERENCES doctor_visits(id) ON DELETE SET NULL,
  lab_order_id BIGINT REFERENCES lab_orders(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL DEFAULT 'report',
  title TEXT NOT NULL,
  report_date DATE,
  file_url TEXT,
  summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_patient ON clinical_reports(hospital_id,patient_id,created_at DESC);

CREATE TABLE beds (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  ward TEXT NOT NULL,
  bed_number TEXT NOT NULL,
  bed_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(hospital_id,ward,bed_number)
);

CREATE TABLE admissions (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  bed_id BIGINT REFERENCES beds(id) ON DELETE SET NULL,
  admitting_doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
  admitted_at TIMESTAMP NOT NULL DEFAULT now(),
  expected_discharge_date DATE,
  discharged_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'admitted',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_admissions_hospital_status ON admissions(hospital_id,status);
CREATE UNIQUE INDEX uq_active_bed ON admissions(bed_id) WHERE discharged_at IS NULL;