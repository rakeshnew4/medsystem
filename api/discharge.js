import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.beds.manage");if(!ctx)return;
 if(req.method==="GET"){
  const id=Number(req.query?.admission_id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:"admission_id must be a positive integer"});
  const r=await db.query("SELECT d.*,a.patient_id,a.admission_number,p.name AS patient_name FROM discharge_checklists d JOIN admissions a ON a.id=d.admission_id JOIN patients p ON p.id=a.patient_id WHERE d.hospital_id=$1 AND d.admission_id=$2",[ctx.hospitalId,id]);
  return res.json(r.rows[0]||null);
 }
 const b=req.body||{};const admissionId=Number(b.admission_id);if(!Number.isInteger(admissionId)||admissionId<=0)return res.status(400).json({error:"admission_id must be a positive integer"});
 const a=await db.query("SELECT id,patient_id,status,discharged_at FROM admissions WHERE id=$1 AND hospital_id=$2",[admissionId,ctx.hospitalId]);if(!a.rows[0])return res.status(404).json({error:"Admission not found"});if(a.rows[0].discharged_at)return res.status(409).json({error:"Admission is already discharged"});
 const insuranceStatus=b.insurance_status||"not_applicable";
 const paymentStatus=b.payment_status||"pending";
 if(!["not_applicable","pending","approved","rejected"].includes(insuranceStatus))return res.status(400).json({error:"Invalid insurance status"});
 if(!["pending","paid","approved"].includes(paymentStatus))return res.status(400).json({error:"Invalid payment status"});
 if(req.method==="POST"){
  // Lock the admission as part of the checklist mutation. This prevents a
  // checklist write that started before discharge from committing after the
  // admission has reached its terminal discharged state.
  const r=await db.query(`WITH active_admission AS (
    SELECT id,patient_id
    FROM admissions
    WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL
    FOR UPDATE
  )
  INSERT INTO discharge_checklists(
    hospital_id,admission_id,clinical_clearance,reports_ready,medication_reconciled,
    billing_cleared,insurance_status,payment_status,discharge_medicines,summary
  )
  SELECT $2,$1,$3,$4,$5,$6,$7,$8,$9,$10
  FROM active_admission
  ON CONFLICT(admission_id) DO UPDATE SET
    clinical_clearance=EXCLUDED.clinical_clearance,
    reports_ready=EXCLUDED.reports_ready,
    medication_reconciled=EXCLUDED.medication_reconciled,
    billing_cleared=EXCLUDED.billing_cleared,
    insurance_status=EXCLUDED.insurance_status,
    payment_status=EXCLUDED.payment_status,
    discharge_medicines=EXCLUDED.discharge_medicines,
    summary=EXCLUDED.summary,
    updated_at=now()
  RETURNING *`,[admissionId,ctx.hospitalId,!!b.clinical_clearance,!!b.reports_ready,!!b.medication_reconciled,!!b.billing_cleared,insuranceStatus,paymentStatus,b.discharge_medicines||null,b.summary||null]);
  if(!r.rows[0])return res.status(409).json({error:"Admission is no longer active"});
  await logWorkflowEvent(ctx,{patientId:a.rows[0].patient_id,eventType:"discharge_checklist_updated",stage:"discharge",entityType:"admission",entityId:admissionId});return res.json(r.rows[0]);
 }
 const r=await db.query(`WITH active_admission AS (
   SELECT id
   FROM admissions
   WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL
   FOR UPDATE
 )
 UPDATE discharge_checklists d
 SET clinical_clearance=$3,reports_ready=$4,medication_reconciled=$5,billing_cleared=$6,
     insurance_status=$7,payment_status=$8,discharge_medicines=$9,summary=$10,updated_at=now(),
     cleared_by=CASE WHEN $3 AND $4 AND $5 AND $6 AND ($8='paid' OR ($8='approved' AND $7='approved')) THEN $11 ELSE d.cleared_by END,
     cleared_at=CASE WHEN $3 AND $4 AND $5 AND $6 AND ($8='paid' OR ($8='approved' AND $7='approved')) THEN now() ELSE d.cleared_at END
 FROM active_admission a
 WHERE d.admission_id=a.id AND d.hospital_id=$2
 RETURNING d.*`,[admissionId,ctx.hospitalId,!!b.clinical_clearance,!!b.reports_ready,!!b.medication_reconciled,!!b.billing_cleared,insuranceStatus,paymentStatus,b.discharge_medicines||null,b.summary||null,ctx.user.email]);
 if(!r.rows[0]){
   const active=await db.query("SELECT id FROM admissions WHERE id=$1 AND hospital_id=$2 AND discharged_at IS NULL",[admissionId,ctx.hospitalId]);
   return res.status(active.rows[0]?404:409).json({error:active.rows[0]?"Discharge checklist not found":"Admission is no longer active"});
 }
 return res.json(r.rows[0]);
}