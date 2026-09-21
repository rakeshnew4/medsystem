import { db } from "hatchable"; import { requirePermission } from "../lib/authz.js";
export const access="user"; export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.clinical.write"); if(!ctx)return; const b=req.body||{};
 if(req.method==="POST"||req.method==="PUT"){
  if(b.type==="visit"){
   if(req.method==="PUT"){const r=await db.query("UPDATE doctor_visits SET clinical_notes=$1,visit_status=$2,ended_at=CASE WHEN $2='completed' THEN COALESCE(ended_at,now()) ELSE ended_at END WHERE id=$3 AND hospital_id=$4 RETURNING *",[b.clinical_notes||null,b.visit_status||"open",b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Visit not found"})}
   const n=await db.query("SELECT COALESCE(MAX(visit_number),0)+1 AS n FROM doctor_visits WHERE hospital_id=$1 AND patient_id=$2",[ctx.hospitalId,b.patient_id]);
   const r=await db.query("INSERT INTO doctor_visits(hospital_id,patient_id,doctor_id,appointment_id,queue_entry_id,visit_number,clinical_notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.appointment_id||null,b.queue_entry_id||null,n.rows[0].n,b.clinical_notes||null]);return res.json(r.rows[0]);
  }
  if(b.type==="medicine"){
   if(req.method==="PUT"){const r=await db.query("UPDATE medications SET medicine_name=$1,dose=$2,frequency=$3,duration=$4,instructions=$5 WHERE id=$6 AND hospital_id=$7 RETURNING *",[b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Prescription not found"})}
   const r=await db.query("INSERT INTO medications(hospital_id,patient_id,doctor_id,visit_id,medicine_name,dose,frequency,duration,instructions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.medicine_name,b.dose||null,b.frequency||null,b.duration||null,b.instructions||null]);return res.json(r.rows[0]);
  }
  if(b.type==="lab"){const r=await db.query("INSERT INTO lab_orders(hospital_id,patient_id,doctor_id,visit_id,queue_entry_id,test_name,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[ctx.hospitalId,b.patient_id,b.doctor_id||ctx.staff.doctor_id||null,b.visit_id||null,b.queue_entry_id||null,b.test_name,b.status||"ordered",b.notes||null]);return res.json(r.rows[0])}
  if(b.type==="report"){const r=await db.query("INSERT INTO clinical_reports(hospital_id,patient_id,visit_id,lab_order_id,report_type,title,report_date,file_url,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[ctx.hospitalId,b.patient_id,b.visit_id||null,b.lab_order_id||null,b.report_type||"report",b.title,b.report_date||null,b.file_url||null,b.summary||null]);return res.json(r.rows[0])}
  return res.status(400).json({error:"Unknown clinical record type"});
 }
 const pid=req.query?.patient_id;if(!pid)return res.status(400).json({error:"patient_id is required"});
 const [v,vis,l,m,r]=await Promise.all([
  db.query("SELECT * FROM vitals WHERE hospital_id=$1 AND patient_id=$2 ORDER BY recorded_at DESC LIMIT 20",[ctx.hospitalId,pid]),
  db.query("SELECT dv.*,d.name AS doctor_name FROM doctor_visits dv LEFT JOIN doctors d ON d.id=dv.doctor_id WHERE dv.hospital_id=$1 AND dv.patient_id=$2 ORDER BY dv.started_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT * FROM lab_orders WHERE hospital_id=$1 AND patient_id=$2 ORDER BY ordered_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT m.*,d.name AS doctor_name FROM medications m LEFT JOIN doctors d ON d.id=m.doctor_id WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 50",[ctx.hospitalId,pid]),
  db.query("SELECT * FROM clinical_reports WHERE hospital_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 50",[ctx.hospitalId,pid])
 ]); res.json({vitals:v.rows,visits:vis.rows,lab_orders:l.rows,medications:m.rows,reports:r.rows});
}