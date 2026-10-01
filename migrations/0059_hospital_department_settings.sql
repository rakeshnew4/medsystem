CREATE TABLE IF NOT EXISTS hospital_department_settings (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, department_id, setting_key)
);
CREATE INDEX IF NOT EXISTS idx_hospital_dept_settings_scope
  ON hospital_department_settings(hospital_id, department_id);