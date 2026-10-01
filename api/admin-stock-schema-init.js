import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  await db.query(`CREATE TABLE IF NOT EXISTS pharmacy_stock (
    id BIGSERIAL PRIMARY KEY, hospital_id BIGINT NOT NULL, medicine_name TEXT NOT NULL,
    batch_no TEXT NOT NULL, expiry_date DATE, quantity NUMERIC NOT NULL DEFAULT 0,
    reorder_level NUMERIC NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'unit',
    active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(hospital_id, medicine_name, batch_no));
    CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_hospital_medicine ON pharmacy_stock(hospital_id, medicine_name);
    CREATE TABLE IF NOT EXISTS pharmacy_stock_transactions (
    id BIGSERIAL PRIMARY KEY, hospital_id BIGINT NOT NULL, stock_id BIGINT NOT NULL,
    transaction_type TEXT NOT NULL, quantity NUMERIC NOT NULL, medication_id BIGINT,
    patient_id BIGINT, encounter_id BIGINT, performed_by TEXT, notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_tx_hospital ON pharmacy_stock_transactions(hospital_id, created_at DESC);`,[]);
  const a=await db.query("SELECT count(*)::int AS n FROM pharmacy_stock",[]);
  const b=await db.query("SELECT count(*)::int AS n FROM pharmacy_stock_transactions",[]);
  return res.json({ok:true,pharmacy_stock_rows:a.rows[0].n,pharmacy_stock_transaction_rows:b.rows[0].n});
}