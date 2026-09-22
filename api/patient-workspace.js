import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.patients");
  if(!ctx)return;
  const pid=Number(req.query?.patient_id);
  if(!pid)return res.status(400).json({error:"patient_id is required"});

  const [patient,appointments,clinical,followups,ipd,workflow,billing,insurance,queue] = await Promise.all([
    db.query("SELECT p.*,CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type,a.id AS active_admission_id,a.admission_number,b.ward,b.bed_number FROM patients p LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL LEFT JOIN beds b ON b.id=a.bed_id WHERE p.hospital_id=$1 AND p.id=$2",[ctx.hospitalId,pid]),
    db.query("SELECT a.*,d.name AS doctor_name,q.token,q.stage AS queue_stage FROM appointments a LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN LATERAL (SELECT token,stage FROM queue_entries q WHERE q.hospital_id=a.hospital_id AND q.appointment_id=a.id ORDER BY q.id DESC LIMIT 1) q ON true WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT v.*,ce.encounter_type FROM vitals v LEFT JOIN care_encounters ce ON ce.id=v.encounter_id WHERE v.hospital_id=$1 AND v.patient_id=$2 ORDER BY v.recorded_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT f.*,d.name AS doctor_name FROM followups f LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 AND f.patient_id=$2 ORDER BY f.due_date DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT a.*,d.name AS doctor_name,b.ward,b.bed_number,b.bed_type,(SELECT COUNT(*)::int FROM bed_assignments ba WHERE ba.admission_id=a.id) AS transfer_count FROM admissions a LEFT JOIN doctors d ON d.id=a.admitting_doctor_id LEFT JOIN beds b ON b.id=a.bed_id WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.admitted_at DESC",[ctx.hospitalId,pid]),
    db.query("SELECT e.id,e.event_type,e.stage,e.entity_type,e.entity_id,e.metadata,e.created_at,s.display_name AS actor_name,s.role AS actor_role FROM workflow_events e LEFT JOIN staff_profiles s ON s.id=e.actor_staff_id WHERE e.hospital_id=$1 AND e.patient_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT i.*,COALESCE((SELECT json_agg(ii ORDER BY ii.id) FROM invoice_items ii WHERE ii.invoice_id=i.id),'[]'::json) AS items FROM invoices i WHERE i.hospital_id=$1 AND i.patient_id=$2 ORDER BY i.created_at DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT * FROM insurance_claims WHERE hospital_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT q.id,q.token,q.token_date,q.token_number,q.stage,q.priority,q.reason,q.checked_in_at,q.started_at,q.completed_at,d.name AS doctor_name FROM queue_entries q LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.patient_id=$2 ORDER BY q.checked_in_at DESC LIMIT 30",[ctx.hospitalId,pid])
  ]);
  if(!patient.rows[0])return res.status(404).json({error:"Patient not found"});
  res.json({
    patient:patient.rows[0],
    appointments:appointments.rows,
    vitals:clinical.rows,
    followups:followups.rows,
    admissions:ipd.rows,
    events:workflow.rows,
    invoices:billing.rows,
    insurance:insurance.rows,
    queue:queue.rows
  });
}