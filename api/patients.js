import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { hospitalLocalDate } from "../lib/opd.js";

export const access="user";
export const methods=["GET","POST","PUT"];

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.patients":"action.patient.create");
 if(!ctx)return;
 const hid=ctx.hospitalId;

 if(req.method==="POST"){
  const b=req.body||{};
  if(!b.name||!String(b.name).trim())return res.status(400).json({error:"Patient name is required"});
  const r=await db.query(
   "INSERT INTO patients(hospital_id,name,phone,email,date_of_birth,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,uhid,phone,email,date_of_birth,notes,status,created_at",
   [hid,String(b.name).trim(),b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active"]
  );
  await logWorkflowEvent(ctx,{patientId:r.rows[0].id,eventType:"patient_registered",stage:"registration",entityType:"patient",entityId:r.rows[0].id,metadata:{source:b.source||"staff"}});
  return res.json(r.rows[0]);
 }

 if(req.method==="PUT"){
  const b=req.body||{};
  const r=await db.query(
   "UPDATE patients SET name=$1,phone=$2,email=$3,date_of_birth=$4,notes=$5,status=$6,updated_at=now() WHERE id=$7 AND hospital_id=$8 RETURNING id,name,uhid,phone,email,date_of_birth,notes,status",
   [b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active",b.id,hid]
  );
  return res.json(r.rows[0]||{error:"Patient not found"});
 }

 const localDate=await hospitalLocalDate(hid);
 const r=await db.query(`SELECT p.id,p.name,p.uhid,p.phone,p.email,p.date_of_birth,p.notes,p.status,p.created_at,
   CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type,
   a.id AS active_admission_id,a.admission_number,a.admission_type,
   b.ward,b.bed_number,
   q.id AS active_queue_id,q.token AS today_token,q.token_date,q.token_number,q.stage AS queue_stage,q.doctor_id AS queue_doctor_id,
   d.name AS queue_doctor_name
   FROM patients p
   LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL
   LEFT JOIN beds b ON b.id=a.bed_id
   LEFT JOIN LATERAL (
     SELECT q.*
     FROM queue_entries q
     WHERE q.hospital_id=p.hospital_id
       AND q.patient_id=p.id
       AND q.completed_at IS NULL
       AND q.token_date=$2
     ORDER BY q.checked_in_at DESC,q.id DESC
     LIMIT 1
   ) q ON true
   LEFT JOIN doctors d ON d.id=q.doctor_id
   WHERE p.hospital_id=$1
   ORDER BY p.created_at DESC LIMIT 300`,[hid,localDate]);
 res.json(r.rows);
}