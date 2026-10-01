CREATE TABLE IF NOT EXISTS theatre_procedure_catalog (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 code TEXT,
 default_duration_minutes INTEGER,
 service_type TEXT NOT NULL DEFAULT 'procedure',
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(hospital_id,name)
);
CREATE INDEX IF NOT EXISTS idx_theatre_catalog_hospital_active ON theatre_procedure_catalog(hospital_id,active,name);
ALTER TABLE theatre_rooms ADD COLUMN IF NOT EXISTS notes TEXT;