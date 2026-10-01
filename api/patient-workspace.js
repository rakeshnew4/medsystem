import { db } from "../lib/db.js";
import { requirePermission, getPermissions } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.patients");
  if(!ctx)return;
  const pid=Number(req.query?.patient_id);
  if(!Number.isInteger(pid)||pid<=0)return res.status(400).json({error:"patient_id is required"});

  const p=await db.query(
    "SELECT p.*, CASE WHEN a.id IS NOT NULL THEN 'ipd' ELSE 'opd' END AS care_type, a.id AS active_admission_id, a.admission_number, a.admission_type, b.ward, b.bed_number, q.id AS active_queue_id, q.token AS today_token, q.token_date, q.token_number, q.stage AS queue_stage, q.doctor_id AS queue_doctor_id, qd.name AS queue_doctor_name FROM patients p LEFT JOIN admissions a ON a.patient_id=p.id AND a.hospital_id=p.hospital_id AND a.discharged_at IS NULL LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN LATERAL (SELECT q.* FROM queue_entries q WHERE q.hospital_id=p.hospital_id AND q.patient_id=p.id AND q.completed_at IS NULL ORDER BY q.checked_in_at DESC,q.id DESC LIMIT 1) q ON true LEFT JOIN doctors qd ON qd.id=q.doctor_id WHERE p.id=$1 AND p.hospital_id=$2",
    [pid,ctx.hospitalId]
  );
  if(!p.rows[0])return res.status(404).json({error:"Patient not found"});
  const patient=p.rows[0];

  const perms=await getPermissions(ctx);
  const canClinical=perms["action.clinical.view"]===true;
  const canBilling=perms["action.billing.manage"]===true;
  const canPharmacy=perms["action.pharmacy.manage"]===true;
  const canTheatre=perms["action.theatre.manage"]===true;
  const [clinical,appointments,billing,followups,ipd,workflow,pharmacy,insurance,discharge,encounters,triage,theatre]=await Promise.all([
    canClinical
      ? Promise.all([
          db.query("SELECT v.*,ce.encounter_type FROM vitals v LEFT JOIN care_encounters ce ON ce.id=v.encounter_id WHERE v.hospital_id=$1 AND v.patient_id=$2 ORDER BY v.recorded_at DESC LIMIT 20",[ctx.hospitalId,pid]),
          db.query("SELECT dv.*,d.name AS doctor_name,ce.encounter_type FROM doctor_visits dv LEFT JOIN doctors d ON d.id=dv.doctor_id LEFT JOIN care_encounters ce ON ce.id=dv.encounter_id WHERE dv.hospital_id=$1 AND dv.patient_id=$2 ORDER BY dv.started_at DESC LIMIT 50",[ctx.hospitalId,pid]),
          db.query("SELECT l.*,d.name AS doctor_name,i.invoice_number,i.total AS invoice_total,i.paid AS invoice_paid,i.status AS invoice_status,ce.encounter_type FROM lab_orders l LEFT JOIN doctors d ON d.id=l.doctor_id LEFT JOIN invoices i ON i.id=l.invoice_id LEFT JOIN care_encounters ce ON ce.id=l.encounter_id WHERE l.hospital_id=$1 AND l.patient_id=$2 ORDER BY l.ordered_at DESC LIMIT 50",[ctx.hospitalId,pid]),
          db.query("SELECT m.*,d.name AS doctor_name,ce.encounter_type FROM medications m LEFT JOIN doctors d ON d.id=m.doctor_id LEFT JOIN care_encounters ce ON ce.id=m.encounter_id WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 50",[ctx.hospitalId,pid]),
          db.query("SELECT r.*,ce.encounter_type FROM clinical_reports r LEFT JOIN care_encounters ce ON ce.id=r.encounter_id WHERE r.hospital_id=$1 AND r.patient_id=$2 ORDER BY r.created_at DESC LIMIT 50",[ctx.hospitalId,pid])
        ]).then(x=>({vitals:x[0].rows,visits:x[1].rows,lab_orders:x[2].rows,medications:x[3].rows,reports:x[4].rows}))
      : Promise.resolve(null),
    db.query("SELECT a.*,d.name AS doctor_name,q.id AS queue_id,q.stage AS queue_stage,q.token AS token,q.token_number FROM appointments a LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN LATERAL (SELECT q.* FROM queue_entries q WHERE q.appointment_id=a.id ORDER BY q.id DESC LIMIT 1) q ON true WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT i.*,GREATEST(0,COALESCE(i.total,0)-COALESCE(i.paid,0)) AS due FROM invoices i WHERE i.hospital_id=$1 AND i.patient_id=$2 ORDER BY i.created_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT f.*,d.name AS doctor_name FROM followups f LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 AND f.patient_id=$2 ORDER BY f.due_date ASC LIMIT 30",[ctx.hospitalId,pid]),
    db.query("SELECT a.*,d.name AS doctor_name,b.ward,b.bed_number FROM admissions a LEFT JOIN doctors d ON d.id=COALESCE(a.discharge_doctor_id,a.admitting_doctor_id) LEFT JOIN beds b ON b.id=a.bed_id WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.admitted_at DESC LIMIT 20",[ctx.hospitalId,pid]),
    db.query("SELECT e.*,COALESCE(s.display_name,u.email) AS actor_name FROM workflow_events e LEFT JOIN staff_profiles s ON s.id=e.actor_staff_id LEFT JOIN users u ON u.id=e.actor_user_id WHERE e.hospital_id=$1 AND e.patient_id=$2 ORDER BY e.created_at DESC LIMIT 40",[ctx.hospitalId,pid]),
    db.query("SELECT m.id AS medication_id,m.patient_id,m.medicine_name,m.dose,m.frequency,m.duration,m.instructions,m.encounter_id,m.prescribed_at,COALESCE(x.quantity,0) AS dispensed_quantity,COALESCE(x.status,'pending') AS dispense_status,x.dispensed_at FROM medications m LEFT JOIN LATERAL (SELECT pd.quantity,pd.status,pd.dispensed_at FROM pharmacy_dispenses pd WHERE pd.hospital_id=m.hospital_id AND pd.medication_id=m.id ORDER BY pd.dispensed_at DESC LIMIT 1) x ON true WHERE m.hospital_id=$1 AND m.patient_id=$2 ORDER BY m.prescribed_at DESC LIMIT 50",[ctx.hospitalId,pid]),
    db.query("SELECT * FROM insurance_claims WHERE hospital_id=$1 AND patient_id=$2 ORDER BY created_at DESC LIMIT 30",[ctx.hospitalId,pid]),
    db.query("SELECT * FROM discharge_checklists d WHERE d.hospital_id=$1 AND d.admission_id=(SELECT id FROM admissions WHERE hospital_id=$1 AND patient_id=$2 AND discharged_at IS NULL ORDER BY admitted_at DESC LIMIT 1)",[ctx.hospitalId,pid]),
    db.query("SELECT ce.*,d.name AS doctor_name,a.appointment_date,a.appointment_time,q.id AS queue_id,q.token,q.token_number,q.stage AS queue_stage,q.priority AS queue_priority FROM care_encounters ce LEFT JOIN doctors d ON d.id=ce.doctor_id LEFT JOIN appointments a ON a.id=ce.appointment_id LEFT JOIN LATERAL (SELECT q.* FROM queue_entries q WHERE q.hospital_id=ce.hospital_id AND q.patient_id=ce.patient_id AND q.completed_at IS NULL ORDER BY q.checked_in_at DESC,q.id DESC LIMIT 1) q ON true WHERE ce.hospital_id=$1 AND ce.patient_id=$2 ORDER BY ce.started_at DESC,ce.id DESC LIMIT 20",[ctx.hospitalId,pid]),
    canClinical ? db.query("SELECT t.*,COALESCE(s.display_name,t.assessed_by) AS assessor_name FROM triage_assessments t LEFT JOIN staff_profiles s ON lower(s.email)=lower(t.assessed_by) WHERE t.hospital_id=$1 AND t.patient_id=$2 ORDER BY t.assessed_at DESC LIMIT 20",[ctx.hospitalId,pid]) : Promise.resolve({rows:[]}),
    canTheatre ? Promise.all([
      db.query("SELECT t.*,r.name AS theatre_room_name,d.name AS doctor_name FROM theatre_procedures t LEFT JOIN theatre_rooms r ON r.id=t.theatre_room_id LEFT JOIN doctors d ON d.id=t.doctor_id WHERE t.hospital_id=$1 AND t.patient_id=$2 ORDER BY COALESCE(t.scheduled_start,t.created_at) DESC LIMIT 30",[ctx.hospitalId,pid]),
      db.query("SELECT id,name,code,status FROM theatre_rooms WHERE hospital_id=$1 ORDER BY name",[ctx.hospitalId])
    ]).then(x=>({procedures:x[0].rows,rooms:x[1].rows})) : Promise.resolve({procedures:[],rooms:[]})
  ]);

  const permissions={clinical:canClinical,billing:canBilling,pharmacy:canPharmacy,theatre:canTheatre};
  res.json({
    patient,
    clinical:canClinical?clinical:null,
    appointments:appointments.rows,
    billing:canBilling?billing.rows:[],
    followups:followups.rows,
    ipd:{admissions:ipd.rows},
    workflow:{events:workflow.rows},
    pharmacy:canPharmacy?pharmacy.rows:[],
    insurance:canBilling?insurance.rows:[],
    discharge:canClinical?discharge.rows[0]||null:null,
    encounters:encounters.rows,
    triage:canClinical?triage.rows:[],
    theatre:canTheatre?theatre:{procedures:[],rooms:[]},
    role:ctx.staff?.role||null,
    permissions
  });
}