import { db } from "../lib/db.js";
import { requireStaff } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  if(ctx.staff.role!=="admin") return res.status(403).json({error:"Only administrators can view staff audit history"});
  const staffId=req.query?.staff_id?Number(req.query.staff_id):null;
  const limit=Math.min(Math.max(Number(req.query?.limit||100),1),500);
  const params=[ctx.hospitalId];
  let where="a.hospital_id=$1 AND a.entity_type='staff_profile'";
  if(staffId){params.push(String(staffId));where+=" AND a.entity_id=$"+params.length;}
  params.push(limit);
  const r=await db.query(
    "SELECT a.id,a.actor,a.action,a.entity_type,a.entity_id,a.details,a.created_at,s.email AS staff_email,s.display_name AS staff_name " +
    "FROM audit_logs a LEFT JOIN staff_profiles s ON s.id=CAST(NULLIF(a.entity_id,'') AS BIGINT) AND s.hospital_id=a.hospital_id " +
    "WHERE "+where+" ORDER BY a.created_at DESC,a.id DESC LIMIT $"+params.length,
    params
  );
  res.json(r.rows.map(x=>({...x,details:typeof x.details==="string"?(()=>{try{return JSON.parse(x.details)}catch{return {raw:x.details}}})():x.details})));
}