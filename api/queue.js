import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent, findOpenEncounter } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.queue":"action.queue.manage");
  if(!ctx)return;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id)return res.status(400).json({error:"Patient is required"});
    const r=await db.query("INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,token,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,token,stage,priority",[ctx.hospitalId,b.patient_id,b.appointment_id||null,b.doctor_id||null,b.stage||"waiting",b.priority||"normal",b.token||null,b.reason||null,b.notes||null]);
    const encounter=await findOpenEncounter(ctx,b.patient_id,{appointmentId:b.appointment_id||null,encounterType:"opd"});
    if(encounter)await db.query("UPDATE care_encounters SET current_stage=$1,priority=$2,updated_at=now() WHERE id=$3",[b.stage||"waiting",b.priority||"normal",encounter.id]);
    await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:encounter?.id||null,eventType:"queue_created",stage:b.stage||"waiting",entityType:"queue",entityId:r.rows[0].id,metadata:{priority:b.priority||"normal"}});
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE queue_entries SET stage=$1,priority=COALESCE($2,priority),doctor_id=COALESCE($3,doctor_id),started_at=CASE WHEN $1 IN ('doctor','vitals','lab','followup') AND started_at IS NULL THEN now() ELSE started_at END,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING id,patient_id,appointment_id,stage,priority,doctor_id",[b.stage,b.priority||null,b.doctor_id||null,b.id,ctx.hospitalId]);
    if(!r.rows[0])return res.json({error:"Queue item not found"});
    const q=r.rows[0];
    const encounter=await findOpenEncounter(ctx,q.patient_id,{appointmentId:q.appointment_id||null,encounterType:"opd"});
    if(encounter)await db.query("UPDATE care_encounters SET current_stage=$1,priority=$2,updated_at=now() WHERE id=$3",[q.stage,q.priority||"normal",encounter.id]);
    await logWorkflowEvent(ctx,{patientId:q.patient_id,encounterId:encounter?.id||null,eventType:q.stage==="completed"?"queue_completed":"queue_stage_changed",stage:q.stage,entityType:"queue",entityId:q.id,metadata:{priority:q.priority||"normal"}});
    return res.json(q);
  }
  const r=await db.query("SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.phone,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.checked_in_at",[ctx.hospitalId]);
  res.json(r.rows);
}