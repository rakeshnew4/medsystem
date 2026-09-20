import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.vitals.record");
  if(!ctx)return;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id)return res.status(400).json({error:"Patient is required"});
    const r=await db.query("INSERT INTO vitals(hospital_id,patient_id,queue_entry_id,recorded_by,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",[ctx.hospitalId,b.patient_id,b.queue_entry_id||null,ctx.user.email,b.blood_pressure_systolic||null,b.blood_pressure_diastolic||null,b.pulse||null,b.temperature||null,b.weight_kg||null,b.height_cm||null,b.spo2||null,b.respiratory_rate||null,b.notes||null]);
    return res.json(r.rows[0]);
  }
  const r=await db.query("SELECT v.*,p.name AS patient_name FROM vitals v JOIN patients p ON p.id=v.patient_id WHERE v.hospital_id=$1 ORDER BY v.recorded_at DESC LIMIT 200",[ctx.hospitalId]);
  res.json(r.rows);
}