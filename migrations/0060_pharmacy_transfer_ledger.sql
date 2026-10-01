ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS transfer_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_tx_transfer ON pharmacy_stock_transactions(transfer_id);