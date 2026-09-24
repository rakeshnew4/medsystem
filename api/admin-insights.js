import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.admin_insights");
  if(!ctx)return;
  if(ctx.staff?.role!=="admin") return res.status(403).json({error:"Admin access required"});

  const hid=ctx.hospitalId;
  const today=new Date().toISOString().slice(0,10);
  const defaultStart=new Date(Date.now()-29*86400000).toISOString().slice(0,10);
  const start=/^\\d{4}-\\d{2}-\\d{2}$/.test(String(req.query?.start||""))?String(req.query.start).slice(0,10):defaultStart;
  const end=/^\\d{4}-\\d{2}-\\d{2}$/.test(String(req.query?.end||""))?String(req.query.end).slice(0,10):today;
  const doctorId=req.query?.doctor_id?Number(req.query.doctor_id):null;
  const departmentId=req.query?.department_id?Number(req.query.department_id):null;
  const params=[hid,start,end,doctorId,departmentId];

  const [summary,doctors,departments,queue,patientStatus,daily]=await Promise.all([
    db.query("SELECT count(*)::int AS appointments,count(*) FILTER (WHERE a.status='completed')::int AS completed,count(*) FILTER (WHERE a.status='no_show')::int AS no_shows,count(*) FILTER (WHERE a.status='cancelled')::int AS cancelled,count(DISTINCT a.patient_id)::int AS patients,(SELECT count(*)::int FROM patients pn WHERE pn.hospital_id=$1 AND pn.created_at::date BETWEEN $2 AND $3) AS new_patients,(SELECT count(*)::int FROM patients p2 WHERE p2.hospital_id=$1 AND p2.status='active') AS active_patients,(SELECT count(*)::int FROM patients p2 WHERE p2.hospital_id=$1) AS total_patients,round(avg(EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0),1) AS avg_minutes FROM appointments a JOIN doctors d ON d.id=a.doctor_id AND d.hospital_id=$1 JOIN patients p ON p.id=a.patient_id AND p.hospital_id=$1 LEFT JOIN doctor_visits v ON v.appointment_id=a.id AND v.hospital_id=$1 AND v.visit_status='completed' WHERE a.hospital_id=$1 AND a.appointment_date BETWEEN $2 AND $3 AND ($4::bigint IS NULL OR a.doctor_id=$4) AND ($5::bigint IS NULL OR d.department_id=$5)",params),
    db.query("SELECT d.id,d.name,d.specialty,d.active,dept.name AS department,count(a.id)::int AS appointments,count(a.id) FILTER (WHERE a.status='completed')::int AS completed,count(a.id) FILTER (WHERE a.status='no_show')::int AS no_shows,count(a.id) FILTER (WHERE a.status='cancelled')::int AS cancelled,count(DISTINCT a.patient_id)::int AS patients,round(avg(EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0),1) AS avg_minutes FROM doctors d LEFT JOIN departments dept ON dept.id=d.department_id AND dept.hospital_id=$1 LEFT JOIN appointments a ON a.doctor_id=d.id AND a.hospital_id=$1 AND a.appointment_date BETWEEN $2 AND $3 LEFT JOIN doctor_visits v ON v.appointment_id=a.id AND v.hospital_id=$1 AND v.visit_status='completed' WHERE d.hospital_id=$1 AND ($4::bigint IS NULL OR d.id=$4) AND ($5::bigint IS NULL OR d.department_id=$5) GROUP BY d.id,d.name,d.specialty,d.active,dept.name ORDER BY appointments DESC,d.name",params),
    db.query("SELECT id,name FROM departments WHERE hospital_id=$1 ORDER BY name",[hid]),
    db.query("SELECT count(*) FILTER (WHERE stage NOT IN ('completed','cancelled'))::int AS active_queue,count(*) FILTER (WHERE stage='waiting')::int AS waiting,count(*) FILTER (WHERE stage='vitals')::int AS vitals,count(*) FILTER (WHERE stage='doctor')::int AS doctor_room,count(*) FILTER (WHERE stage='lab')::int AS lab,count(*) FILTER (WHERE stage='pharmacy')::int AS pharmacy,COALESCE(MAX(EXTRACT(EPOCH FROM (now()-checked_in_at))/60.0) FILTER (WHERE stage='waiting'),0)::int AS oldest_waiting_minutes FROM queue_entries WHERE hospital_id=$1 AND checked_in_at::date=current_date",[hid]),
    db.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE status='active')::int AS active,count(*) FILTER (WHERE status='inactive')::int AS inactive FROM patients WHERE hospital_id=$1",[hid]),
    db.query("SELECT a.appointment_date AS day,count(*)::int AS appointments,count(*) FILTER (WHERE a.status='completed')::int AS completed,count(*) FILTER (WHERE a.status='no_show')::int AS no_shows FROM appointments a JOIN doctors d ON d.id=a.doctor_id AND d.hospital_id=$1 WHERE a.hospital_id=$1 AND a.appointment_date BETWEEN $2 AND $3 AND ($4::bigint IS NULL OR a.doctor_id=$4) AND ($5::bigint IS NULL OR d.department_id=$5) GROUP BY a.appointment_date ORDER BY a.appointment_date",params)
  ]);

  const s=summary.rows[0]||{}, total=Number(s.appointments||0), completed=Number(s.completed||0), noShows=Number(s.no_shows||0), cancelled=Number(s.cancelled||0);
  return res.json({
    filters:{start,end,doctor_id:doctorId,department_id:departmentId},
    summary:{appointments:total,completed,pending_or_other:Math.max(total-completed-noShows-cancelled,0),no_shows:noShows,cancelled,
      completion_rate:total?Math.round(completed*1000/total)/10:0,no_show_rate:total?Math.round(noShows*1000/total)/10:0,cancellation_rate:total?Math.round(cancelled*1000/total)/10:0,
      patients:Number(s.patients||0),new_patients:Number(s.new_patients||0),active_patients:Number(s.active_patients||0),total_patients:Number(s.total_patients||0),avg_minutes:s.avg_minutes==null?null:Number(s.avg_minutes)},
    queue:queue.rows[0]||{},patient_status:patientStatus.rows[0]||{},doctors:doctors.rows,departments:departments.rows,daily:daily.rows
  });
}