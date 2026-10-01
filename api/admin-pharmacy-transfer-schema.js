import { db } from "../lib/db.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
  await db.query("ALTER TABLE pharmacy_stock_transactions ADD COLUMN IF NOT EXISTS transfer_id BIGINT");
  await db.query("CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_tx_transfer ON pharmacy_stock_transactions(transfer_id)");
  return res.json({ok:true,table:"pharmacy_stock_transactions",column:"transfer_id",index:"idx_pharmacy_stock_tx_transfer"});
}