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
  const conditions=["t.hospital_id=$1"];
  const params=[ctx.hospitalId];
  if(from){conditions.push("t.created_at >= $"+(params.length+1));params.push(from+" 00:00:00");}
  if(to){conditions.push("t.created_at < $"+(params.length+1));params.push(to+" 23:59:59");}
  if(medicine){conditions.push("LOWER(s.medicine_name) LIKE LOWER($"+(params.length+1)+")");params.push("%"+medicine+"%");}
  const r=await db.query(
    "SELECT t.id,t.created_at,t.transaction_type,t.quantity,t.performed_by,t.notes,s.medicine_name,s.batch_no,s.expiry_date,s.unit FROM pharmacy_stock_transactions t JOIN pharmacy_stock s ON s.id=t.stock_id AND s.hospital_id=t.hospital_id WHERE "+conditions.join(" AND ")+" ORDER BY t.created_at DESC,t.id DESC LIMIT 2000",
    params
  );
  return res.json({from:from||null,to:to||null,medicine:medicine||null,total:r.rows.length,transactions:r.rows});
}