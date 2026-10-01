import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  await db.query(`CREATE TABLE IF NOT EXISTS pharmacy_stock_transfers (
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
  )`);
  await db.query("CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_transfers_hospital_status ON pharmacy_stock_transfers(hospital_id,status,requested_at DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_transfers_destination ON pharmacy_stock_transfers(hospital_id,destination_department_id,status,requested_at DESC)");
  await db.query("ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS transfer_id BIGINT");
  await db.query("CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_tx_transfer ON pharmacy_stock_transactions(transfer_id)");
  return res.json({ok:true,transfer_table:true,transfer_ledger_link:true});
}