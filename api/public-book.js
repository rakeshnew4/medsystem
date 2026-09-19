import { db } from "hatchable";
export const access = "public";
export const methods = ["POST"];

export default async function(req,res){
  const b=req.body||{};
  if(!b.name||!b.phone||!b.doctor_id||!b.appointment_date||!b.appointment_time)
    return res.status(400).json({error:"Name, phone, doctor, date and time are required"});
  const h=await db.query("SELECT id FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Hospital is not configured"});
  const hid=h.rows[0].id;
  const doctor=await db.query("SELECT id,name FROM doctors WHERE id=$1 AND hospital_id=$2 AND active=true",[b.doctor_id,hid]);
  if(!doctor.rows[0]) return res.status(400).json({error:"Doctor is not available"});
  const patient=await db.query("SELECT id FROM patients WHERE hospital_id=$1 AND phone=$2 ORDER BY id LIMIT 1",[hid,b.phone]);
  let patientId=patient.rows[0]?.id;
  if(!patientId){
    const p=await db.query("INSERT INTO patients(hospital_id,name,phone,whatsapp_phone,whatsapp_opt_in,email) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[hid,b.name,b.phone,b.phone,Boolean(b.whatsapp_opt_in),b.email||null]);
    patientId=p.rows[0].id;
  } else {
    await db.query("UPDATE patients SET name=$1,email=$2,whatsapp_phone=$3,whatsapp_opt_in=$4,updated_at=now() WHERE id=$5",[b.name,b.email||null,b.phone,Boolean(b.whatsapp_opt_in),patientId]);
  }
  const conflict=await db.query("SELECT id FROM appointments WHERE hospital_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND appointment_time=$4 AND status <> 'cancelled' LIMIT 1",[hid,b.doctor_id,b.appointment_date,b.appointment_time]);
  if(conflict.rows[0]) return res.status(409).json({error:"That slot is already booked. Please choose another time."});
  const a=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason) VALUES($1,$2,$3,$4,$5,'pending','public-web',$6) RETURNING id,appointment_date,appointment_time,status",[hid,patientId,b.doctor_id,b.appointment_date,b.appointment_time,b.reason||null]);
  if(Boolean(b.whatsapp_opt_in)){
    await db.query("INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status,channel) VALUES($1,$2,$3,'appointment_confirmation',now(),'pending','whatsapp') ON CONFLICT (appointment_id,kind) DO NOTHING",[hid,patientId,a.rows[0].id]);
  }
  res.json({ok:true,appointment:a.rows[0],doctor:doctor.rows[0]});
}