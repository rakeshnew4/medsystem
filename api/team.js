import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.staff":"action.staff.manage");
  if(!ctx)return;
  if(req.method==="POST"){
    const b=req.body||{};
    const email=String(b.email||'').trim().toLowerCase();
    if(!email)return res.status(400).json({error:"Email is required"});
    if(email==="rakeshkolipaka4@gmail.com")return res.status(400).json({error:"Primary administrator is already registered"});
    const r=await db.query("INSERT INTO staff_profiles(hospital_id,email,display_name,role,doctor_id,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(hospital_id,email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,doctor_id=EXCLUDED.doctor_id,active=EXCLUDED.active,updated_at=now() RETURNING id,email,display_name,role,doctor_id,active,user_id",[ctx.hospitalId,email,b.display_name||email,b.role||"pending",b.doctor_id||null,b.active===true]);
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE staff_profiles SET role=$1,doctor_id=$2,active=$3,display_name=COALESCE($4,display_name),updated_at=now() WHERE id=$5 AND hospital_id=$6 RETURNING id,email,display_name,role,doctor_id,active,user_id",[b.role,b.doctor_id||null,b.active!==false,b.display_name||null,b.id,ctx.hospitalId]);
    return res.json(r.rows[0]||{error:"Staff member not found"});
  }
  const r=await db.query("SELECT s.id,s.email,s.display_name,s.role,s.doctor_id,s.active,s.user_id,d.name AS doctor_name FROM staff_profiles s LEFT JOIN doctors d ON d.id=s.doctor_id WHERE s.hospital_id=$1 ORDER BY s.created_at",[ctx.hospitalId]);
  res.json(r.rows);
}