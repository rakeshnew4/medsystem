ALTER TABLE pharmacy_stock DROP CONSTRAINT IF EXISTS pharmacy_stock_hospital_id_medicine_name_batch_no_key;
ALTER TABLE pharmacy_stock ADD COLUMN IF NOT EXISTS department_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_stock_location_batch ON pharmacy_stock(hospital_id,COALESCE(department_id,0),medicine_name,batch_no);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_department ON pharmacy_stock(hospital_id,department_id,medicine_name);
CREATE TABLE IF NOT EXISTS pharmacy_stock_transfers (
  id BIGSERIAL PRIMARY KEY,
  hospital_id BIGINT NOT NULL,
  source_stock_id BIGINT NOT NULL,
  source_department_id BIGINT,
  destination_department_id BIGINT NOT NULL,
  medicine_name TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  expiry_date DATE,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'unit',
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','received','cancelled')),
  requested_by TEXT NOT NULL,
  received_by TEXT,
  cancelled_by TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  notes TEXT,
  receive_notes TEXT,
  CHECK (source_department_id IS NULL OR source_department_id <> destination_department_id)
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_transfers_hospital_status ON pharmacy_stock_transfers(hospital_id,status,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_transfers_destination ON pharmacy_stock_transfers(hospital_id,destination_department_id,status,requested_at DESC);