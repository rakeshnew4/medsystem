ALTER TABLE theatre_charges ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE theatre_charges ADD COLUMN IF NOT EXISTS source_id BIGINT;
ALTER TABLE theatre_charges ADD COLUMN IF NOT EXISTS catalog_id BIGINT REFERENCES theatre_procedure_catalog(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_theatre_charge_source ON theatre_charges(hospital_id,source_type,source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_theatre_charge_type ON theatre_charges(hospital_id,charge_type,created_at DESC);