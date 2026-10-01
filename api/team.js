import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logAudit } from "../lib/audit.js";
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
    const before=await db.query("SELECT id,email,display_name,role,doctor_id,department_id,active FROM staff_profiles WHERE hospital_id=$1 AND email=$2",[ctx.hospitalId,email]);
    const r=await db.query("INSERT INTO staff_profiles(hospital_id,email,display_name,role,doctor_id,department_id,active) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(hospital_id,email) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,doctor_id=EXCLUDED.doctor_id,department_id=EXCLUDED.department_id,active=EXCLUDED.active,updated_at=now() RETURNING id,email,display_name,role,doctor_id,department_id,active,user_id",[ctx.hospitalId,email,b.display_name||email,b.role||"pending",b.doctor_id||null,b.department_id||null,b.active===true]);
    const row=r.rows[0];
    await logAudit(ctx,{action:before.rows.length?"staff_updated":"staff_created",entityType:"staff_profile",entityId:row.id,details:{before:before.rows[0]||null,after:row}});
    return res.json(row);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const before=await db.query("SELECT id,email,display_name,role,doctor_id,department_id,active FROM staff_profiles WHERE id=$1 AND hospital_id=$2",[b.id,ctx.hospitalId]);
    const r=await db.query("UPDATE staff_profiles SET role=$1,doctor_id=$2,department_id=$3,active=$4,display_name=COALESCE($5,display_name),updated_at=now() WHERE id=$6 AND hospital_id=$7 RETURNING id,email,display_name,role,doctor_id,department_id,active,user_id",[b.role,b.doctor_id||null,b.department_id||null,b.active!==false,b.display_name||null,b.id,ctx.hospitalId]);
    if(r.rows[0]) await logAudit(ctx,{action:"staff_updated",entityType:"staff_profile",entityId:r.rows[0].id,details:{before:before.rows[0]||null,after:r.rows[0]}});
    return res.json(r.rows[0]||{error:"Staff member not found"});
  }
  const r=await db.query("SELECT s.id,s.email,s.display_name,s.role,s.doctor_id,s.department_id,s.active,s.user_id,d.name AS doctor_name,dep.name AS department_name FROM staff_profiles s LEFT JOIN doctors d ON d.id=s.doctor_id LEFT JOIN departments dep ON dep.id=s.department_id AND dep.hospital_id=s.hospital_id WHERE s.hospital_id=$1 ORDER BY s.created_at",[ctx.hospitalId]);
  res.json(r.rows);
}