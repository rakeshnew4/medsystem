ALTER TABLE theatre_charges ADD COLUMN IF NOT EXISTS invoice_item_id BIGINT REFERENCES invoice_items(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_theatre_charge_invoice_item ON theatre_charges(invoice_item_id) WHERE invoice_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_theatre_charge_invoice_item ON theatre_charges(hospital_id,invoice_id,invoice_item_id);