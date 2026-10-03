import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { hospitalLocalDate } from "../lib/opd.js";
import { notifyRoles } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["GET","POST","PUT"];

const priorityForAcuity={emergency:"urgent",urgent:"high",priority:"high",routine:"normal"};

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.vitals.record");
  if(!ctx)return;
  const b=req.body||{};

  if(req.method==="POST"||req.method==="PUT"){
    if(!b.patient_id)return res.status(400).json({error:"Patient is required"});
    const acuity=String(b.acuity||"routine");
    if(!priorityForAcuity[acuity])return res.status(400).json({error:"Invalid triage acuity"});

    let queueId=b.queue_entry_id?Number(b.queue_entry_id):null;
    let encounterId=b.encounter_id?Number(b.encounter_id):null;

    if(queueId){
      const q=await db.query("SELECT id,patient_id,encounter_id,doctor_id,token FROM queue_entries WHERE id=$1 AND hospital_id=$2",[queueId,ctx.hospitalId]);
      if(!q.rows[0]||Number(q.rows[0].patient_id)!==Number(b.patient_id))return res.status(400).json({error:"Queue entry does not belong to this patient"});
      encounterId=encounterId||q.rows[0].encounter_id||null;
    }else{
      const localDate=await hospitalLocalDate(ctx.hospitalId);
      const q=await db.query("SELECT id,encounter_id,doctor_id,token FROM queue_entries WHERE hospital_id=$1 AND patient_id=$2 AND token_date=$3 AND completed_at IS NULL ORDER BY checked_in_at DESC,id DESC LIMIT 1",[ctx.hospitalId,b.patient_id,localDate]);
      if(q.rows[0]){queueId=q.rows[0].id;encounterId=encounterId||q.rows[0].encounter_id||null;}
    }

    let r;
    if(req.method==="PUT"){
      r=await db.query("UPDATE triage_assessments SET acuity=$1,chief_complaint=$2,pain_score=$3,consciousness=$4,mobility=$5,pregnancy_status=$6,red_flags=$7,disposition=$8,notes=$9,updated_at=now() WHERE id=$10 AND hospital_id=$11 AND patient_id=$12 RETURNING *",[acuity,b.chief_complaint||null,b.pain_score===""||b.pain_score==null?null:Number(b.pain_score),b.consciousness||null,b.mobility||null,b.pregnancy_status||null,b.red_flags||null,b.disposition||null,b.notes||null,b.id,ctx.hospitalId,b.patient_id]);
      if(!r.rows[0])return res.status(404).json({error:"Triage assessment not found"});
    }else{
      r=await db.query("INSERT INTO triage_assessments(hospital_id,patient_id,queue_entry_id,encounter_id,assessed_by,acuity,chief_complaint,pain_score,consciousness,mobility,pregnancy_status,red_flags,disposition,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",[ctx.hospitalId,b.patient_id,queueId,encounterId,ctx.user.email,acuity,b.chief_complaint||null,b.pain_score===""||b.pain_score==null?null:Number(b.pain_score),b.consciousness||null,b.mobility||null,b.pregnancy_status||null,b.red_flags||null,b.disposition||null,b.notes||null]);
    }

    if(queueId){
      await db.query("UPDATE queue_entries SET priority=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 AND completed_at IS NULL",[priorityForAcuity[acuity],queueId,ctx.hospitalId]);
    }
    if(encounterId){
      await db.query("UPDATE care_encounters SET priority=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3",[priorityForAcuity[acuity],encounterId,ctx.hospitalId]);
    }

    await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:req.method==="PUT"?"triage_updated":"triage_assessed",stage:"vitals",entityType:"triage",entityId:r.rows[0].id,metadata:{acuity,priority:priorityForAcuity[acuity]}});

    if(acuity==="emergency"||acuity==="urgent"){
      await notifyRoles({hospitalId:ctx.hospitalId,roles:["doctor"],title:"Priority triage patient",body:"A nurse marked a patient "+acuity+" during triage. Token "+(r.rows[0].queue_entry_id||"—")+" requires prompt clinical attention.",kind:"workflow",entityType:"triage",entityId:r.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});
    }
    return res.json(r.rows[0]);
  }

  const pid=Number(req.query?.patient_id);
  if(pid){
    const r=await db.query("SELECT t.*,COALESCE(t.assessed_by,'Unknown') AS assessor_name FROM triage_assessments t WHERE t.hospital_id=$1 AND t.patient_id=$2 ORDER BY t.assessed_at DESC LIMIT 50",[ctx.hospitalId,pid]);
    return res.json(r.rows);
  }
  const r=await db.query("SELECT t.*,p.name AS patient_name,p.uhid,q.token,q.stage,q.priority FROM triage_assessments t JOIN patients p ON p.id=t.patient_id LEFT JOIN queue_entries q ON q.id=t.queue_entry_id WHERE t.hospital_id=$1 ORDER BY t.assessed_at DESC LIMIT 200",[ctx.hospitalId]);
  res.json(r.rows);
}