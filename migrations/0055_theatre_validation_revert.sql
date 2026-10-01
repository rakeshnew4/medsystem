ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_reverted_at TIMESTAMPTZ;
ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_reverted_by TEXT;
ALTER TABLE theatre_procedures ADD COLUMN IF NOT EXISTS validation_revert_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_theatre_procedures_validation_reverted ON theatre_procedures(hospital_id,validation_reverted_at);

INSERT INTO permissions(permission_key,label,category,description)
VALUES ('action.theatre.validation_revert','Revert Theatre surgery validation','Actions','Reopen a validated Theatre procedure for controlled clinical/financial corrections')
ON CONFLICT (permission_key) DO UPDATE SET label=EXCLUDED.label,category=EXCLUDED.category,description=EXCLUDED.description;

INSERT INTO role_permissions(role,permission_key,allowed)
SELECT 'admin',permission_key,true FROM permissions WHERE permission_key='action.theatre.validation_revert'
ON CONFLICT (role,permission_key) DO UPDATE SET allowed=true;

INSERT INTO role_permissions(role,permission_key,allowed)
SELECT 'billing',permission_key,true FROM permissions WHERE permission_key='action.theatre.validation_revert'
ON CONFLICT (role,permission_key) DO UPDATE SET allowed=true;