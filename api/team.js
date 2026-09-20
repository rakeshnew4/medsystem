import { db } from "hatchable";
import { requireStaff } from "../lib/authz.js";
export const access="user";
export const methods=["GET","PUT"];
export default async function(req,res){
  const ctx=await requireStaff(req,res,["admin"]);
  if(!ctx)return;
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE staff_profiles SET role=$1,doctor_id=$2,active=$3,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING id,email,display_name,role,doctor_id,active",[b.role,b.doctor_id||null,b.active!==false,b.id,ctx.hospitalId]);
    return res.json(r.rows[0]||{error:"Staff member not found"});
  }
  const r=await db.query("SELECT s.id,s.email,s.display_name,s.role,s.doctor_id,s.active,d.name AS doctor_name FROM staff_profiles s LEFT JOIN doctors d ON d.id=s.doctor_id WHERE s.hospital_id=$1 ORDER BY s.created_at",[ctx.hospitalId]);
  res.json(r.rows);
}