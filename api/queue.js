import { db } from "hatchable";
import { requireStaff } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requireStaff(req,res);
  if(!ctx)return;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id)return res.status(400).json({error:"Patient is required"});
    const r=await db.query("INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,token,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,token,stage,priority",[ctx.hospitalId,b.patient_id,b.appointment_id||null,b.doctor_id||null,b.stage||"waiting",b.priority||"normal",b.token||null,b.reason||null,b.notes||null]);
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE queue_entries SET stage=$1,priority=COALESCE($2,priority),doctor_id=COALESCE($3,doctor_id),started_at=CASE WHEN $1 IN ('doctor','vitals','lab','followup') AND started_at IS NULL THEN now() ELSE started_at END,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING id,stage,priority,doctor_id",[b.stage,b.priority||null,b.doctor_id||null,b.id,ctx.hospitalId]);
    return res.json(r.rows[0]||{error:"Queue item not found"});
  }
  const r=await db.query("SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.phone,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.checked_in_at",[ctx.hospitalId]);
  res.json(r.rows);
}