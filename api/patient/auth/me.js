import { db } from "hatchable";
export const access="public";
export const methods=["GET"];
function getCookie(req,name){const s=String(req.headers?.cookie||"");for(const part of s.split(";")){const i=part.trim().indexOf("=");if(i>0&&part.trim().slice(0,i)===name)return decodeURIComponent(part.trim().slice(i+1))}return null}
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
export default async function(req,res){
 const raw=getCookie(req,"careflow_patient_session");if(!raw)return res.status(401).json({error:"Not signed in."});
 const hash=await sha256(raw),q=await db.query("SELECT s.hospital_id,s.patient_id,s.expires_at,p.name,p.phone,p.email,h.name hospital_name,h.public_slug FROM patient_sessions s JOIN patients p ON p.id=s.patient_id JOIN hospitals h ON h.id=s.hospital_id WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1",[hash]);
 if(!q.rows[0])return res.status(401).json({error:"Session expired."});
 await db.query("UPDATE patient_sessions SET last_seen_at=now() WHERE token_hash=$1",[hash]);
 const x=q.rows[0],a=await db.query("SELECT a.id,a.appointment_date,a.appointment_time,a.status,a.consultation_type,a.public_token,d.name doctor_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 AND a.patient_id=$2 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 20",[x.hospital_id,x.patient_id]);
 return res.json({patient:{id:x.patient_id,name:x.name,phone:x.phone,email:x.email},hospital:{name:x.hospital_name,slug:x.public_slug},appointments:a.rows});
}