import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent, findOpenEncounter, getOrCreateEncounter } from "../lib/workflow.js";
import { allocateOpdToken, hospitalLocalDate } from "../lib/opd.js";
import { notifyStage } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["GET","POST","PUT"]; // HMIS queue dispatch integration

const queueDispatchForRole={
  nurse:{from:"waiting",to:"vitals"},
  doctor:{from:"doctor",to:"in_room"},
  lab:{from:"lab",to:"followup"},
  pharmacy:{from:"pharmacy",to:"completed"},
  receptionist:{from:"waiting",to:"vitals"}
};

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.queue":"action.queue.manage");
  if(!ctx)return;
  const hid=ctx.hospitalId;

  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id)return res.status(400).json({error:"Patient is required"});

    const existing=await db.query(
      "SELECT id,token,token_date,token_number,stage FROM queue_entries WHERE hospital_id=$1 AND patient_id=$2 AND completed_at IS NULL ORDER BY checked_in_at DESC,id DESC LIMIT 1",
      [hid,b.patient_id]
    );
    if(existing.rows[0] && !b.force_new_visit){
      return res.status(409).json({error:"Patient already has an active OPD visit",queue:existing.rows[0]});
    }

    const token=await allocateOpdToken(hid);
    const stage=b.stage||"waiting";
    const r=await db.query(
      "INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,token,token_date,token_number,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,patient_id,appointment_id,doctor_id,token,token_date,token_number,public_token,stage,priority,checked_in_at",
      [hid,b.patient_id,b.appointment_id||null,b.doctor_id||null,stage,b.priority||"normal",token.token,token.tokenDate,token.tokenNumber,b.reason||null,b.notes||null]
    );

    const encounter=await getOrCreateEncounter(ctx,b.patient_id,{appointmentId:b.appointment_id||null,encounterType:"opd",doctorId:b.doctor_id||null,reason:b.reason||"OPD visit",stage,priority:b.priority||"normal"});
    await db.query("UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),current_stage=$2,priority=$3,updated_at=now() WHERE id=$4",[b.doctor_id||null,stage,b.priority||"normal",encounter.id]);
    await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:encounter.id,eventType:"opd_registered",stage:"waiting",entityType:"queue",entityId:r.rows[0].id,metadata:{token:token.token,token_date:token.tokenDate}});
    await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:encounter.id,eventType:"queue_created",stage,entityType:"queue",entityId:r.rows[0].id,metadata:{token:token.token,token_date:token.tokenDate,priority:b.priority||"normal"}});
    await notifyStage({hospitalId:hid,stage,title:"Patient added to queue",body:"Token "+(token.token||"—")+" is ready for "+(stage==="waiting"?"nurse vitals":"the next workflow step")+".",entityType:"queue",entityId:r.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id,doctorId:b.doctor_id||null});
    return res.json({...r.rows[0],encounter_id:encounter.id,encounter,token});
  }

  if(req.method==="PUT"){
    const b=req.body||{};

    // Atomic HMIS-style dispatch: select and claim the next eligible queue row in one UPDATE.
    // FOR UPDATE SKIP LOCKED prevents two staff members from calling the same patient concurrently.
    if(b.action==="call_next"){
      const role=String(ctx.staff.role||"");
      const dispatch=queueDispatchForRole[role];
      if(!dispatch)return res.status(400).json({error:"Your role does not have a queue dispatch step"});
      const localDate=await hospitalLocalDate(hid);
      const params=[hid,localDate,dispatch.from];
      let doctorClause="";
      if(role==="doctor"){
        if(!ctx.staff.doctor_id)return res.status(409).json({error:"Your staff profile is not linked to a doctor"});
        params.push(ctx.staff.doctor_id);
        doctorClause=" AND q.doctor_id=$4";
      }
      const claim=await db.query(
        "WITH candidate AS (SELECT q.id FROM queue_entries q WHERE q.hospital_id=$1 AND q.token_date=$2 AND q.completed_at IS NULL AND q.stage=$3"+doctorClause+" ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.token_number NULLS LAST,q.checked_in_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE queue_entries q SET stage=$5,started_at=CASE WHEN $5 IN ('doctor','in_room','vitals','lab','followup') AND q.started_at IS NULL THEN now() ELSE q.started_at END,completed_at=CASE WHEN $5='completed' THEN now() ELSE q.completed_at END,updated_at=now() FROM candidate c WHERE q.id=c.id RETURNING q.id,q.patient_id,q.appointment_id,q.stage,q.priority,q.doctor_id,q.token,q.token_date,q.token_number,q.public_token",
        [...params,dispatch.to]
      );
      if(!claim.rows[0])return res.status(404).json({error:"No patient is currently waiting for your role"});
      const q=claim.rows[0];
      const encounter=await findOpenEncounter(ctx,q.patient_id,{appointmentId:q.appointment_id||null,encounterType:"opd"});
      if(encounter){
        await db.query("UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),current_stage=$2,priority=$3,status=CASE WHEN $2='completed' THEN 'completed' ELSE status END,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,updated_at=now() WHERE id=$4",[q.doctor_id,q.stage,q.priority||"normal",encounter.id]);
      }
      q.encounter_id=encounter?.id||null;
      await logWorkflowEvent(ctx,{patientId:q.patient_id,encounterId:encounter?.id||null,eventType:q.stage==="completed"?"queue_completed":"queue_stage_changed",stage:q.stage,entityType:"queue",entityId:q.id,metadata:{token:q.token,token_date:q.token_date,priority:q.priority||"normal",dispatch_role:role,dispatch:"call_next"}});
      const labels={waiting:"Waiting",vitals:"Vitals",doctor:"Doctor waiting",in_room:"Doctor consultation",lab:"Lab work",followup:"Follow-up desk",pharmacy:"Pharmacy dispensing",completed:"Visit completed"};
      await notifyStage({hospitalId:hid,stage:q.stage,title:"Patient moved to "+(labels[q.stage]||q.stage),body:"Token "+(q.token||"—")+" is ready for "+(labels[q.stage]||q.stage)+".",entityType:"queue",entityId:q.id,patientId:q.patient_id,excludeStaffId:ctx.staff.id,doctorId:q.doctor_id});
      return res.json({...q,dispatch_role:role,dispatch_from:dispatch.from,dispatch_to:dispatch.to});
    }

    const before=await db.query("SELECT stage,patient_id,doctor_id,token FROM queue_entries WHERE id=$1 AND hospital_id=$2",[b.id,hid]);
    const previous=before.rows[0]||null;
    if(!previous)return res.json({error:"Queue item not found"});
    if(b.stage==="in_room" && ctx.staff.role!=="admin"){
      if(ctx.staff.role!=="doctor")return res.status(403).json({error:"Only a doctor can start a consultation"});
      if(!ctx.staff.doctor_id || Number(previous.doctor_id)!==Number(ctx.staff.doctor_id))return res.status(403).json({error:"This patient is not assigned to you"});
      if(previous.stage!=="doctor")return res.status(409).json({error:"Patient must be in the doctor waiting queue before entering the room"});
    }
    const r=await db.query(
      "UPDATE queue_entries SET stage=$1,priority=COALESCE($2,priority),doctor_id=COALESCE($3,doctor_id),started_at=CASE WHEN $1 IN ('doctor','in_room','vitals','lab','followup') AND started_at IS NULL THEN now() ELSE started_at END,completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING id,patient_id,appointment_id,stage,priority,doctor_id,token,token_date,token_number",
      [b.stage,b.priority||null,b.doctor_id||null,b.id,hid]
    );
    if(!r.rows[0])return res.json({error:"Queue item not found"});
    const q=r.rows[0];

    if(!q.token_number){
      const token=await allocateOpdToken(hid);
      await db.query("UPDATE queue_entries SET token=$1,token_date=$2,token_number=$3 WHERE id=$4 AND hospital_id=$5",[token.token,token.tokenDate,token.tokenNumber,q.id,hid]);
      q.token=token.token;q.token_date=token.tokenDate;q.token_number=token.tokenNumber;
    }

    const encounter=await findOpenEncounter(ctx,q.patient_id,{appointmentId:q.appointment_id||null,encounterType:"opd"});
    if(encounter){
      await db.query("UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),current_stage=$2,priority=$3,status=CASE WHEN $2='completed' THEN 'completed' ELSE status END,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,updated_at=now() WHERE id=$4",[q.doctor_id,q.stage,q.priority||"normal",encounter.id]);
    }
    q.encounter_id=encounter?.id||null;
    await logWorkflowEvent(ctx,{patientId:q.patient_id,encounterId:encounter?.id||null,eventType:q.stage==="completed"?"queue_completed":"queue_stage_changed",stage:q.stage,entityType:"queue",entityId:q.id,metadata:{token:q.token,token_date:q.token_date,priority:q.priority||"normal"}});
    if(previous && previous.stage!==q.stage){
      const labels={waiting:"Nurse vitals",vitals:"Doctor consultation",doctor:"Doctor waiting",in_room:"Doctor consultation",lab:"Lab work",followup:"Follow-up desk",pharmacy:"Pharmacy dispensing",completed:"Visit completed"};
      await notifyStage({hospitalId:hid,stage:q.stage,title:"Patient moved to "+(labels[q.stage]||q.stage),body:"Token "+(q.token||"—")+" is ready for "+(labels[q.stage]||q.stage)+".",entityType:"queue",entityId:q.id,patientId:q.patient_id,excludeStaffId:ctx.staff.id,doctorId:q.doctor_id});
    }
    return res.json(q);
  }

  const localDate=await hospitalLocalDate(hid);
  const r=await db.query(
    "SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.token_date,q.token_number,q.public_token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.uhid,p.phone,d.name AS doctor_name,ce.id AS encounter_id,ce.current_stage AS encounter_stage,ce.status AS encounter_status FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id LEFT JOIN LATERAL (SELECT ce.* FROM care_encounters ce WHERE ce.hospital_id=q.hospital_id AND ce.patient_id=q.patient_id AND (q.appointment_id IS NULL OR ce.appointment_id=q.appointment_id) ORDER BY CASE WHEN ce.status='open' THEN 0 ELSE 1 END,ce.started_at DESC,ce.id DESC LIMIT 1) ce ON true WHERE q.hospital_id=$1 AND q.completed_at IS NULL AND q.token_date=$2 ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.token_number NULLS LAST,q.checked_in_at",
    [hid,localDate]
  );
  res.json(r.rows);
}