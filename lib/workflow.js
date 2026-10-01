import { db } from "./db.js";

export async function logWorkflowEvent(ctx, {
  patientId,
  encounterId=null,
  eventType,
  stage=null,
  entityType=null,
  entityId=null,
  metadata={}
}){
  if(!patientId || !eventType) return {recorded:false,reason:"missing_event_identity"};
  try{
    await db.query(
      "INSERT INTO workflow_events(hospital_id,patient_id,encounter_id,event_type,stage,actor_user_id,actor_staff_id,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)",
      [
        ctx.hospitalId, Number(patientId), encounterId||null, eventType, stage||null,
        ctx.user?.id||ctx.user?.email||null, ctx.staff?.id||null,
        entityType||null, entityId==null?null:String(entityId), JSON.stringify(metadata||{})
      ]
    );
    return {recorded:true};
  }catch(e){
    console.error("workflow_event_failed",e?.message||e);
    return {recorded:false,reason:"persistence_failed"};
  }
}

export async function getOrCreateEncounter(ctx, patientId, {appointmentId=null, encounterType='opd', doctorId=null, reason=null, stage='registered', priority='normal'}={}){
  const existing=await findOpenEncounter(ctx,patientId,{appointmentId,encounterType});
  if(existing)return existing;
  const r=await db.query(
    "INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,appointment_id,doctor_id,status,reason,current_stage,priority) VALUES($1,$2,$3,$4,$5,'open',$6,$7,$8) RETURNING id,encounter_type,admission_id,appointment_id,doctor_id,current_stage,priority,status,started_at,ended_at,created_at,updated_at",
    [ctx.hospitalId,Number(patientId),encounterType,appointmentId||null,doctorId||null,reason||null,stage,priority]
  );
  const encounter=r.rows[0];
  await logWorkflowEvent(ctx,{patientId,encounterId:encounter.id,eventType:'encounter_started',stage,entityType:'encounter',entityId:encounter.id,metadata:{encounter_type:encounterType,appointment_id:appointmentId||null}});
  return encounter;
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