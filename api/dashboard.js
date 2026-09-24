import { db } from "../lib/db.js";
export const access = "user";
import { requirePermission } from "../lib/authz.js";
export const methods = ["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.dashboard");
  if(!ctx)return;
  const q=req.query||{};
  const today=new Date().toISOString().slice(0,10);
  const from=String(q.from||today).slice(0,10);
  const to=String(q.to||from).slice(0,10);

  // One SQL round-trip returns the hospital, stats and all dashboard lists.
  const r=await db.query(`
    SELECT
      json_build_object('id',h.id,'name',h.name,'phone',h.phone,'address',h.address) AS hospital,
      json_build_object(
        'appointments_today',(SELECT count(*)::int FROM appointments WHERE hospital_id=h.id AND appointment_date BETWEEN $1 AND $2 AND status <> 'cancelled'),
        'appointments_current_date',(SELECT count(*)::int FROM appointments WHERE hospital_id=h.id AND appointment_date=$3),
        'patients',(SELECT count(*)::int FROM patients WHERE hospital_id=h.id),
        'followups_due',(SELECT count(*)::int FROM followups WHERE hospital_id=h.id AND due_date<=current_date AND status='due'),
        'open_enquiries',(SELECT count(*)::int FROM conversations WHERE hospital_id=h.id AND status='open')
      ) AS stats,
      COALESCE((SELECT json_agg(x ORDER BY x.appointment_date,x.appointment_time) FROM (
        SELECT a.id,a.patient_id,a.appointment_date,a.appointment_time,a.status,a.reason,p.name AS patient_name,d.name AS doctor_name
        FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id
        WHERE a.hospital_id=h.id AND a.appointment_date BETWEEN $1 AND $2 LIMIT 100
      ) x),'[]'::json) AS appointments,
      COALESCE((SELECT json_agg(x ORDER BY x.appointment_time) FROM (
        SELECT a.id,a.patient_id,a.appointment_date,a.appointment_time,a.status,a.reason,p.name AS patient_name,d.name AS doctor_name
        FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id
        WHERE a.hospital_id=h.id AND a.appointment_date=$3 LIMIT 100
      ) x),'[]'::json) AS "todayAppointments",
      COALESCE((SELECT json_agg(x ORDER BY x.admitted_at DESC) FROM (
        SELECT a.id,a.admission_number,a.admitted_at,a.expected_discharge_date,p.id AS patient_id,p.name AS patient_name,b.ward,b.bed_number,d.name AS doctor_name
        FROM admissions a JOIN patients p ON p.id=a.patient_id LEFT JOIN beds b ON b.id=a.bed_id LEFT JOIN doctors d ON d.id=a.admitting_doctor_id
        WHERE a.hospital_id=h.id AND a.discharged_at IS NULL LIMIT 100
      ) x),'[]'::json) AS "activeIpd",
      COALESCE((SELECT json_agg(x ORDER BY x.due_date) FROM (
        SELECT f.id,f.due_date,p.name AS patient_name,d.name AS doctor_name
        FROM followups f JOIN patients p ON p.id=f.patient_id LEFT JOIN doctors d ON d.id=f.doctor_id
        WHERE f.hospital_id=h.id AND f.status='due' LIMIT 8
      ) x),'[]'::json) AS followups,
      COALESCE((SELECT json_agg(x ORDER BY x.created_at DESC) FROM (
        SELECT c.id,c.channel,c.requires_staff,c.created_at,p.name AS patient_name
        FROM conversations c LEFT JOIN patients p ON p.id=c.patient_id
        WHERE c.hospital_id=h.id AND c.status='open' LIMIT 8
      ) x),'[]'::json) AS enquiries
    FROM hospitals h ORDER BY h.id LIMIT 1
  `,[from,to,today]);

  if(!r.rows[0])return res.json({hospital:null,stats:{},appointments:[],followups:[],enquiries:[]});
  const x=r.rows[0];
  const stats=x.stats||{};
  return res.json({hospital:x.hospital,range:{from,to},today,stats,appointments:x.appointments||[],todayAppointments:x.todayAppointments||[],activeIpd:x.activeIpd||[],followups:x.followups||[],enquiries:x.enquiries||[]});
}