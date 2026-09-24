import { auth } from "hatchable";
import { db } from "../lib/db.js";
import { requireStaff } from "../lib/authz.js";
export const access="user";
export const methods=["GET","PUT"];
export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE staff_profiles SET display_name=$1,updated_at=now() WHERE id=$2 RETURNING id,email,display_name,role,doctor_id,active",[b.display_name||ctx.staff.display_name,ctx.staff.id]);
    return res.json(r.rows[0]);
  }
  res.json({user:ctx.user,staff:ctx.staff,hospital_id:ctx.hospitalId});
}