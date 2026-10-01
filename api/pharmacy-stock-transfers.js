import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.pharmacy.manage"); if(!ctx)return;
  const r=await db.query("SELECT * FROM pharmacy_stock_transfers WHERE hospital_id=$1 ORDER BY requested_at DESC LIMIT 200",[ctx.hospitalId]);
  return res.json(r.rows);
}