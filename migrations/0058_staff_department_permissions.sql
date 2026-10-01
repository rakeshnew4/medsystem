ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_staff_hospital_department ON staff_profiles(hospital_id,department_id);
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE user_permissions DROP CONSTRAINT IF EXISTS user_permissions_pkey;
ALTER TABLE user_permissions ADD CONSTRAINT user_permissions_pkey PRIMARY KEY(id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_permissions_scope ON user_permissions(staff_id,permission_key,COALESCE(department_id,0));
CREATE INDEX IF NOT EXISTS idx_user_permissions_staff_department ON user_permissions(staff_id,department_id);