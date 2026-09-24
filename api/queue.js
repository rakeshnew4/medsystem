import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent, findOpenEncounter } from "../lib/workflow.js";
import { allocateOpdToken, hospitalLocalDate } from "../lib/opd.js";
import { notifyStage } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["GET","POST","PUT"];

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

    const encounter=await findOpenEncounter(ctx,b.patient_id,{appointmentId:b.appointment_id||null,encounterType:"opd"});
    if(encounter){
      await db.query("UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),current_stage=$2,priority=$3,updated_at=now() WHERE id=$4",[b.doctor_id||null,stage,b.priority||"normal",encounter.id]);
    }else{
      const er=await db.query(
        "INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,appointment_id,doctor_id,status,reason,current_stage,priority) VALUES($1,$2,'opd',$3,$4,'open',$5,$6,$7) RETURNING id",
        [hid,b.patient_id,b.appointment_id||null,b.doctor_id||null,b.reason||null,stage,b.priority||"normal"]
      );
      await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:er.rows[0].id,eventType:"opd_registered",stage:"waiting",entityType:"queue",entityId:r.rows[0].id,metadata:{token:token.token,token_date:token.tokenDate}});
    }
    await logWorkflowEvent(ctx,{patientId:b.patient_id,eventType:"queue_created",stage,entityType:"queue",entityId:r.rows[0].id,metadata:{token:token.token,token_date:token.tokenDate,priority:b.priority||"normal"}});
    await notifyStage({hospitalId:hid,stage,title:"Patient added to queue",body:"Token "+(token.token||"—")+" is ready for "+(stage==="waiting"?"nurse vitals":"the next workflow step")+".",entityType:"queue",entityId:r.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id,doctorId:b.doctor_id||null});
    return res.json({...r.rows[0],token});
  }

  if(req.method==="PUT"){
    const b=req.body||{};
    const before=await db.query("SELECT stage,patient_id,doctor_id,token FROM queue_entries WHERE id=$1 AND hospital_id=$2",[b.id,hid]);
    const previous=before.rows[0]||null;
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
    if(encounter)await db.query("UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),current_stage=$2,priority=$3,updated_at=now() WHERE id=$4",[q.doctor_id,q.stage,q.priority||"normal",encounter.id]);
    await logWorkflowEvent(ctx,{patientId:q.patient_id,encounterId:encounter?.id||null,eventType:q.stage==="completed"?"queue_completed":"queue_stage_changed",stage:q.stage,entityType:"queue",entityId:q.id,metadata:{token:q.token,token_date:q.token_date,priority:q.priority||"normal"}});
    if(previous && previous.stage!==q.stage){
      const labels={waiting:"Nurse vitals",vitals:"Doctor consultation",doctor:"Doctor waiting",in_room:"Doctor consultation",lab:"Lab work",followup:"Follow-up desk",pharmacy:"Pharmacy dispensing",completed:"Visit completed"};
      await notifyStage({hospitalId:hid,stage:q.stage,title:"Patient moved to "+(labels[q.stage]||q.stage),body:"Token "+(q.token||"—")+" is ready for "+(labels[q.stage]||q.stage)+".",entityType:"queue",entityId:q.id,patientId:q.patient_id,excludeStaffId:ctx.staff.id,doctorId:q.doctor_id});
    }
    return res.json(q);
  }

  const localDate=await hospitalLocalDate(hid);
  const r=await db.query(
    "SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.token_date,q.token_number,q.public_token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.uhid,p.phone,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL AND q.token_date=$2 ORDER BY q.token_number NULLS LAST,q.checked_in_at",
    [hid,localDate]
  );
  res.json(r.rows);
}