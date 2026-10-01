CREATE TABLE IF NOT EXISTS theatre_rooms (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 code TEXT,
 status TEXT NOT NULL DEFAULT 'available',
 UNIQUE(hospital_id,name)
);
CREATE TABLE IF NOT EXISTS theatre_procedures (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
 admission_id BIGINT REFERENCES admissions(id) ON DELETE SET NULL,
 encounter_id BIGINT REFERENCES care_encounters(id) ON DELETE SET NULL,
 doctor_id BIGINT REFERENCES doctors(id) ON DELETE SET NULL,
 theatre_room_id BIGINT REFERENCES theatre_rooms(id) ON DELETE SET NULL,
 procedure_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'scheduled',
 scheduled_start TIMESTAMPTZ,
 scheduled_end TIMESTAMPTZ,
 started_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 cancelled_at TIMESTAMPTZ,
 clinical_notes TEXT,
 outcome TEXT,
 created_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_theatre_proc_hospital_date ON theatre_procedures(hospital_id,scheduled_start);
CREATE INDEX IF NOT EXISTS idx_theatre_proc_patient ON theatre_procedures(hospital_id,patient_id,created_at DESC);
INSERT INTO permissions(permission_key,label,category,description)
VALUES('action.theatre.manage','Manage theatre/procedures','Actions','Schedule and manage clinical procedures')
ON CONFLICT(permission_key) DO NOTHING;
INSERT INTO role_permissions(role,permission_key,allowed)
VALUES
('admin','action.theatre.manage',true),
('doctor','action.theatre.manage',true),
('nurse','action.theatre.manage',true)
ON CONFLICT(role,permission_key) DO UPDATE SET allowed=EXCLUDED.allowed;