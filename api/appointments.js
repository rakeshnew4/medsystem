import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.appointments":"action.appointment.create");
  if(!ctx)return;
  const hid=ctx.hospitalId;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_name||!String(b.patient_name).trim()||!b.doctor_id||!b.appointment_date||!b.appointment_time)return res.status(400).json({error:"Patient name, doctor, date and time are required"});
    let patient=null;
    if(b.patient_phone){const r=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND phone=$2 ORDER BY id LIMIT 1",[hid,String(b.patient_phone).trim()]);patient=r.rows[0]||null}
    if(!patient){const r=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND lower(trim(name))=lower(trim($2)) ORDER BY id LIMIT 1",[hid,String(b.patient_name).trim()]);patient=r.rows[0]||null}
    if(!patient){const r=await db.query("INSERT INTO patients(hospital_id,name,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone",[hid,String(b.patient_name).trim(),b.patient_phone||null,b.patient_email||null,"Created from appointment booking"]);patient=r.rows[0]}
    const r=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,appointment_date,appointment_time,status,patient_id",[hid,patient.id,b.doctor_id,b.appointment_date,b.appointment_time,b.status||"pending",b.source||"reception",b.reason||null]);
    return res.json({...r.rows[0],patient});
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    if(b.action==="move"){
      const q=await db.query("SELECT patient_id,doctor_id FROM appointments WHERE id=$1 AND hospital_id=$2",[b.id,hid]);
      if(!q.rows[0])return res.status(404).json({error:"Appointment not found"});
      const stage=b.stage||"waiting";
      const existing=await db.query("SELECT id FROM queue_entries WHERE hospital_id=$1 AND appointment_id=$2 AND completed_at IS NULL LIMIT 1",[hid,b.id]);
      let qr;
      if(existing.rows[0]) qr=await db.query("UPDATE queue_entries SET stage=$1,doctor_id=$2,updated_at=now(),started_at=CASE WHEN $1 IN ('vitals','doctor','lab','followup') AND started_at IS NULL THEN now() ELSE started_at END WHERE id=$3 RETURNING id,stage",[stage,q.rows[0].doctor_id,existing.rows[0].id]);
      else qr=await db.query("INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,reason) VALUES($1,$2,$3,$4,$5,'normal','Appointment') RETURNING id,stage",[hid,q.rows[0].patient_id,b.id,q.rows[0].doctor_id,stage]);
      await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3",["checked_in",b.id,hid]);
      return res.json({ok:true,queue:qr.rows[0]});
    }
    const allowed=["pending","confirmed","checked_in","completed","no_show","cancelled"];
    if(b.status&&!allowed.includes(b.status))return res.status(400).json({error:"Invalid appointment status"});
    const r=await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING id,status",[b.status,b.id,hid]);
    return res.json(r.rows[0]||{error:"Appointment not found"});
  }
  const r=await db.query("SELECT a.id,a.appointment_date,a.appointment_time,a.status,a.patient_id,a.doctor_id,a.reason,p.name AS patient_name,p.phone,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 300",[hid]);
  res.json(r.rows);
}