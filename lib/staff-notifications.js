import { db } from "./db.js";

const ROLE_BY_STAGE = {
  waiting: ["nurse"],
  vitals: ["doctor"],
  lab: ["lab"],
  followup: ["receptionist"],
  pharmacy: ["pharmacy"],
  completed: ["receptionist", "billing"]
};

export async function notifyRoles({hospitalId,roles=[],title,body,kind="workflow",entityType=null,entityId=null,patientId=null,excludeStaffId=null,doctorId=null}){
  const roleList=[...new Set(roles)].filter(Boolean);
  if(!hospitalId||!roleList.length)return 0;
  const r=await db.query(
    "SELECT id FROM staff_profiles WHERE hospital_id=$1 AND active=true AND (role=ANY($2::text[]) OR ($3::bigint IS NOT NULL AND role='doctor' AND doctor_id=$3))",
    [hospitalId,roleList,doctorId||null]
  );
  const ids=[...new Set(r.rows.filter(x=>!excludeStaffId||Number(x.id)!==Number(excludeStaffId)).map(x=>Number(x.id)))];
  for(const id of ids){
    await db.query(
      "INSERT INTO staff_notifications(hospital_id,staff_id,kind,title,body,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [hospitalId,id,kind,String(title||"Workflow update"),String(body||""),entityType,entityId==null?null:String(entityId)]
    );
  }
  return ids.length;
}

export async function notifyStage({hospitalId,stage,title,body,entityType="queue",entityId=null,patientId=null,excludeStaffId=null,doctorId=null}){
  return notifyRoles({hospitalId,roles:ROLE_BY_STAGE[stage]||[],title,body,kind:"workflow",entityType,entityId,patientId,excludeStaffId,doctorId});
}