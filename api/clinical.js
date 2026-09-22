import { db } from "hatchable"; import { requirePermission } from "../lib/authz.js";
export const access="user"; export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.clinical.write"); if(!ctx)return; const b=req.body||{};
 if(req.method==="POST"||req.method==="PUT"){
  if(b.type==="visit"){
   if(req.method==="PUT"){const r=await db.query("UPDATE doctor_visits SET clinical_notes=$1,visit_status=$2,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END,encounter_id=COALESCE($3::bigint,encounter_id) WHERE id=$4 AND hospital_id=$5 RETURNING *",[b.clinical_notes||null,b.visit_status||"open",b.encounter_id||null,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Visit not found"})}
   const n=await db.query("SELECT COALESCE(MAX(visit_number),0)+1 AS n FROM doctor_visits WHERE hospital_id=$1 AND patient_id=$2",[ctx.hospitalId,b.patient_id]);
   let encounterId=b.encounter_id||null;
   if(!encounterId){
     const existing=await db.query("SELECT id FROM care_encounters WHERE hospital_id=$1 AND patient_id=$2 AND encounter_type='opd' AND appointment_id IS NOT DISTINCT FROM $3 AND status='open' ORDER BY started_at DESC LIMIT 1",[ctx.hospitalId,b.patient_id,b.appointment_id||null]);
     if(existing.rows[0])encounterId=existing.rows[0].id;
     else {
       const ce=await db.query("INSERT INTO care_encounters(hospital_id,patient_id,encounter_type,appointment_id,doctor_id,status,reason) VALUES($1,$2,'opd',$3,$4,'open',$5) RETURNING id",[ctx.hospitalId,b.patient_id,b.appointment_id||null,b.doctor_id||ctx.staff.doctor_id||null,b.reason||"OPD consultation"]);
       encounterId=ce.rows[0].id;
     }
   }
   const r=await db.query("INSERT INTO doctor_visits(hospital_id,patient_id,doctor_id,appointment_id,queue_entry_id,encounter_id,visit_number,clinical_notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.appointment_id||null,b.queue_entry_id||null,encounterId,n.rows[0].n,b.clinical_notes||null]);return res.json(r.rows[0]);
  }
  if(b.type==="medicine"){
   if(req.method==="PUT"){const r=await db.query("UPDATE medications SET medicine_name=$1,dose=$2,frequency=$3,duration=$4,instructions=$5,encounter_id=COALESCE($6::bigint,encounter_id) WHERE id=$7 AND hospital_id=$8 RETURNING *",[b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null,b.encounter_id||null,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Prescription not found"})}
   const r=await db.query("INSERT INTO medications(hospital_id,patient_id,doctor_id,visit_id,encounter_id,medicine_name,dose,frequency,duration,instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.encounter_id||null,b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null]);return res.json(r.rows[0]);
  }
  if(b.type==="lab"){const r=await db.query("INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,queue_entry_id,encounter_id,test_name,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.queue_entry_id||null,b.encounter_id||null,b.test_name,b.status||"ordered",b.notes||null]);return res.json(r.rows[0])}
  if(b.type==="report"){const r=await db.query("INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,lab_order_id,encounter_id,report_type,title,report_date,file_url,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",[ctx.hospitalId,b.patient_id,b.visit_id||null,b.lab_order_id||null,b.encounter_id||null,b.report_type||"report",b.title,b.report_date||null,b.file_url||null,b.summary||null]);return res.json(r.rows[0])}
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