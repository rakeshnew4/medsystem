import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.clinical.view");
  if(!ctx)return;
  const from=String(req.query?.from||"").trim();
  const to=String(req.query?.to||"").trim();
  const medicine=String(req.query?.medicine||"").trim();
  const r=await db.query(
    `SELECT t.id,t.created_at,t.transaction_type,t.quantity,t.performed_by,t.notes,
            s.medicine_name,s.batch_no,s.expiry_date,s.unit
     FROM pharmacy_stock_transactions t
     JOIN pharmacy_stock s ON s.id=t.stock_id AND s.hospital_id=t.hospital_id
     WHERE t.hospital_id=$1
       AND ($2='' OR t.created_at::date>=$2::date)
       AND ($3='' OR t.created_at::date<=$3::date)
       AND ($4='' OR lower(s.medicine_name) LIKE lower('%'||$4||'%'))
     ORDER BY t.created_at DESC,t.id DESC
     LIMIT 2000`,
    [ctx.hospitalId,from,to,medicine]
  );
  return res.json({from:from||null,to:to||null,medicine:medicine||null,total:r.rows.length,transactions:r.rows});
}