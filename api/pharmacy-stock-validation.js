import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const checks=[];
  const add=async(name,sql)=>{const r=await db.query(sql); checks.push({name,violations:Number(r.rows[0]?.violations||0)});};
  await add("invalid_transaction_quantities","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity IS NULL OR quantity<=0");
  await add("orphan_or_cross_hospital_stock","SELECT count(*) AS violations FROM pharmacy_stock_transactions t LEFT JOIN pharmacy_stock s ON s.id=t.stock_id WHERE s.id IS NULL OR s.hospital_id<>t.hospital_id");
  await add("invalid_transaction_types","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE transaction_type NOT IN ('receipt','dispense')");
  await add("missing_balance_snapshots","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_before IS NULL OR quantity_after IS NULL");
  await add("balance_math","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_before IS NOT NULL AND quantity_after IS NOT NULL AND ((transaction_type='receipt' AND quantity_after<>quantity_before+quantity) OR (transaction_type='dispense' AND quantity_after<>quantity_before-quantity))");
  await add("negative_after_balance","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_after IS NOT NULL AND quantity_after<0");
  await add("ledger_continuity","WITH ordered AS (SELECT stock_id,quantity_before,quantity_after,LAG(quantity_after) OVER(PARTITION BY stock_id ORDER BY created_at,id) AS prior_after FROM pharmacy_stock_transactions) SELECT count(*) AS violations FROM ordered WHERE prior_after IS NOT NULL AND quantity_before<>prior_after");
  await add("latest_balance_matches_stock","WITH latest AS (SELECT DISTINCT ON (stock_id) stock_id,quantity_after FROM pharmacy_stock_transactions ORDER BY stock_id,created_at DESC,id DESC) SELECT count(*) AS violations FROM latest l JOIN pharmacy_stock s ON s.id=l.stock_id WHERE s.quantity<>l.quantity_after");
  return res.json({ok:checks.every(x=>x.violations===0),checks,total_violations:checks.reduce((a,x)=>a+x.violations,0)});
}