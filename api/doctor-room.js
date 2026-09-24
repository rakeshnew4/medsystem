import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.clinical.view");
  if(!ctx)return;

  const requestedDoctorId=req.query?.doctor_id||null;
  const doctorId=ctx.staff.role==="admin" ? requestedDoctorId : ctx.staff.doctor_id;
  if(ctx.staff.role!=="admin" && !doctorId){
    return res.json({doctor:null,queue:[],appointments:[],stats:{waiting:0,in_room:0,today:0}});
  }

  const params=doctorId?[ctx.hospitalId,doctorId]:[ctx.hospitalId];
  const doctorCondition=doctorId?"AND q.doctor_id=$2":"";
  const apptCondition=doctorId?"AND a.doctor_id=$2":"";

  // One SQL round-trip returns doctor, queue and appointments.
  const r=await db.query(`
    SELECT
      ${doctorId ? "(SELECT row_to_json(d) FROM (SELECT id,name,specialty,phone,consultation_fee FROM doctors WHERE hospital_id=$1 AND id=$2) d)" : "NULL"} AS doctor,
      COALESCE((SELECT json_agg(x ORDER BY CASE x.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,x.checked_in_at) FROM (
        SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.phone,p.date_of_birth,p.status AS patient_status,d.name AS doctor_name
        FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id
        WHERE q.hospital_id=$1 AND q.completed_at IS NULL ${doctorCondition} AND q.stage IN ('waiting','vitals','doctor','in_room')
      ) x),'[]'::json) AS queue,
      COALESCE((SELECT json_agg(x ORDER BY x.appointment_time) FROM (
        SELECT a.id,a.patient_id,a.doctor_id,a.appointment_date,a.appointment_time,a.status,a.reason,p.name AS patient_name,p.phone,p.date_of_birth
        FROM appointments a JOIN patients p ON p.id=a.patient_id
        WHERE a.hospital_id=$1 AND a.appointment_date=CURRENT_DATE ${apptCondition} AND a.status NOT IN ('cancelled','no_show')
      ) x),'[]'::json) AS appointments
  `,params);

  const x=r.rows[0]||{};
  const queue=x.queue||[],appointments=x.appointments||[];
  const stats={
    waiting:queue.filter(x=>x.stage!=="doctor"&&x.stage!=="in_room").length,
    in_room:queue.filter(x=>x.stage==="in_room").length,
    today:appointments.length
  };
  res.json({doctor:x.doctor||null,queue,appointments,stats});
}