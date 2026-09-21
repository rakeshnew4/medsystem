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
    if(!b.patient_name||!String(b.patient_name).trim()||!b.doctor_id||!b.appointment_date||!b.appointment_time) return res.status(400).json({error:"Patient name, doctor, date and time are required"});

    // Reception should be able to book in one flow. Find the patient by phone first,
    // then exact name; create the patient automatically when they are new.
    let patient=null;
    if(b.patient_phone){
      const byPhone=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND phone=$2 ORDER BY id LIMIT 1",[hid,String(b.patient_phone).trim()]);
      patient=byPhone.rows[0]||null;
    }
    if(!patient){
      const byName=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND lower(trim(name))=lower(trim($2)) ORDER BY id LIMIT 1",[hid,String(b.patient_name).trim()]);
      patient=byName.rows[0]||null;
    }
    if(!patient){
      const created=await db.query("INSERT INTO patients(hospital_id,name,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone",[hid,String(b.patient_name).trim(),b.patient_phone||null,b.patient_email||null,"Created from appointment booking"]);
      patient=created.rows[0];
    }

    const r=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,appointment_date,appointment_time,status,patient_id",[hid,patient.id,b.doctor_id,b.appointment_date,b.appointment_time,b.status||"pending",b.source||"reception",b.reason||null]);
    return res.json({...r.rows[0],patient});
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    const r=await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING id,status",[b.status,b.id,hid]);
    return res.json(r.rows[0]||{error:"Appointment not found"});
  }
  const r=await db.query("SELECT a.id,a.appointment_date,a.appointment_time,a.status,p.name AS patient_name,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 200",[hid]);
  res.json(r.rows);
}