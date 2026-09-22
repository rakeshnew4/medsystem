import { db } from "hatchable";

export const access="public";
export const methods=["POST"];

function slugifyRoom(){return "CareFlow-OPD-"+crypto.randomUUID().replaceAll("-","");}

async function hospitalFor(slug){
  const q=slug
    ? await db.query("SELECT id,name FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug])
    : await db.query("SELECT id,name FROM hospitals ORDER BY id LIMIT 1");
  return q.rows[0]||null;
}

export default async function(req,res){
  const b=req.body||{};
  const type=b.consultation_type==="online"?"online":"in_person";
  if(!String(b.name||"").trim()||!String(b.phone||"").trim()||!b.doctor_id||!b.appointment_date||!b.appointment_time)
    return res.status(400).json({error:"Name, phone, doctor, date and time are required"});

  const h=await hospitalFor(String(b.slug||"").trim().toLowerCase());
  if(!h)return res.status(404).json({error:"Hospital is not configured"});
  const doctor=await db.query("SELECT id,name,specialty,consultation_fee,online_consultation_enabled FROM doctors WHERE id=$1 AND hospital_id=$2 AND active=true",[b.doctor_id,h.id]);
  if(!doctor.rows[0])return res.status(400).json({error:"Doctor is not available"});
  if(type==="online"&&!doctor.rows[0].online_consultation_enabled)return res.status(400).json({error:"Online consultation is not enabled for this doctor"});

  const date=String(b.appointment_date),time=String(b.appointment_time).slice(0,5);
  const conflict=await db.query("SELECT id FROM appointments WHERE hospital_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND appointment_time=$4 AND status <> 'cancelled' LIMIT 1",[h.id,b.doctor_id,date,time]);
  if(conflict.rows[0])return res.status(409).json({error:"That slot is already booked. Please choose another time."});

  const patient=await db.query("SELECT id FROM patients WHERE hospital_id=$1 AND phone=$2 ORDER BY id LIMIT 1",[h.id,String(b.phone).trim()]);
  let patientId=patient.rows[0]?.id;
  if(!patientId){
    const p=await db.query("INSERT INTO patients(hospital_id,name,phone,whatsapp_phone,whatsapp_opt_in,email) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[h.id,String(b.name).trim(),String(b.phone).trim(),String(b.phone).trim(),Boolean(b.whatsapp_opt_in),b.email||null]);
    patientId=p.rows[0].id;
  }else{
    await db.query("UPDATE patients SET name=$1,email=$2,whatsapp_phone=$3,whatsapp_opt_in=$4,updated_at=now() WHERE id=$5",[String(b.name).trim(),b.email||null,String(b.phone).trim(),Boolean(b.whatsapp_opt_in),patientId]);
  }

  const a=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason,consultation_type,video_status) VALUES($1,$2,$3,$4,$5,'pending','patient_web',$6,$7,$8) RETURNING id,public_token,appointment_date,appointment_time,status,consultation_type",[h.id,patientId,b.doctor_id,date,time,b.reason||null,type,type==="online"?"scheduled":"not_required"]);
  let video=null;
  if(type==="online"){
    const room=slugifyRoom();
    const v=await db.query("INSERT INTO video_sessions(hospital_id,appointment_id,provider,room_name,scheduled_start,status) VALUES($1,$2,'jitsi',$3,$4,'scheduled') RETURNING id,provider,room_name,join_token,status",[h.id,a.rows[0].id,room,date+" "+time+":00"]);
    await db.query("UPDATE appointments SET video_provider='jitsi',video_room=$1 WHERE id=$2",[room,a.rows[0].id]);
    video={id:v.rows[0].id,provider:v.rows[0].provider,status:v.rows[0].status};
  }
  if(Boolean(b.whatsapp_opt_in))await db.query("INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status,channel) VALUES($1,$2,$3,'appointment_confirmation',now(),'pending','whatsapp') ON CONFLICT (appointment_id,kind) DO NOTHING",[h.id,patientId,a.rows[0].id]);

  res.json({ok:true,appointment:a.rows[0],doctor:doctor.rows[0],video,manage_url:"/opd/appointment?token="+encodeURIComponent(a.rows[0].public_token)});
}