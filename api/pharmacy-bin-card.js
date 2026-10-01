import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.clinical.view"); if(!ctx)return;
  const from=String(req.query?.from||"").trim(), to=String(req.query?.to||"").trim(), medicine=String(req.query?.medicine||"").trim(), batch=String(req.query?.batch||"").trim();
  const stockId=String(req.query?.stock_id||"").trim();
  const r=await db.query(
   `WITH filtered AS (
      SELECT t.id,t.stock_id,t.created_at,t.transaction_type,t.quantity,t.quantity_before,t.quantity_after,t.performed_by,t.notes,
             s.medicine_name,s.batch_no,s.expiry_date,s.unit,s.quantity AS current_quantity,
             LAG(t.quantity_after) OVER(PARTITION BY t.stock_id ORDER BY t.created_at,t.id) AS prior_balance
      FROM pharmacy_stock_transactions t JOIN pharmacy_stock s ON s.id=t.stock_id AND s.hospital_id=t.hospital_id
      WHERE t.hospital_id=$1
        AND ($2='' OR t.created_at::date>=$2::date) AND ($3='' OR t.created_at::date<=$3::date)
        AND ($4='' OR lower(s.medicine_name) LIKE lower('%'||$4||'%'))
        AND ($5 IS NULL OR lower(s.batch_no)=lower($5)) AND ($6 IS NULL OR t.stock_id=$6::bigint)
    )
    SELECT *, CASE WHEN transaction_type IN ('receipt','transfer_in','transfer_return') THEN quantity WHEN transaction_type IN ('dispense','transfer_out') THEN -quantity ELSE 0 END AS signed_quantity,
           COALESCE(quantity_after,0) AS balance_after
    FROM filtered ORDER BY created_at DESC,id DESC LIMIT 2000`,
   [ctx.hospitalId,from,to,medicine,batch||null,stockId||null]
  );
  const summary=await db.query(
   `SELECT s.id AS stock_id,s.medicine_name,s.batch_no,s.expiry_date,s.unit,s.quantity AS current_quantity,s.reorder_level,
           COALESCE(SUM(CASE WHEN t.transaction_type IN ('receipt','transfer_in','transfer_return') THEN t.quantity WHEN t.transaction_type IN ('dispense','transfer_out') THEN -t.quantity ELSE 0 END),0) AS net_movement,
           COUNT(t.id) AS transaction_count
    FROM pharmacy_stock s LEFT JOIN pharmacy_stock_transactions t ON t.stock_id=s.id AND t.hospital_id=s.hospital_id
    WHERE s.hospital_id=$1 AND s.active=true AND ($2='' OR lower(s.medicine_name) LIKE lower('%'||$2||'%')) AND ($3 IS NULL OR lower(s.batch_no)=lower($3)) AND ($4 IS NULL OR s.id=$4::bigint)
    GROUP BY s.id ORDER BY s.medicine_name,s.expiry_date NULLS LAST,s.batch_no`,[ctx.hospitalId,medicine,batch||null,stockId||null]);
  return res.json({from:from||null,to:to||null,medicine:medicine||null,batch:batch||null,stock_id:stockId||null,total:r.rows.length,transactions:r.rows,stock_summary:summary.rows});
}