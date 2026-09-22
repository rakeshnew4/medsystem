import { db } from "hatchable";

export const access="public";
export const methods=["GET","PUT"];

export default async function(req,res){
  const token=String(req.query?.token||req.body?.token||"").trim();
  if(!token)return res.status(400).json({error:"Booking token is required"});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token))return res.status(404).json({error:"Booking not found"});

  if(req.method==="GET"){
    const q=await db.query(`
      SELECT a.id,a.public_token,a.appointment_date,a.appointment_time,a.status,a.reason,a.consultation_type,a.video_status,
             p.name AS patient_name,p.phone,
             d.name AS doctor_name,d.specialty,d.consultation_fee,
             h.name AS hospital_name,h.phone AS hospital_phone,h.address,h.public_slug,
             vs.provider AS video_provider,vs.status AS video_session_status,vs.room_name,vs.join_token
      FROM appointments a
      JOIN patients p ON p.id=a.patient_id
      JOIN doctors d ON d.id=a.doctor_id
      JOIN hospitals h ON h.id=a.hospital_id
      LEFT JOIN video_sessions vs ON vs.appointment_id=a.id
      WHERE a.public_token=$1
      LIMIT 1
    `,[token]);
    if(!q.rows[0])return res.status(404).json({error:"Booking not found"});
    const row=q.rows[0];
    res.json({
      ...row,
      video:row.consultation_type==="online"&&row.video_session_status
        ? {provider:row.video_provider,status:row.video_session_status,join_url:"/opd/video?token="+encodeURIComponent(token)}
        : null
    });
    return;
  }

  if(req.body?.action!=="cancel")return res.status(400).json({error:"Unsupported action"});
  const q=await db.query("SELECT id,status FROM appointments WHERE public_token=$1 LIMIT 1",[token]);
  if(!q.rows[0])return res.status(404).json({error:"Booking not found"});
  if(["completed","cancelled","no_show"].includes(q.rows[0].status))return res.status(409).json({error:"This appointment cannot be cancelled"});
  const r=await db.query("UPDATE appointments SET status='cancelled',video_status=CASE WHEN consultation_type='online' THEN 'cancelled' ELSE video_status END,updated_at=now() WHERE id=$1 RETURNING id,status,consultation_type",[q.rows[0].id]);
  await db.query("UPDATE video_sessions SET status='cancelled',updated_at=now() WHERE appointment_id=$1",[q.rows[0].id]);
  res.json({ok:true,appointment:r.rows[0]});
}