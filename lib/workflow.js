import { db } from "hatchable";

export async function logWorkflowEvent(ctx, {
  patientId,
  encounterId=null,
  eventType,
  stage=null,
  entityType=null,
  entityId=null,
  metadata={}
}){
  if(!patientId || !eventType) return;
  try{
    await db.query(
      "INSERT INTO workflow_events(hospital_id,patient_id,encounter_id,event_type,stage,actor_user_id,actor_staff_id,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
      [
        ctx.hospitalId, Number(patientId), encounterId||null, eventType, stage||null,
        ctx.user?.id||ctx.user?.email||null, ctx.staff?.id||null,
        entityType||null, entityId==null?null:String(entityId), JSON.stringify(metadata||{})
      ]
    );
  }catch(e){
    console.error("workflow_event_failed",e?.message||e);
  }
}

export async function findOpenEncounter(ctx, patientId, {appointmentId=null, encounterType=null}={}){
  const typeSql=encounterType?" AND encounter_type=$3":"";
  const params=encounterType?[ctx.hospitalId,Number(patientId),encounterType]:[ctx.hospitalId,Number(patientId)];
  const r=await db.query(
    "SELECT id,encounter_type,admission_id,appointment_id,current_stage,priority,status FROM care_encounters WHERE hospital_id=$1 AND patient_id=$2 AND status='open'"+
    (appointmentId!=null?" AND appointment_id IS NOT DISTINCT FROM "+(encounterType?"$4":"$3"):"")+typeSql+
    " ORDER BY started_at DESC LIMIT 1",
    appointmentId!=null
      ? (encounterType?[ctx.hospitalId,Number(patientId),encounterType,Number(appointmentId)]:[ctx.hospitalId,Number(patientId),Number(appointmentId)])
      : params
  );
  return r.rows[0]||null;
}