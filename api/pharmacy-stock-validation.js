import { db } from "../lib/db.js";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
  const checks=[];
  const add=async(name,sql)=>{const r=await db.query(sql);checks.push({name,violations:Number(r.rows[0]?.violations||0)});};
  await add("invalid_transaction_quantities","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity IS NULL OR quantity<=0");
  await add("orphan_or_cross_hospital_stock","SELECT count(*) AS violations FROM pharmacy_stock_transactions t LEFT JOIN pharmacy_stock s ON s.id=t.stock_id WHERE s.id IS NULL OR s.hospital_id<>t.hospital_id");
  await add("invalid_transaction_types","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE transaction_type NOT IN ('receipt','dispense','transfer_out','transfer_in','transfer_return')");
  await add("missing_balance_snapshots","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_before IS NULL OR quantity_after IS NULL");
  await add("balance_math","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_before IS NOT NULL AND quantity_after IS NOT NULL AND ((transaction_type IN ('receipt','transfer_in','transfer_return') AND quantity_after<>quantity_before+quantity) OR (transaction_type IN ('dispense','transfer_out') AND quantity_after<>quantity_before-quantity))");
  await add("negative_after_balance","SELECT count(*) AS violations FROM pharmacy_stock_transactions WHERE quantity_after IS NOT NULL AND quantity_after<0");
  await add("ledger_continuity","WITH ordered AS (SELECT stock_id,quantity_before,quantity_after,LAG(quantity_after) OVER(PARTITION BY stock_id ORDER BY created_at,id) AS prior_after FROM pharmacy_stock_transactions) SELECT count(*) AS violations FROM ordered WHERE prior_after IS NOT NULL AND quantity_before<>prior_after");
  await add("latest_balance_matches_stock","WITH latest AS (SELECT DISTINCT ON (stock_id) stock_id,quantity_after FROM pharmacy_stock_transactions ORDER BY stock_id,created_at DESC,id DESC) SELECT count(*) AS violations FROM latest l JOIN pharmacy_stock s ON s.id=l.stock_id WHERE s.quantity<>l.quantity_after");
  await add("transfer_state_integrity","SELECT count(*) AS violations FROM pharmacy_stock_transfers WHERE (status='in_transit' AND (received_at IS NOT NULL OR cancelled_at IS NOT NULL OR received_by IS NOT NULL OR cancelled_by IS NOT NULL)) OR (status='received' AND (received_at IS NULL OR received_by IS NULL OR cancelled_at IS NOT NULL OR cancelled_by IS NOT NULL)) OR (status='cancelled' AND (cancelled_at IS NULL OR cancelled_by IS NULL OR received_at IS NOT NULL OR received_by IS NOT NULL))");
  await add("transfer_ledger_integrity",`WITH x AS (
    SELECT t.id,t.status,COUNT(*) FILTER (WHERE l.transaction_type='transfer_out') AS outs,
      COUNT(*) FILTER (WHERE l.transaction_type='transfer_in') AS ins,COUNT(*) FILTER (WHERE l.transaction_type='transfer_return') AS return_count
    FROM pharmacy_stock_transfers t LEFT JOIN pharmacy_stock_transactions l ON l.transfer_id=t.id GROUP BY t.id,t.status
  ) SELECT COUNT(*) AS violations FROM x WHERE (status='in_transit' AND (outs<>1 OR ins<>0 OR return_count<>0)) OR (status='received' AND (outs<>1 OR ins<>1 OR return_count<>0)) OR (status='cancelled' AND (outs<>1 OR ins<>0 OR return_count<>1))`);
  await add("transfer_hospital_isolation","SELECT count(*) AS violations FROM pharmacy_stock_transfers t LEFT JOIN pharmacy_stock s ON s.id=t.source_stock_id WHERE s.id IS NULL OR s.hospital_id<>t.hospital_id");
  return res.json({ok:checks.every(x=>x.violations===0),checks,total_violations:checks.reduce((a,x)=>a+x.violations,0)});
}