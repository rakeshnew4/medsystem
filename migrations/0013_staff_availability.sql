CREATE TABLE IF NOT EXISTS staff_presence (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'available',
  status_text TEXT,
  expected_until TIMESTAMP,
  started_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (staff_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_presence_hospital_status ON staff_presence(hospital_id,status);

CREATE TABLE IF NOT EXISTS staff_schedules (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'work',
  location TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_schedules_staff_day ON staff_schedules(staff_id,day_of_week,active);

CREATE TABLE IF NOT EXISTS staff_schedule_exceptions (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  staff_id BIGINT NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  exception_type TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_schedule_exceptions_staff_date ON staff_schedule_exceptions(staff_id,exception_date);

CREATE TABLE IF NOT EXISTS doctor_availability_rules (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  appointment_type TEXT NOT NULL DEFAULT 'opd',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK(slot_duration_minutes > 0),
  max_patients INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_availability_doctor_day ON doctor_availability_rules(doctor_id,day_of_week,active);

CREATE TABLE IF NOT EXISTS doctor_availability_exceptions (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  exception_type TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_availability_exceptions_doctor_date ON doctor_availability_exceptions(doctor_id,exception_date);