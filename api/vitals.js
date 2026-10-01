import { db } from "../lib/db.js"; import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";
export const access="user"; export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.vitals.record"); if(!ctx)return;
 const b=req.body||{};
 if(req.method==="POST"||req.method==="PUT"){
  if(!b.patient_id)return res.status(400).json({error:"Patient is required"});
  if(req.method==="PUT"){
   const r=await db.query("UPDATE vitals SET blood_pressure_systolic=$1,blood_pressure_diastolic=$2,pulse=$3,temperature=$4,weight_kg=$5,height_cm=$6,spo2=$7,respiratory_rate=$8,notes=$9,encounter_id=COALESCE($10::bigint,encounter_id) WHERE id=$11 AND hospital_id=$12 RETURNING *",[b.blood_pressure_systolic||null,b.blood_pressure_diastolic||null,b.pulse||null,b.temperature||null,b.weight_kg||null,b.height_cm||null,b.spo2||null,b.respiratory_rate||null,b.notes||null,b.encounter_id||null,b.id,ctx.hospitalId]); return res.json(r.rows[0]||{error:"Vitals not found"});
  }
  let encounterId=b.encounter_id||null;
  if(!encounterId && b.queue_entry_id){
   const q=await db.query("SELECT appointment_id FROM queue_entries WHERE id=$1 AND hospital_id=$2",[b.queue_entry_id,ctx.hospitalId]);
   if(q.rows[0]){
    const ce=await db.query("SELECT id FROM care_encounters WHERE hospital_id=$1 AND patient_id=$2 AND encounter_type='opd' AND appointment_id IS NOT DISTINCT FROM $3 AND status='open' ORDER BY started_at DESC LIMIT 1",[ctx.hospitalId,b.patient_id,q.rows[0].appointment_id||null]);
    if(ce.rows[0])encounterId=ce.rows[0].id;
    else {const ins=await db.query("INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,appointment_id,status,reason) VALUES($1,$2,'opd',$3,'open','OPD vitals') RETURNING id",[ctx.hospitalId,b.patient_id,q.rows[0].appointment_id||null]);encounterId=ins.rows[0].id;}
   }
  }
  const r=await db.query("INSERT INTO vitals(hospital_id,patient_id,queue_entry_id,encounter_id,recorded_by,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",[ctx.hospitalId,b.patient_id,b.queue_entry_id||null,encounterId,ctx.user.email,b.blood_pressure_systolic||null,b.blood_pressure_diastolic||null,b.pulse||null,b.temperature||null,b.weight_kg||null,b.height_cm||null,b.spo2||null,b.respiratory_rate||null,b.notes||null]);
  if(encounterId)await db.query("UPDATE care_encounters SET current_stage='vitals',updated_at=now() WHERE id=$1",[encounterId]);
  if(b.queue_entry_id){
    await db.query("UPDATE queue_entries SET stage=CASE WHEN stage IN ('waiting','vitals') THEN 'vitals' ELSE stage END,updated_at=now() WHERE id=$1 AND hospital_id=$2 AND patient_id=$3 AND completed_at IS NULL",[Number(b.queue_entry_id),ctx.hospitalId,b.patient_id]);
  }
  await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:"vitals_recorded",stage:"vitals",entityType:"vitals",entityId:r.rows[0].id});
  const q=b.queue_entry_id?await db.query("SELECT doctor_id,token FROM queue_entries WHERE id=$1 AND hospital_id=$2",[b.queue_entry_id,ctx.hospitalId]):{rows:[]};
  await notifyRoles({hospitalId:ctx.hospitalId,roles:["doctor"],doctorId:q.rows[0]?.doctor_id||ctx.staff.doctor_id,title:"Vitals recorded",body:"Vitals are recorded and the patient is ready for consultation."+(q.rows[0]?.token?" Token "+q.rows[0].token+".":""),kind:"workflow",entityType:"patient",entityId:b.patient_id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});
  return res.json(r.rows[0]);
 }
 const r=await db.query("SELECT v.*,p.name AS patient_name,ce.encounter_type FROM vitals v JOIN patients p ON p.id=v.patient_id LEFT JOIN care_encounters ce ON ce.id=v.encounter_id WHERE v.hospital_id=$1 ORDER BY v.recorded_at DESC LIMIT 200",[ctx.hospitalId]); res.json(r.rows);
}