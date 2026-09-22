import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent, findOpenEncounter } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.clinical.write");
  if(!ctx)return;
  if(req.method==="GET"){
    const pid=req.query?.patient_id;
    const sql=pid
      ? "SELECT l.*,p.name AS patient_name,d.name AS doctor_name FROM lab_orders l JOIN patients p ON p.id=l.patient_id LEFT JOIN doctors d ON d.id=l.doctor_id WHERE l.hospital_id=$1 AND l.patient_id=$2 ORDER BY l.ordered_at DESC LIMIT 100"
      : "SELECT l.*,p.name AS patient_name,d.name AS doctor_name FROM lab_orders l JOIN patients p ON p.id=l.patient_id LEFT JOIN doctors d ON d.id=l.doctor_id WHERE l.hospital_id=$1 ORDER BY l.ordered_at DESC LIMIT 300";
    const r=await db.query(sql,pid?[ctx.hospitalId,pid]:[ctx.hospitalId]); return res.json(r.rows);
  }
  const b=req.body||{};
  if(req.method==="POST"){
    if(!b.patient_id||!b.test_name)return res.status(400).json({error:"Patient and test name are required"});
    let encounterId=b.encounter_id||null;if(!encounterId){const e=await findOpenEncounter(ctx,b.patient_id,{});encounterId=e?.id||null}
    const r=await db.query("INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,queue_entry_id,encounter_id,test_name,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,'ordered',$8) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.queue_entry_id||null,encounterId,b.test_name,b.notes||null]);
    await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:"lab_ordered",stage:"lab",entityType:"lab_order",entityId:r.rows[0].id});
    return res.json(r.rows[0]);
  }
  if(!b.id)return res.status(400).json({error:"Lab order id is required"});
  const cur=await db.query("SELECT * FROM lab_orders WHERE id=$1 AND hospital_id=$2",[b.id,ctx.hospitalId]);if(!cur.rows[0])return res.status(404).json({error:"Lab order not found"});
  const o=cur.rows[0];let status=b.status||o.status;let sets=[];let params=[b.id,ctx.hospitalId];let idx=3;
  if(status==="sample_collected"){sets.push("status=$3","sample_collected_at=COALESCE(sample_collected_at,now())");params.push(status);idx=4}
  else if(status==="processing"){sets.push("status=$3","processing_started_at=COALESCE(processing_started_at,now())");params.push(status);idx=4}
  else if(status==="verified"){sets.push("status=$3","verified_at=COALESCE(verified_at,now())","verified_by=$4","result_summary=$5","completed_at=COALESCE(completed_at,now())");params.push(status,ctx.user.email,b.result_summary||o.result_summary||null);idx=6}
  else if(status==="cancelled"){sets.push("status=$3");params.push(status);idx=4}
  else return res.status(400).json({error:"Invalid lab status transition"});
  const r=await db.query("UPDATE lab_orders SET "+sets.join(",")+" WHERE id=$1 AND hospital_id=$2 RETURNING *",params);
  const e=await findOpenEncounter(ctx,o.patient_id,{});const enc=e?.id||o.encounter_id||null;
  if(status==="verified"){
    await db.query("INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status,channel) VALUES($1,$2,NULL,'lab_result_ready',now(),'pending','staff') ON CONFLICT DO NOTHING",[ctx.hospitalId,o.patient_id]).catch(()=>{});
  }
  await logWorkflowEvent(ctx,{patientId:o.patient_id,encounterId:enc,eventType:"lab_"+status,stage:status==="verified"?"doctor_review":"lab",entityType:"lab_order",entityId:o.id,metadata:{status,result_summary:status==="verified"?b.result_summary||null:undefined}});
  return res.json(r.rows[0]);
}