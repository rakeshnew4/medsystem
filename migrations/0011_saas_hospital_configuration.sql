-- CareFlow SaaS foundation: organization tenancy and hospital-level configuration.
-- Existing operational tables remain hospital-scoped through hospital_id.
-- This migration is additive and preserves existing hospital data.

CREATE TABLE IF NOT EXISTS organizations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS organization_id BIGINT;

INSERT INTO organizations(name, slug)
SELECT h.name,
       COALESCE(
         NULLIF(
           trim(both '-' from regexp_replace(lower(h.name), '[^a-z0-9]+', '-', 'g')),
           ''
         ),
         'hospital-' || h.id::text
       ) || '-' || h.id::text
FROM hospitals h
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.slug = (
    COALESCE(
      NULLIF(
        trim(both '-' from regexp_replace(lower(h.name), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'hospital-' || h.id::text
    ) || '-' || h.id::text
  )
);

UPDATE hospitals h
SET organization_id = o.id
FROM organizations o
WHERE h.organization_id IS NULL
  AND o.slug = (
    COALESCE(
      NULLIF(
        trim(both '-' from regexp_replace(lower(h.name), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'hospital-' || h.id::text
    ) || '-' || h.id::text
  );

ALTER TABLE hospitals
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE hospitals
  ADD CONSTRAINT hospitals_organization_fk
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_hospitals_organization
  ON hospitals(organization_id);

CREATE TABLE IF NOT EXISTS hospital_settings (
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, setting_key)
);

CREATE TABLE IF NOT EXISTS hospital_features (
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, feature_key)
);

CREATE TABLE IF NOT EXISTS hospital_modules (
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  display_order INTEGER NOT NULL DEFAULT 100,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, module_key)
);

CREATE TABLE IF NOT EXISTS hospital_labels (
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  label_key TEXT NOT NULL,
  label_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, label_key)
);

CREATE TABLE IF NOT EXISTS hospital_services (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  service_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  service_type TEXT NOT NULL DEFAULT 'consultation',
  price NUMERIC(12,2),
  duration_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_service_code
  ON hospital_services(hospital_id, service_code)
  WHERE service_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hospital_services_hospital_active
  ON hospital_services(hospital_id, active);

CREATE TABLE IF NOT EXISTS hospital_working_hours (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME,
  end_time TIME,
  is_open BOOLEAN NOT NULL DEFAULT true,
  slot_duration_minutes INTEGER,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(hospital_id, day_of_week)
);

-- Seed safe defaults for every existing hospital. Values are intentionally
-- configuration defaults; transactional records retain their own historical values.
INSERT INTO hospital_settings(hospital_id, setting_key, setting_value)
SELECT h.id, v.setting_key, v.setting_value
FROM hospitals h
CROSS JOIN (
  VALUES
    ('general', '{"currency":"INR","date_format":"DD/MM/YYYY"}'::jsonb),
    ('appointments', '{"default_duration_minutes":15,"allow_walkins":true,"allow_same_day_booking":true,"booking_window_days":30}'::jsonb),
    ('queue', '{"enabled":true,"allow_priority":true,"token_prefix":"T"}'::jsonb),
    ('billing', '{"enabled":true,"tax_enabled":false,"default_tax_rate":0}'::jsonb),
    ('communication', '{"whatsapp_enabled":false,"sms_enabled":false,"email_enabled":false,"appointment_reminders":true,"followup_reminders":true}'::jsonb),
    ('clinical', '{"vitals_enabled":true,"followups_enabled":true}'::jsonb)
) AS v(setting_key, setting_value)
ON CONFLICT (hospital_id, setting_key) DO NOTHING;

INSERT INTO hospital_modules(hospital_id, module_key, enabled, display_name, display_order)
SELECT h.id, v.module_key, v.enabled, v.display_name, v.display_order
FROM hospitals h
CROSS JOIN (
  VALUES
    ('dashboard', true, 'Overview', 10),
    ('queue', true, 'Queue', 20),
    ('appointments', true, 'Appointments', 30),
    ('patients', true, 'Patients', 40),
    ('doctors', true, 'Doctors', 50),
    ('followups', true, 'Follow-ups', 60),
    ('billing', true, 'Billing', 70),
    ('lab', true, 'Lab', 80),
    ('pharmacy', true, 'Pharmacy', 90),
    ('beds', true, 'Beds & admissions', 100),
    ('insights', true, 'Insights', 110),
    ('staff', true, 'Staff', 120),
    ('setup', true, 'Hospital setup', 130)
) AS v(module_key, enabled, display_name, display_order)
ON CONFLICT (hospital_id, module_key) DO NOTHING;

INSERT INTO hospital_features(hospital_id, feature_key, enabled)
SELECT h.id, v.feature_key, v.enabled
FROM hospitals h
CROSS JOIN (
  VALUES
    ('online_booking', true),
    ('patient_portal', true),
    ('whatsapp', false),
    ('sms', false),
    ('email_notifications', false),
    ('lab', true),
    ('pharmacy', true),
    ('beds', true),
    ('inpatient', true),
    ('ai_assistant', true),
    ('advanced_analytics', true)
) AS v(feature_key, enabled)
ON CONFLICT (hospital_id, feature_key) DO NOTHING;

INSERT INTO hospital_labels(hospital_id, label_key, label_value)
SELECT h.id, v.label_key, v.label_value
FROM hospitals h
CROSS JOIN (
  VALUES
    ('patient', 'Patient'),
    ('doctor', 'Doctor'),
    ('appointment', 'Appointment'),
    ('queue', 'Queue'),
    ('doctor_room', 'Doctor Room'),
    ('followup', 'Follow-up')
) AS v(label_key, label_value)
ON CONFLICT (hospital_id, label_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_hospital_settings_key
  ON hospital_settings(hospital_id, setting_key);

CREATE INDEX IF NOT EXISTS idx_hospital_features_enabled
  ON hospital_features(hospital_id, enabled);

CREATE INDEX IF NOT EXISTS idx_hospital_modules_order
  ON hospital_modules(hospital_id, enabled, display_order);

CREATE INDEX IF NOT EXISTS idx_hospital_labels_key
  ON hospital_labels(hospital_id, label_key);

CREATE INDEX IF NOT EXISTS idx_hospital_working_hours
  ON hospital_working_hours(hospital_id, day_of_week);