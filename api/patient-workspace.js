import { db } from "hatchable";
import { requirePermission, getPermissions } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.patients");
  if(!ctx)return;
  const pid=Number(req.query?.patient_id);
  if(!pid)return res.status(400).json({error:"patient_id is required"});

  const perms=await getPermissions(ctx);
  const canClinical=!!perms["action.clinical.view"];
  const canBilling=!!perms["page.billing"];
  const canAppointments=!!perms["page.appointments"];
  const canFollowups=!!perms["page.followups"];
  const canPharmacy=!!perms["page.pharmacy"];
  const [patient,appointments,vitals,visits,labOrders,medications,reports,followups,admissions,events,invoices,insurance,queue,pharmacy] = await Promise.all([
    db.query("SELECT p.*,CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type,a.id AS active_admission_id,a.admission_number,b.ward,b.bed_number,q.stage AS queue_stage,q.token AS today_token FROM patients p LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN LATERAL (SELECT stage,token FROM queue_entries q WHERE q.hospital_id=p.hospital_id AND q.patient_id=p.id AND q.completed_at IS NULL ORDER BY q.checked_in_at DESC,q.id DESC LIMIT 1) q ON true WHERE p.hospital_id=$1 AND p.id=$2",[ctx.hospitalId,pid]),
    db.query("SELECT a.*,d.name AS doctor_name,q.token,q.stage AS queue_stage FROM appointments a LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN LATERAL (SELECT token,stage FROM queue_entries q WHERE q.hospital_id=a.hospital_id AND q.appointment_id=a.id ORDER BY q.id DESC LIMIT 1) q ON true WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT v.*,ce.encounter_type FROM vitals v LEFT JOIN care_encounters ce ON ce.id=v.encounter_id WHERE v.hospital_id=$1 AND v.patient_id=$2 ORDER BY v.recorded_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT dv.*,d.name AS doctor_name,ce.encounter_type FROM doctor_visits dv LEFT JOIN doctors d ON d.id=dv.doctor_id LEFT JOIN care_encounters ce ON ce.id=dv.encounter_id WHERE dv.hospital_id=$1 AND dv.patient_id=$2 ORDER BY dv.started_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT l.*,d.name AS doctor_name FROM lab_orders l LEFT JOIN doctors d ON d.id=l.doctor_id WHERE l.hospital_id=$1 AND l.patient_id=$2 ORDER BY l.ordered_at DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT m.*,d.name AS doctor_name FROM medications m LEFT JOIN doctors d ON d.id=m.doctor_id WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT r.*,d.name AS doctor_name FROM clinical_reports r LEFT JOIN doctor_visits dv ON dv.id=r.visit_id LEFT JOIN doctors d ON d.id=dv.doctor_id WHERE r.hospital_id=$1 AND r.patient_id=$2 ORDER BY r.created_at DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT f.*,d.name AS doctor_name FROM followups f LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 AND f.patient_id=$2 ORDER BY f.due_date DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT a.*,d.name AS doctor_name,b.ward,b.bed_number,b.bed_type,(SELECT COUNT(*)::int FROM bed_assignments ba WHERE ba.admission_id=a.id) AS transfer_count FROM admissions a LEFT JOIN doctors d ON d.id=a.admitting_doctor_id LEFT JOIN beds b ON b.id=a.bed_id WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.admitted_at DESC",[ctx.hospitalId,pid]),
    db.query("SELECT e.id,e.event_type,e.stage,e.entity_type,e.entity_id,e.metadata,e.created_at,s.display_name AS actor_name,s.role AS actor_role FROM workflow_events e LEFT JOIN staff_profiles s ON s.id=e.actor_staff_id WHERE e.hospital_id=$1 AND e.patient_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT i.*,COALESCE((SELECT json_agg(ii ORDER BY ii.id) FROM invoice_items ii WHERE ii.invoice_id=i.id),'[]'::json) AS items FROM invoices i WHERE i.hospital_id=$1 AND i.patient_id=$2 ORDER BY i.created_at DESC LIMIT 100",[ctx.hospitalId,pid]),
    db.query("SELECT * FROM insurance_claims WHERE hospital_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT q.id,q.token,q.token_date,q.token_number,q.stage,q.priority,q.reason,q.checked_in_at,q.started_at,q.completed_at,d.name AS doctor_name FROM queue_entries q LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.patient_id=$2 ORDER BY q.checked_in_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT m.id AS medication_id,m.medicine_name,m.dose,m.frequency,m.duration,m.instructions,m.prescribed_at,COALESCE(x.quantity,0) AS dispensed_quantity,COALESCE(x.status,'pending') AS dispense_status,x.dispensed_at FROM medications m LEFT JOIN LATERAL (SELECT pd.quantity,pd.status,pd.dispensed_at FROM pharmacy_dispenses pd WHERE pd.hospital_id=m.hospital_id AND pd.medication_id=m.id ORDER BY pd.dispensed_at DESC LIMIT 1) x ON true WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 100",[ctx.hospitalId,pid])
  ]);
  if(!patient.rows[0])return res.status(404).json({error:"Patient not found"});
  res.json({
    patient:patient.rows[0],
    appointments:canAppointments?appointments.rows:[],
    clinical:canClinical?{vitals:vitals.rows,visits:visits.rows,lab_orders:labOrders.rows,medications:medications.rows,reports:reports.rows}:null,
    followups:canFollowups?followups.rows:[],
    ipd:{admissions:admissions.rows},
    workflow:canClinical?{events:events.rows}:null,
    billing:canBilling?invoices.rows:[],
    insurance:canBilling?insurance.rows:[],
    queue:queue.rows,
    pharmacy:canPharmacy?pharmacy.rows:[],
    permissions:{clinical:canClinical,billing:canBilling,appointments:canAppointments,followups:canFollowups,pharmacy:canPharmacy}
  });
}