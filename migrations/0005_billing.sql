CREATE TABLE invoices (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 patient_id BIGINT NOT NULL REFERENCES patients(id),
 appointment_id BIGINT REFERENCES appointments(id),
 visit_id BIGINT REFERENCES doctor_visits(id),
 invoice_number TEXT NOT NULL,
 subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
 discount NUMERIC(12,2) NOT NULL DEFAULT 0,
 tax NUMERIC(12,2) NOT NULL DEFAULT 0,
 total NUMERIC(12,2) NOT NULL DEFAULT 0,
 paid NUMERIC(12,2) NOT NULL DEFAULT 0,
 payment_method TEXT,
 status TEXT NOT NULL DEFAULT 'unpaid',
 notes TEXT,
 created_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(hospital_id,invoice_number)
);
CREATE TABLE invoice_items (
 id BIGSERIAL PRIMARY KEY,
 invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
 description TEXT NOT NULL,
 quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
 unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
 amount NUMERIC(12,2) NOT NULL DEFAULT 0
);