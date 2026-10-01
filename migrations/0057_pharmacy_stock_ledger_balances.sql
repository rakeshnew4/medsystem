ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS quantity_before NUMERIC;
ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS quantity_after NUMERIC;
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_tx_stock_created ON pharmacy_stock_transactions(stock_id, created_at, id);