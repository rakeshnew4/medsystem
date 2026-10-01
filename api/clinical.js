import { db } from "../lib/db.js"; import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent, findOpenEncounter, getOrCreateEncounter } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";
export const access="user"; export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.clinical.write"); if(!ctx)return; const b=req.body||{};
 if(req.method==="POST"||req.method==="PUT"){
  if(b.type==="visit"){
   if(req.method==="PUT"){
   if(!["doctor","admin"].includes(String(ctx.staff.role||"")))return res.status(403).json({error:"Only doctors can document a consultation"});
   const r=await db.query("UPDATE doctor_visits SET clinical_notes=$1,visit_status=$2,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,encounter_id=COALESCE($3::bigint,encounter_id) WHERE id=$4 AND hospital_id=$5 AND (doctor_id=$6 OR $6 IS NULL) RETURNING *",[b.clinical_notes||null,b.visit_status||"open",b.encounter_id||null,b.id,ctx.hospitalId,ctx.staff.doctor_id||null]);
   if(!r.rows[0])return res.json({error:"Visit not found"});
   const visit=r.rows[0];
   if(b.visit_status==="completed" && !String(b.clinical_notes||"").trim())return res.status(400).json({error:"Consultation note is required before completing the visit"});
   if(visit.encounter_id){await db.query("UPDATE care_encounters SET current_stage=$1,status=$2,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,updated_at=now() WHERE id=$3 AND hospital_id=$4",[b.visit_status==="completed"?"completed":"doctor",b.visit_status==="completed"?"completed":"open",visit.encounter_id,ctx.hospitalId]);}
   if(b.visit_status==="completed"){
    if(b.queue_entry_id){
     const q=await db.query("SELECT id,patient_id,doctor_id,stage FROM queue_entries WHERE id=$1 AND hospital_id=$2 AND patient_id=$3",[Number(b.queue_entry_id),ctx.hospitalId,visit.patient_id]);
     if(!q.rows[0])return res.status(404).json({error:"Queue entry not found"});
     if(q.rows[0].stage!=="in_room")return res.status(409).json({error:"Queue entry is not in the doctor consultation room"});
     if(ctx.staff.role!=="admin" && Number(q.rows[0].doctor_id)!==Number(ctx.staff.doctor_id))return res.status(403).json({error:"This patient is not assigned to you"});
     await db.query("UPDATE queue_entries SET stage='completed',completed_at=now(),updated_at=now() WHERE id=$1 AND hospital_id=$2 AND stage='in_room'",[Number(b.queue_entry_id),ctx.hospitalId]);
    }
    if(b.appointment_id)await db.query("UPDATE appointments SET status='completed' WHERE id=$1 AND hospital_id=$2",[Number(b.appointment_id),ctx.hospitalId]);
   }
   await logWorkflowEvent(ctx,{patientId:visit.patient_id,encounterId:visit.encounter_id,eventType:b.visit_status==="completed"?"consultation_completed":"consultation_saved",stage:b.visit_status==="completed"?"completed":"doctor",entityType:"doctor_visit",entityId:visit.id,metadata:{status:b.visit_status||"open"}});
   return res.json(visit)}
   const n=await db.query("SELECT COALESCE(MAX(visit_number),0)+1 AS n FROM doctor_visits WHERE hospital_id=$1 AND patient_id=$2",[ctx.hospitalId,b.patient_id]);
   let encounterId=b.encounter_id||null;
   if(!encounterId){
     const ce=await getOrCreateEncounter(ctx,b.patient_id,{appointmentId:b.appointment_id||null,encounterType:'opd',doctorId:b.doctor_id||ctx.staff.doctor_id||null,reason:b.reason||'OPD consultation',stage:'doctor',priority:b.priority||'normal'});
     encounterId=ce.id;
   }
   if(b.queue_entry_id){
     const q=await db.query("SELECT stage,doctor_id FROM queue_entries WHERE id=$1 AND hospital_id=$2 AND patient_id=$3",[Number(b.queue_entry_id),ctx.hospitalId,b.patient_id]);
     if(!q.rows[0])return res.status(404).json({error:"Queue entry not found"});
     if(q.rows[0].stage!=="in_room")return res.status(409).json({error:"Start the doctor consultation before documenting the visit"});
     if(ctx.staff.role!=="admin" && Number(q.rows[0].doctor_id)!==Number(ctx.staff.doctor_id))return res.status(403).json({error:"This patient is not assigned to you"});
   }
   const r=await db.query("INSERT INTO doctor_visits(hospital_id,patient_id,doctor_id,appointment_id,queue_entry_id,encounter_id,visit_number,clinical_notes,visit_status,started_at,ended_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),CASE WHEN $9='completed' THEN now() ELSE NULL END) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.appointment_id||null,b.queue_entry_id||null,encounterId,n.rows[0].n,b.clinical_notes||null,b.visit_status||"open"]);
   await db.query("UPDATE care_encounters SET current_stage=$1,status=$2,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,updated_at=now() WHERE id=$3 AND hospital_id=$4",[b.visit_status==="completed"?"completed":"doctor",b.visit_status==="completed"?"completed":"open",encounterId,ctx.hospitalId]);
   await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId, eventType:b.visit_status==="completed"?"consultation_completed":"consultation_started",stage:b.visit_status==="completed"?"completed":"doctor",entityType:"doctor_visit",entityId:r.rows[0].id});
   if(b.visit_status==="completed" && b.queue_entry_id){
     await db.query("UPDATE queue_entries SET stage='completed',completed_at=now(),updated_at=now() WHERE id=$1 AND hospital_id=$2 AND stage='in_room'",[Number(b.queue_entry_id),ctx.hospitalId]);
     if(b.appointment_id)await db.query("UPDATE appointments SET status='completed' WHERE id=$1 AND hospital_id=$2",[Number(b.appointment_id),ctx.hospitalId]);
   }
   return res.json(r.rows[0]);
  }
  if(b.type==="medicine"){
   if(req.method==="PUT"){const r=await db.query("UPDATE medications SET medicine_name=$1,dose=$2,frequency=$3,duration=$4,instructions=$5,encounter_id=COALESCE($6::bigint,encounter_id) WHERE id=$7 AND hospital_id=$8 RETURNING *",[b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null,b.encounter_id||null,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Prescription not found"})}
   if(!["doctor","admin"].includes(String(ctx.staff.role||"")))return res.status(403).json({error:"Only doctors can prescribe medicines"});
   if(!b.visit_id)return res.status(400).json({error:"An active consultation visit is required for a prescription"});
   const vr=await db.query("SELECT id,patient_id,doctor_id,visit_status,encounter_id FROM doctor_visits WHERE id=$1 AND hospital_id=$2",[Number(b.visit_id),ctx.hospitalId]);
   if(!vr.rows[0])return res.status(404).json({error:"Consultation visit not found"});
   if(Number(vr.rows[0].patient_id)!==Number(b.patient_id))return res.status(409).json({error:"Prescription patient does not match the consultation"});
   if(vr.rows[0].visit_status!=="open")return res.status(409).json({error:"Prescription requires an open consultation"});
   if(ctx.staff.role!=="admin" && Number(vr.rows[0].doctor_id)!==Number(ctx.staff.doctor_id))return res.status(403).json({error:"This consultation is not assigned to you"});
   const encounterId=vr.rows[0].encounter_id||b.encounter_id||null;
   const r=await db.query("INSERT INTO medications(hospital_id,patient_id,doctor_id,visit_id,encounter_id,medicine_name,dose,frequency,duration,instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id,encounterId,b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null]);
   await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:"medicine_prescribed",stage:"pharmacy",entityType:"medication",entityId:r.rows[0].id,metadata:{medicine_name:b.medicine_name}});
   await notifyRoles({hospitalId:ctx.hospitalId,roles:["pharmacy"],title:"Prescription ready",body:"A new prescription is waiting for dispensing.",kind:"workflow",entityType:"medication",entityId:r.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});return res.json(r.rows[0]);
  }
  if(b.type==="lab"){
   if(!["doctor","admin"].includes(String(ctx.staff.role||"")))return res.status(403).json({error:"Only doctors can order laboratory investigations"});
   if(!b.patient_id||!b.test_name)return res.status(400).json({error:"Patient and test name are required"});
   let encounterId=b.encounter_id||null;
   if(!encounterId){const e=await findOpenEncounter(ctx,b.patient_id,{});encounterId=e?.id||null}
   if(!encounterId)return res.status(409).json({error:"An active care encounter is required for a laboratory order"});
   if(b.visit_id){
    const vr=await db.query("SELECT id,patient_id,doctor_id,visit_status,encounter_id FROM doctor_visits WHERE id=$1 AND hospital_id=$2",[Number(b.visit_id),ctx.hospitalId]);
    if(!vr.rows[0])return res.status(404).json({error:"Consultation visit not found"});
    if(Number(vr.rows[0].patient_id)!==Number(b.patient_id))return res.status(409).json({error:"Lab order patient does not match the consultation"});
    if(vr.rows[0].visit_status!=="open")return res.status(409).json({error:"Lab order requires an open consultation"});
    if(ctx.staff.role!=="admin" && Number(vr.rows[0].doctor_id)!==Number(ctx.staff.doctor_id))return res.status(403).json({error:"This consultation is not assigned to you"});
    encounterId=vr.rows[0].encounter_id||encounterId;
   }
   const r=await db.query("INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,queue_entry_id,encounter_id,test_name,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,'ordered',$8) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.queue_entry_id||null,encounterId,b.test_name,b.notes||null]);
   await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:"lab_ordered",stage:"lab",entityType:"lab_order",entityId:r.rows[0].id,metadata:{test_name:b.test_name}});
   await notifyRoles({hospitalId:ctx.hospitalId,roles:["lab"],title:"New lab order",body:"A new investigation is waiting for processing.",kind:"workflow",entityType:"lab_order",entityId:r.rows[0].id,patientId:b.patient_id,excludeStaffId:ctx.staff.id});
   return res.json(r.rows[0])
  }
  if(b.type==="report"){let encounterId=b.encounter_id||null;if(!encounterId){const e=await findOpenEncounter(ctx,b.patient_id,{});encounterId=e?.id||null}const r=await db.query("INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,lab_order_id,encounter_id,report_type,title,report_date,file_url,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[ctx.hospitalId,b.patient_id,b.visit_id||null,b.lab_order_id||null,encounterId,b.report_type||"report",b.title,b.report_date||null,b.file_url||null,b.summary||null]);await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId,eventType:"lab_report_ready",stage:"lab",entityType:"clinical_report",entityId:r.rows[0].id});return res.json(r.rows[0])}
  return res.status(400).json({error:"Unknown clinical record type"});
 }
 const pid=req.query?.patient_id;if(!pid)return res.status(400).json({error:"patient_id is required"});
 const [v,vis,l,m,r]=await Promise.all([
  db.query("SELECT v.*,ce.encounter_type FROM vitals v LEFT JOIN care_encounters ce ON ce.id=v.encounter_id WHERE v.hospital_id=$1 AND v.patient_id=$2 ORDER BY v.recorded_at DESC LIMIT 20",[ctx.hospitalId,pid]),
  db.query("SELECT dv.*,d.name AS doctor_name,ce.encounter_type FROM doctor_visits dv LEFT JOIN doctors d ON d.id=dv.doctor_id LEFT JOIN care_encounters ce ON ce.id=dv.encounter_id WHERE dv.hospital_id=$1 AND dv.patient_id=$2 ORDER BY dv.started_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT l.*,ce.encounter_type FROM lab_orders l LEFT JOIN care_encounters ce ON ce.id=l.encounter_id WHERE l.hospital_id=$1 AND l.patient_id=$2 ORDER BY l.ordered_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT m.*,d.name AS doctor_name,ce.encounter_type FROM medications m LEFT JOIN doctors d ON d.id=m.doctor_id LEFT JOIN care_encounters ce ON ce.id=m.encounter_id WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT r.*,ce.encounter_type FROM clinical_reports r LEFT JOIN care_encounters ce ON ce.id=r.encounter_id WHERE r.hospital_id=$1 AND r.patient_id=$2 ORDER BY r.created_at DESC LIMIT 50",[ctx.hospitalId,pid])
 ]); res.json({vitals:v.rows,visits:vis.rows,lab_orders:l.rows,medications:m.rows,reports:r.rows});
}