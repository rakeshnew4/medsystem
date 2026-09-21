import { db } from "hatchable";
export const access="public";
export const methods=["GET","PUT"];

export default async function(req,res){
  const token=req.query?.token || req.body?.token;
  if(!token)return res.status(400).json({error:"Booking token is required"});
  if(req.method==="GET"){
    const q=await db.query(`
      SELECT a.id,a.public_token,a.appointment_date,a.appointment_time,a.status,a.reason,
             p.name AS patient_name,p.phone,
             d.name AS doctor_name,d.specialty,d.consultation_fee,
             h.name AS hospital_name,h.phone AS hospital_phone,h.address
      FROM appointments a
      JOIN patients p ON p.id=a.patient_id
      JOIN doctors d ON d.id=a.doctor_id
      JOIN hospitals h ON h.id=a.hospital_id
      WHERE a.public_token=$1
      LIMIT 1
    `,[token]);
    if(!q.rows[0])return res.status(404).json({error:"Booking not found"});
    res.json(q.rows[0]); return;
  }
  const action=req.body?.action;
  if(action!=="cancel")return res.status(400).json({error:"Unsupported action"});
  const q=await db.query("SELECT id,status FROM appointments WHERE public_token=$1 LIMIT 1",[token]);
  if(!q.rows[0])return res.status(404).json({error:"Booking not found"});
  if(["completed","cancelled","no_show"].includes(q.rows[0].status))return res.status(409).json({error:"This appointment cannot be cancelled"});
  const r=await db.query("UPDATE appointments SET status='cancelled',updated_at=now() WHERE id=$1 RETURNING id,status",[q.rows[0].id]);
  res.json({ok:true,appointment:r.rows[0]});
}