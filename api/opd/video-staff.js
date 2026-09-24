import { db } from "hatchable";
import { requireStaff, requirePermission } from "../../lib/authz.js";

export const access="user";
export const methods=["GET","POST"];

export default async function(req,res){
  try{
    const staff=await requireStaff(req);
    await requirePermission(staff,"page.appointments");
    const id=Number(req.query?.appointment_id||req.body?.appointment_id||0);
    if(!id)return res.status(400).json({error:"appointment_id is required"});

    const q=await db.query(`
      SELECT a.id,a.hospital_id,a.status,a.consultation_type,a.appointment_date,a.appointment_time,
             p.id AS patient_id,p.name AS patient_name,p.phone AS patient_phone,d.name AS doctor_name,vs.provider,vs.room_name,vs.status AS video_status
      FROM appointments a
      JOIN patients p ON p.id=a.patient_id
      JOIN doctors d ON d.id=a.doctor_id
      LEFT JOIN video_sessions vs ON vs.appointment_id=a.id
      WHERE a.id=$1 AND a.hospital_id=$2
      LIMIT 1
    `,[id,staff.hospital_id]);
    if(!q.rows[0])return res.status(404).json({error:"Appointment not found"});
    if(q.rows[0].consultation_type!=="online"||!q.rows[0].room_name)return res.status(409).json({error:"This appointment has no video session"});
    if(q.rows[0].video_status==="completed" && req.body?.action!=="end")return res.status(409).json({error:"This video consultation has already ended"});
    const action=req.body?.action;
    if(action==="end"){
      await db.query("UPDATE video_sessions SET status='completed',ended_at=now(),updated_at=now() WHERE appointment_id=$1",[id]);
      await db.query("UPDATE appointments SET video_status='completed',updated_at=now() WHERE id=$1",[id]);
    }else if(action==="start"){
      await db.query("UPDATE video_sessions SET status='active',started_at=COALESCE(started_at,now()),updated_at=now() WHERE appointment_id=$1",[id]);
      await db.query("UPDATE appointments SET video_status='active',updated_at=now() WHERE id=$1",[id]);
    }
    const v=await db.query("SELECT provider,room_name,status FROM video_sessions WHERE appointment_id=$1",[id]);
    const s=v.rows[0];
    res.json({ok:true,appointment:q.rows[0],video:{provider:s.provider,status:s.status,room_name:s.room_name,join_url:"/opd/video-staff/?appointment_id="+id,domain:"meet.jit.si"}});
  }catch(e){res.status(e.status||500).json({error:e.message||"Video error"});}
}