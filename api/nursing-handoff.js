import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.vitals.record");
  if(!ctx)return;
  if(!["nurse","admin"].includes(String(ctx.staff.role||"")))return res.status(403).json({error:"Only nursing staff can complete the nursing handoff"});

  const b=req.body||{},patientId=Number(b.patient_id),queueId=Number(b.queue_entry_id);
  if(!patientId||!queueId)return res.status(400).json({error:"Patient and queue entry are required"});

  const q=await db.query("SELECT q.*,ce.id AS encounter_id FROM queue_entries q LEFT JOIN care_encounters ce ON ce.id=q.encounter_id WHERE q.id=$1 AND q.hospital_id=$2 AND q.patient_id=$3 AND q.completed_at IS NULL",[queueId,ctx.hospitalId,patientId]);
  if(!q.rows[0])return res.status(404).json({error:"Active queue entry not found"});
  const current=q.rows[0];
  if(!["waiting","vitals"].includes(String(current.stage)))return res.status(409).json({error:"This patient is no longer in the nursing workflow",stage:current.stage});

  const vitals=await db.query("SELECT id FROM vitals WHERE hospital_id=$1 AND patient_id=$2 AND queue_entry_id=$3 ORDER BY recorded_at DESC LIMIT 1",[ctx.hospitalId,patientId,queueId]);
  if(!vitals.rows[0])return res.status(409).json({error:"Record vitals before completing nursing handoff"});
  const triage=await db.query("SELECT id,acuity FROM triage_assessments WHERE hospital_id=$1 AND patient_id=$2 AND queue_entry_id=$3 ORDER BY assessed_at DESC LIMIT 1",[ctx.hospitalId,patientId,queueId]);
  if(!triage.rows[0])return res.status(409).json({error:"Complete triage before sending the patient to the doctor"});

  const next=await db.query("UPDATE queue_entries SET stage='doctor',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND hospital_id=$2 RETURNING id,patient_id,appointment_id,doctor_id,stage,priority,token,token_date,token_number",[queueId,ctx.hospitalId]);
  const updated=next.rows[0];
  if(current.encounter_id)await db.query("UPDATE care_encounters SET current_stage='doctor',priority=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3",[updated.priority||"normal",current.encounter_id,ctx.hospitalId]);

  await logWorkflowEvent(ctx,{patientId,encounterId:current.encounter_id||null,eventType:"nursing_handoff_completed",stage:"doctor",entityType:"queue",entityId:queueId,metadata:{vitals_id:vitals.rows[0].id,triage_id:triage.rows[0].id,acuity:triage.rows[0].acuity,from_stage:current.stage,to_stage:"doctor"}});
  await notifyRoles({hospitalId:ctx.hospitalId,roles:["doctor"],doctorId:updated.doctor_id||null,title:"Patient ready for doctor",body:"Nursing assessment and triage are complete. Token "+(updated.token||"—")+" is ready for consultation.",kind:"workflow",entityType:"queue",entityId:queueId,patientId,excludeStaffId:ctx.staff.id});
  return res.json({...updated,encounter_id:current.encounter_id||null,vitals_id:vitals.rows[0].id,triage_id:triage.rows[0].id});
}