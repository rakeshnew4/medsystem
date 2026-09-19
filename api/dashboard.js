import { db } from "hatchable";
export const access = "admin";
export const methods = ["GET"];

export default async function(req,res){
  const hospital = await db.query("SELECT id, name, phone, address FROM hospitals ORDER BY id LIMIT 1");
  const h = hospital.rows[0];
  if(!h) return res.json({hospital:null,stats:{},appointments:[],followups:[],enquiries:[]});
  const [a,p,f,c] = await Promise.all([
    db.query("SELECT count(*)::int AS n FROM appointments WHERE hospital_id=$1 AND appointment_date=current_date AND status <> 'cancelled'",[h.id]),
    db.query("SELECT count(*)::int AS n FROM patients WHERE hospital_id=$1",[h.id]),
    db.query("SELECT count(*)::int AS n FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due'",[h.id]),
    db.query("SELECT count(*)::int AS n FROM conversations WHERE hospital_id=$1 AND status='open'",[h.id])
  ]);
  const appointments = await db.query(
    "SELECT a.id,a.appointment_time,a.status,a.reason,p.name AS patient_name,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 AND a.appointment_date=current_date ORDER BY a.appointment_time LIMIT 12",[h.id]);
  const followups = await db.query(
    "SELECT f.id,f.due_date,p.name AS patient_name,d.name AS doctor_name FROM followups f JOIN patients p ON p.id=f.patient_id LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 AND f.status='due' ORDER BY f.due_date LIMIT 8",[h.id]);
  const enquiries = await db.query(
    "SELECT c.id,c.channel,c.requires_staff,c.created_at,p.name AS patient_name FROM conversations c LEFT JOIN patients p ON p.id=c.patient_id WHERE c.hospital_id=$1 AND c.status='open' ORDER BY c.created_at DESC LIMIT 8",[h.id]);
  res.json({hospital:h,stats:{appointments_today:a.rows[0].n,patients:p.rows[0].n,followups_due:f.rows[0].n,open_enquiries:c.rows[0].n},appointments:appointments.rows,followups:followups.rows,enquiries:enquiries.rows});
}