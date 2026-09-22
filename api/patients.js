import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.patients":"action.patient.create");
 if(!ctx)return;
 const hid=ctx.hospitalId;
 if(req.method==="POST"){
  const b=req.body||{}; if(!b.name)return res.status(400).json({error:"Patient name is required"});
  const r=await db.query("INSERT INTO patients(hospital_id,name,phone,email,date_of_birth,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,phone,email,date_of_birth,notes,status",[hid,b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active"]);
  await logWorkflowEvent(ctx,{patientId:r.rows[0].id,eventType:"patient_registered",stage:"registration",entityType:"patient",entityId:r.rows[0].id,metadata:{source:"staff"}});
  return res.json(r.rows[0]);
 }
 if(req.method==="PUT"){
  const b=req.body||{};
  const r=await db.query("UPDATE patients SET name=$1,phone=$2,email=$3,date_of_birth=$4,notes=$5,status=$6,updated_at=now() WHERE id=$7 AND hospital_id=$8 RETURNING id,name,phone,email,date_of_birth,notes,status",[b.name,b.phone||null,b.email||null,b.date_of_birth||null,b.notes||null,b.status||"active",b.id,hid]);
  return res.json(r.rows[0]||{error:"Patient not found"});
 }
 const r=await db.query(`SELECT p.id,p.name,p.phone,p.email,p.date_of_birth,p.notes,p.status,p.created_at,
   CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type,
   a.id AS active_admission_id,a.admission_number,a.admission_type,
   b.ward,b.bed_number
   FROM patients p
   LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL
   LEFT JOIN beds b ON b.id=a.bed_id
   WHERE p.hospital_id=$1
   ORDER BY p.created_at DESC LIMIT 300`,[hid]);
 res.json(r.rows);
}