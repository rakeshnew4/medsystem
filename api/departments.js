import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,"page.staff"); if(!ctx)return;
 const r=await db.query("SELECT id,name,description FROM departments WHERE hospital_id=$1 ORDER BY name",[ctx.hospitalId]);
 return res.json(r.rows);
}