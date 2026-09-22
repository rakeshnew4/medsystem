import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.beds.manage");if(!ctx)return;
 if(req.method==="GET"){
  const id=req.query?.admission_id;if(!id)return res.status(400).json({error:"admission_id is required"});
  const r=await db.query("SELECT d.*,a.patient_id,a.admission_number,p.name AS patient_name FROM discharge_checklists d JOIN admissions a ON a.id=d.admission_id JOIN patients p ON p.id=a.patient_id WHERE d.hospital_id=$1 AND d.admission_id=$2",[ctx.hospitalId,id]);
  return res.json(r.rows[0]||null);
 }
 const b=req.body||{};if(!b.admission_id)return res.status(400).json({error:"admission_id is required"});
 const a=await db.query("SELECT id,patient_id,status,discharged_at FROM admissions WHERE id=$1 AND hospital_id=$2",[b.admission_id,ctx.hospitalId]);if(!a.rows[0])return res.status(404).json({error:"Admission not found"});
 if(req.method==="POST"){
  const r=await db.query("INSERT INTO discharge_checklists(hospital_id,admission_id,clinical_clearance,reports_ready,medication_reconciled,billing_cleared,insurance_status,payment_status,discharge_medicines,summary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(admission_id) DO UPDATE SET clinical_clearance=EXCLUDED.clinical_clearance,reports_ready=EXCLUDED.reports_ready,medication_reconciled=EXCLUDED.medication_reconciled,billing_cleared=EXCLUDED.billing_cleared,insurance_status=EXCLUDED.insurance_status,payment_status=EXCLUDED.payment_status,discharge_medicines=EXCLUDED.discharge_medicines,summary=EXCLUDED.summary,updated_at=now() RETURNING *",[ctx.hospitalId,b.admission_id,!!b.clinical_clearance,!!b.reports_ready,!!b.medication_reconciled,!!b.billing_cleared,b.insurance_status||"not_applicable",b.payment_status||"pending",b.discharge_medicines||null,b.summary||null]);
  await logWorkflowEvent(ctx,{patientId:a.rows[0].patient_id,eventType:"discharge_checklist_updated",stage:"discharge",entityType:"admission",entityId:b.admission_id});return res.json(r.rows[0]);
 }
 const r=await db.query("UPDATE discharge_checklists SET clinical_clearance=$1,reports_ready=$2,medication_reconciled=$3,billing_cleared=$4,insurance_status=$5,payment_status=$6,discharge_medicines=$7,summary=$8,updated_at=now(),cleared_by=CASE WHEN $1 AND $2 AND $3 AND $4 AND $6 IN ('paid','approved') THEN $9 ELSE cleared_by END,cleared_at=CASE WHEN $1 AND $2 AND $3 AND $4 AND $6='paid' THEN now() ELSE cleared_at END WHERE admission_id=$10 AND hospital_id=$11 RETURNING *",[!!b.clinical_clearance,!!b.reports_ready,!!b.medication_reconciled,!!b.billing_cleared,b.insurance_status||"not_applicable",b.payment_status||"pending",b.discharge_medicines||null,b.summary||null,ctx.user.email,b.admission_id,ctx.hospitalId]);
 return res.json(r.rows[0]||{error:"Discharge checklist not found"});
}