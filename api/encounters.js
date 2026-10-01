import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { getOrCreateEncounter, logWorkflowEvent } from "../lib/workflow.js";

export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.clinical.write");
  if(!ctx)return;
  const hid=ctx.hospitalId;
  const b=req.body||{};

  if(req.method==="GET"){
    const id=req.query?.id;
    const patientId=req.query?.patient_id;
    if(id){
      const r=await db.query(
        "SELECT ce.*,p.name AS patient_name,p.uhid,d.name AS doctor_name,a.appointment_date,a.appointment_time FROM care_encounters ce JOIN patients p ON p.id=ce.patient_id LEFT JOIN doctors d ON d.id=ce.doctor_id LEFT JOIN appointments a ON a.id=ce.appointment_id WHERE ce.id=$1 AND ce.hospital_id=$2",
        [Number(id),hid]
      );
      if(!r.rows[0])return res.status(404).json({error:"Encounter not found"});
      return res.json(r.rows[0]);
    }
    if(!patientId)return res.status(400).json({error:"patient_id is required"});
    const r=await db.query(
      "SELECT ce.*,p.name AS patient_name,p.uhid,d.name AS doctor_name,a.appointment_date,a.appointment_time FROM care_encounters ce JOIN patients p ON p.id=ce.patient_id LEFT JOIN doctors d ON d.id=ce.doctor_id LEFT JOIN appointments a ON a.id=ce.appointment_id WHERE ce.hospital_id=$1 AND ce.patient_id=$2 ORDER BY ce.started_at DESC,ce.id DESC LIMIT 50",
      [hid,Number(patientId)]
    );
    return res.json(r.rows);
  }

  if(req.method==="POST"){
    if(!b.patient_id)return res.status(400).json({error:"patient_id is required"});
    const type=b.encounter_type||"opd";
    if(!["opd","ipd"].includes(type))return res.status(400).json({error:"Invalid encounter_type"});
    const encounter=await getOrCreateEncounter(ctx,b.patient_id,{
      appointmentId:b.appointment_id||null,
      encounterType:type,
      doctorId:b.doctor_id||null,
      reason:b.reason||null,
      stage:b.current_stage||"registered",
      priority:b.priority||"normal"
    });
    return res.json(encounter);
  }

  if(!b.id)return res.status(400).json({error:"id is required"});
  const current=await db.query("SELECT * FROM care_encounters WHERE id=$1 AND hospital_id=$2",[Number(b.id),hid]);
  if(!current.rows[0])return res.status(404).json({error:"Encounter not found"});
  const old=current.rows[0];

  const status=b.status||old.status;
  const stage=b.current_stage||old.current_stage;
  if(!["open","completed","cancelled"].includes(status))return res.status(400).json({error:"Invalid encounter status"});

  const r=await db.query(
    "UPDATE care_encounters SET doctor_id=COALESCE($1,doctor_id),reason=COALESCE($2,reason),current_stage=$3,priority=COALESCE($4,priority),status=$5,ended_at=CASE WHEN $5 IN ('completed','cancelled') THEN COALESCE(ended_at,now()) ELSE NULL END,updated_at=now() WHERE id=$6 AND hospital_id=$7 RETURNING *",
    [b.doctor_id||null,b.reason||null,stage,b.priority||null,status,Number(b.id),hid]
  );
  const encounter=r.rows[0];
  const eventType=status==="completed"?"encounter_completed":status==="cancelled"?"encounter_cancelled":"encounter_updated";
  await logWorkflowEvent(ctx,{patientId:encounter.patient_id,encounterId:encounter.id,eventType,stage:stage,entityType:"encounter",entityId:encounter.id,metadata:{status,previous_status:old.status}});
  return res.json(encounter);
}