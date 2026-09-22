ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS invoice_id bigint REFERENCES invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lab_orders_invoice ON lab_orders(invoice_id);