import { db } from "hatchable";
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

  const doctorFilter=doctorId ? "AND q.doctor_id=$2" : "";
  const apptFilter=doctorId ? "AND a.doctor_id=$2" : "";

  const queue=await db.query(
    "SELECT q.id,q.patient_id,q.appointment_id,q.doctor_id,q.stage,q.priority,q.token,q.reason,q.notes,q.checked_in_at,p.name AS patient_name,p.phone,p.date_of_birth,p.status AS patient_status,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL "+doctorFilter+" AND q.stage IN ('waiting','vitals','doctor','in_room') ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.checked_in_at",
    doctorId?[ctx.hospitalId,doctorId]:[ctx.hospitalId]
  );

  const appointments=await db.query(
    "SELECT a.id,a.patient_id,a.doctor_id,a.appointment_date,a.appointment_time,a.status,a.reason,p.name AS patient_name,p.phone,p.date_of_birth FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.hospital_id=$1 AND a.appointment_date=CURRENT_DATE "+apptFilter+" AND a.status NOT IN ('cancelled','no_show') ORDER BY a.appointment_time",
    doctorId?[ctx.hospitalId,doctorId]:[ctx.hospitalId]
  );

  const stats={
    waiting:queue.rows.filter(x=>x.stage!=="doctor"&&x.stage!=="in_room").length,
    in_room:queue.rows.filter(x=>x.stage==="in_room").length,
    today:appointments.rows.length
  };

  let doctor=null;
  if(doctorId){
    const d=await db.query("SELECT id,name,specialty,phone,consultation_fee FROM doctors WHERE hospital_id=$1 AND id=$2",[ctx.hospitalId,doctorId]);
    doctor=d.rows[0]||null;
  }

  res.json({doctor,queue:queue.rows,appointments:appointments.rows,stats});
}