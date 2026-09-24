import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","POST","PUT"];

function timeParts(value){
  const s=String(value||"").trim();
  const m=s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if(m)return {date:m[1],time:m[2]};
  return {date:s.slice(0,10),time:"10:00"};
}
function toMin(t){const p=String(t).slice(0,5).split(":").map(Number);return p[0]*60+p[1];}

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.followups":"action.followups.manage");if(!ctx)return;
 const hid=ctx.hospitalId,b=req.body||{};

 if(req.method==="POST"){
   if(!b.patient_id||!b.due_date)return res.status(400).json({error:"Patient and follow-up date/time are required"});
   const {date,time}=timeParts(b.due_date);
   const doctorId=b.doctor_id?Number(b.doctor_id):null;
   const type=b.consultation_type==="online"?"online":"in_person";
   if(!doctorId)return res.status(400).json({error:"Select a doctor for the follow-up."});

   const dq=await db.query("SELECT id,name,online_consultation_enabled FROM doctors WHERE id=$1 AND hospital_id=$2 AND active=true",[doctorId,hid]);
   const doctor=dq.rows[0];
   if(!doctor)return res.status(400).json({error:"Doctor is not available."});
   if(type==="online"&&!doctor.online_consultation_enabled)return res.status(400).json({error:"Online consultation is not enabled for this doctor."});

   const dt=new Date(date+"T12:00:00Z"),dow=dt.getUTCDay();
   const [rules,exceptions]=await Promise.all([
     db.query("SELECT start_time,end_time FROM doctor_availability_rules WHERE hospital_id=$1 AND doctor_id=$2 AND day_of_week=$3 AND active=true AND (appointment_type=$4 OR appointment_type='opd')",[hid,doctorId,dow,type]),
     db.query("SELECT start_time,end_time,exception_type FROM doctor_availability_exceptions WHERE hospital_id=$1 AND doctor_id=$2 AND exception_date=$3",[hid,doctorId,date])
   ]);
   const tm=toMin(time);
   let available=!rules.rows.length;
   if(rules.rows.length)available=rules.rows.some(r=>tm>=toMin(r.start_time)&&tm<toMin(r.end_time));
   for(const e of exceptions.rows){
     if(["leave","unavailable","closed"].includes(String(e.exception_type).toLowerCase())){
       const s=e.start_time?toMin(e.start_time):0,en=e.end_time?toMin(e.end_time):1440;
       if(tm>=s&&tm<en)available=false;
     }
   }
   if(!available)return res.status(409).json({error:"Doctor is not available for this follow-up time slot."});

   const conflict=await db.query("SELECT id FROM appointments WHERE hospital_id=$1 AND doctor_id=$2 AND appointment_date=$3 AND appointment_time=$4 AND status <> 'cancelled' LIMIT 1",[hid,doctorId,date,time]);
   if(conflict.rows[0])return res.status(409).json({error:"That doctor/time slot is already booked. Please choose another time."});

   const a=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason,consultation_type,video_status) VALUES($1,$2,$3,$4,$5,'confirmed','staff_followup',$6,$7,$8) RETURNING id,public_token,appointment_date,appointment_time,status,patient_id,doctor_id,consultation_type,video_status",[hid,b.patient_id,doctorId,date,time,b.reason||"Follow-up consultation",type,type==="online"?"scheduled":"not_required"]);
   let video=null;
   if(type==="online"){
     const room="CareFlow-OPD-"+crypto.randomUUID().replaceAll("-","");
     const v=await db.query("INSERT INTO video_sessions(hospital_id,appointment_id,provider,room_name,scheduled_start,status) VALUES($1,$2,'jitsi',$3,$4,'scheduled') RETURNING id,provider,room_name,status",[hid,a.rows[0].id,room,date+" "+time+":00"]);
     await db.query("UPDATE appointments SET video_provider='jitsi',video_room=$1 WHERE id=$2",[room,a.rows[0].id]);
     video={id:v.rows[0].id,provider:v.rows[0].provider,status:v.rows[0].status,join_url:"/opd/video?token="+encodeURIComponent(a.rows[0].public_token)};
   }

   const f=await db.query("INSERT INTO followups(hospital_id,patient_id,doctor_id,due_date,status,notes,appointment_id,consultation_type) VALUES($1,$2,$3,$4,'scheduled',$5,$6,$7) RETURNING *",[hid,b.patient_id,doctorId,date,[b.reason,b.notes].filter(Boolean).join(" — ")||null,a.rows[0].id,type]);
   await db.query("INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status,channel) VALUES($1,$2,$3,'followup_confirmation',now(),'pending','web') ON CONFLICT (appointment_id,kind) DO NOTHING",[hid,b.patient_id,a.rows[0].id]);
   return res.json({followup:f.rows[0],appointment:a.rows[0],doctor,video});
 }

 if(req.method==="PUT"){
   const r=await db.query("UPDATE followups SET due_date=$1,status=$2,notes=$3,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING *",[String(b.due_date||"").slice(0,10),b.status||"due",b.notes||null,b.id,hid]);
   return res.json(r.rows[0]||{error:"Follow-up not found"});
 }
 const r=await db.query("SELECT f.*,p.name AS patient_name,d.name AS doctor_name,a.appointment_date,a.appointment_time,a.status AS appointment_status,a.consultation_type,a.public_token,a.video_status FROM followups f JOIN patients p ON p.id=f.patient_id LEFT JOIN doctors d ON d.id=f.doctor_id LEFT JOIN appointments a ON a.id=f.appointment_id WHERE f.hospital_id=$1 ORDER BY f.due_date LIMIT 200",[hid]);
 res.json(r.rows);
}