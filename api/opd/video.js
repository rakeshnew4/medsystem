import { db } from "../../lib/db.js";

export const access="public";
export const methods=["GET","POST"];

function allowedWindow(date,time){
  const start=new Date(String(date).slice(0,10)+"T"+String(time).slice(0,5)+":00");
  const now=Date.now();
  return Math.abs(now-start.getTime())<=45*60*1000;
}

export default async function(req,res){
  const token=String(req.query?.token||req.body?.token||"").trim();
  if(!token)return res.status(400).json({error:"Appointment token is required"});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return res.status(404).json({error:"Video appointment not found"});
  const q=await db.query(`
    SELECT a.id,a.status,a.consultation_type,a.appointment_date,a.appointment_time,p.name AS patient_name,
           d.name AS doctor_name,d.specialty,h.name AS hospital_name,
           vs.provider,vs.room_name,vs.status AS video_status
    FROM appointments a
    JOIN patients p ON p.id=a.patient_id
    JOIN doctors d ON d.id=a.doctor_id
    JOIN hospitals h ON h.id=a.hospital_id
    JOIN video_sessions vs ON vs.appointment_id=a.id
    WHERE a.public_token=$1
    LIMIT 1
  `,[token]);
  const row=q.rows[0];
  if(!row)return res.status(404).json({error:"Video appointment not found"});
  if(row.consultation_type!=="online")return res.status(409).json({error:"This is not an online consultation"});
  if(["cancelled","completed","no_show"].includes(row.status))return res.status(409).json({error:"This appointment is no longer active"});
  if(row.video_status==="completed")return res.status(409).json({error:"This video consultation has ended"});
  if(!allowedWindow(row.appointment_date,row.appointment_time))return res.status(403).json({error:"The video room opens 45 minutes before the appointment and closes 45 minutes after it"});
  if(req.method==="POST"){
    const action=req.body?.action;
    if(action==="join"){
      await db.query("UPDATE video_sessions SET status='active',started_at=COALESCE(started_at,now()),updated_at=now() WHERE appointment_id=$1",[row.id]);
      await db.query("UPDATE appointments SET video_status='active',updated_at=now() WHERE id=$1",[row.id]);
    }else if(action==="leave"){
      // Patient leaving the browser is not the same as ending the clinical consultation.
      // Only staff/doctor may complete the video session.
      // Keep the session active so the patient can reconnect while the doctor is still present.
      await db.query("UPDATE video_sessions SET updated_at=now() WHERE appointment_id=$1 AND status <> 'completed'",[row.id]);
    }
  }
  const current=await db.query("SELECT provider,room_name,status FROM video_sessions WHERE appointment_id=$1",[row.id]);
  const s=current.rows[0];
  res.json({ok:true,appointment:{id:row.id,status:row.status,date:row.appointment_date,time:row.appointment_time,patient_name:row.patient_name,doctor_name:row.doctor_name,specialty:row.specialty,hospital_name:row.hospital_name},video:{provider:s.provider,status:s.status,room_name:s.room_name,domain:"meet.jit.si"}});
}