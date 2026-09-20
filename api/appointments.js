import { db } from "hatchable";
export const access = "user";
import { requirePermission } from "../lib/authz.js";
export const methods = ["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.appointments":"action.appointment.create");
  if(!ctx)return;
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Create a hospital first"});
  const hid=h.rows[0].id;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_id||!b.doctor_id||!b.appointment_date||!b.appointment_time) return res.status(400).json({error:"Patient, doctor, date and time are required"});
    const r=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,appointment_date,appointment_time,status",[hid,b.patient_id,b.doctor_id,b.appointment_date,b.appointment_time,b.status||"pending",b.source||"reception",b.reason||null]);
    return res.json(r.rows[0]);
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING id,status",[b.status,b.id,hid]);
    return res.json(r.rows[0]||{error:"Appointment not found"});
  }
  const r=await db.query("SELECT a.id,a.appointment_date,a.appointment_time,a.status,p.name AS patient_name,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 200",[hid]);
  res.json(r.rows);
}