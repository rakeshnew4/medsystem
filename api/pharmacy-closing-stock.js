import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,"action.clinical.view"); if(!ctx)return;
 const asOf=String(req.query?.as_of||"").trim() || new Date().toISOString().slice(0,10);
 const medicine=String(req.query?.medicine||"").trim();
 const batch=String(req.query?.batch||"").trim();
 const includeInactive=String(req.query?.include_inactive||"false")==="true";
 const r=await db.query(`WITH latest AS (
   SELECT DISTINCT ON (t.stock_id) t.stock_id,t.quantity_after,t.created_at AS balance_at
   FROM pharmacy_stock_transactions t
   WHERE t.hospital_id=$1 AND t.created_at::date <= $2::date AND t.quantity_after IS NOT NULL
   ORDER BY t.stock_id,t.created_at DESC,t.id DESC
 )
 SELECT s.id AS stock_id,s.medicine_name,s.batch_no,s.expiry_date,s.unit,s.reorder_level,s.active,
        COALESCE(l.quantity_after,s.quantity) AS closing_quantity,l.balance_at,
        CASE WHEN l.stock_id IS NULL THEN 'current_stock_fallback' ELSE 'ledger_snapshot' END AS balance_source,
        CASE WHEN COALESCE(l.quantity_after,s.quantity)<=s.reorder_level THEN true ELSE false END AS below_reorder
 FROM pharmacy_stock s LEFT JOIN latest l ON l.stock_id=s.id
 WHERE s.hospital_id=$1 AND ($3 OR s.active=true)
   AND ($4='' OR lower(s.medicine_name) LIKE lower('%'||$4||'%'))
   AND ($5='' OR lower(s.batch_no)=lower($5))
 ORDER BY s.medicine_name,s.expiry_date NULLS LAST,s.batch_no,s.id`,
 [ctx.hospitalId,asOf,includeInactive,medicine,batch]);
 return res.json({as_of:asOf,medicine:medicine||null,batch:batch||null,include_inactive:includeInactive,total:r.rows.length,stock:r.rows});
}