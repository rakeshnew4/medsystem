CREATE TABLE IF NOT EXISTS theatre_charges (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 procedure_id BIGINT NOT NULL REFERENCES theatre_procedures(id) ON DELETE CASCADE,
 patient_id BIGINT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
 charge_type TEXT NOT NULL,
 description TEXT NOT NULL,
 quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
 unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
 amount NUMERIC(12,2) NOT NULL DEFAULT 0,
 invoice_id BIGINT REFERENCES invoices(id) ON DELETE SET NULL,
 created_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(hospital_id,procedure_id,charge_type,description)
);
CREATE INDEX IF NOT EXISTS idx_theatre_charges_patient ON theatre_charges(hospital_id,patient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_theatre_charges_invoice ON theatre_charges(hospital_id,invoice_id);