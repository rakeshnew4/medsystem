CREATE TABLE IF NOT EXISTS invoice_payments (
 id BIGSERIAL PRIMARY KEY,
 hospital_id BIGINT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
 invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 payment_method TEXT,
 reference TEXT,
 received_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(hospital_id,invoice_id,created_at DESC);