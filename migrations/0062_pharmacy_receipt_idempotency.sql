ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pharmacy_stock_tx_idempotency
  ON pharmacy_stock_transactions(hospital_id, transaction_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;