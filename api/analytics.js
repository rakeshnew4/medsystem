import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access = "user";
export const methods = ["GET"];
const iso=d=>d.toISOString().slice(0,10);
export default async function(req,res){
 const ctx=await requirePermission(req,res,"page.dashboard");if(!ctx)return;
 const hid=ctx.hospital_id,end=new Date(),start=new Date();end.setHours(23,59,59,999);start.setDate(start.getDate()-59);start.setHours(0,0,0,0);
 const [daily,doctor,noShow,revenue]=await Promise.all([
  db.query("SELECT appointment_date::date AS day,count(*)::int AS appointments,count(*) FILTER (WHERE status='completed')::int AS completed,count(*) FILTER (WHERE status='no_show')::int AS no_shows FROM appointments WHERE hospital_id=$1 AND appointment_date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1",[hid,iso(start),iso(end)]),
  db.query("SELECT d.name,count(v.id)::int AS visits,round(avg(EXTRACT(EPOCH FROM (v.ended_at-v.started_at))/60.0),1) AS avg_minutes FROM doctors d LEFT JOIN doctor_visits v ON v.doctor_id=d.id AND v.visit_status='completed' AND v.started_at BETWEEN $2 AND $3 WHERE d.hospital_id=$1 GROUP BY d.id,d.name ORDER BY visits DESC",[hid,start,end]),
  db.query("SELECT count(*) FILTER (WHERE status='no_show')::int AS no_shows,count(*)::int AS total,round(100.0*count(*) FILTER (WHERE status='no_show')/NULLIF(count(*),0),1) AS rate FROM appointments WHERE hospital_id=$1 AND appointment_date BETWEEN $2 AND $3",[hid,iso(start),iso(end)]),
  db.query("SELECT coalesce(sum(total),0)::numeric AS billed,coalesce(sum(paid),0)::numeric AS collected,coalesce(sum(total-paid),0)::numeric AS outstanding FROM invoices WHERE hospital_id=$1 AND created_at BETWEEN $2 AND $3",[hid,start,end])
 ]);
 return res.json({period:{start:iso(start),end:iso(end)},daily:daily.rows,doctor:doctor.rows,no_show:noShow.rows[0],revenue:revenue.rows[0]});
}