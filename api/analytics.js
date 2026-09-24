import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access = "user";
export const methods = ["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.dashboard");
  if(!ctx)return;

  const hid=ctx.hospitalId;
  const [daily,doctor,noShow,revenue,patients,followups]=await Promise.all([
    db.query(`SELECT appointment_date::date AS day,
      count(*)::int AS appointments,
      count(*) FILTER (WHERE status='completed')::int AS completed,
      count(*) FILTER (WHERE status='no_show')::int AS no_shows
      FROM appointments
      WHERE hospital_id=$1 AND appointment_date >= current_date-59 AND appointment_date <= current_date
      GROUP BY 1 ORDER BY 1`,[hid]),

    db.query(`SELECT d.name,
      count(v.id)::int AS visits,
      round(avg(EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0),1) AS avg_minutes
      FROM doctors d
      LEFT JOIN doctor_visits v
        ON v.doctor_id=d.id
        AND v.visit_status='completed'
        AND v.hospital_id=$1
        AND v.started_at::date >= current_date-59
        AND v.started_at::date <= current_date
      WHERE d.hospital_id=$1
      GROUP BY d.id,d.name ORDER BY visits DESC,d.name`,[hid]),

    db.query(`SELECT
      count(*) FILTER (WHERE status='no_show')::int AS no_shows,
      count(*)::int AS total,
      round(100.0*count(*) FILTER (WHERE status='no_show')/NULLIF(count(*),0),1) AS rate
      FROM appointments
      WHERE hospital_id=$1 AND appointment_date >= current_date-59 AND appointment_date <= current_date`,[hid]),

    db.query(`SELECT
      coalesce(sum(total),0)::numeric AS billed,
      coalesce(sum(paid),0)::numeric AS collected,
      coalesce(sum(total-paid),0)::numeric AS outstanding
      FROM invoices
      WHERE hospital_id=$1 AND created_at::date >= current_date-59 AND created_at::date <= current_date`,[hid]),

    db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE created_at::date >= current_date-29)::int AS new_30d
      FROM patients WHERE hospital_id=$1`,[hid]),

    db.query(`SELECT count(*)::int AS due
      FROM followups WHERE hospital_id=$1 AND status='due' AND due_date <= current_date`,[hid])
  ]);

  return res.json({
    period:{start:new Date(Date.now()-59*86400000).toISOString().slice(0,10),end:new Date().toISOString().slice(0,10)},
    daily:daily.rows,doctor:doctor.rows,no_show:noShow.rows[0],revenue:revenue.rows[0],
    patients:patients.rows[0],followups:followups.rows[0]
  });
}