import { db } from "hatchable";
export const access="public";
export const methods=["POST"];
function normalizePhone(input){let d=String(input||"").replace(/\D/g,"");if(d.length===10)d="91"+d;else if(d.length===11&&d.startsWith("0"))d="91"+d.slice(1);return /^91[6-9]\d{9}$/.test(d)?d:null}
async function sha256(s){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
function randomToken(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")}
export default async function(req,res){
 const phone=normalizePhone(req.body?.phone),otp=String(req.body?.otp||"").replace(/\D/g,""),slug=String(req.body?.slug||"").trim();
 if(!phone||!/^[0-9]{4,9}$/.test(otp))return res.status(400).json({error:"Enter your mobile number and the OTP."});
 const key=process.env.MSG91_AUTH_KEY;if(!key)return res.status(503).json({error:"Phone OTP is not configured yet."});
 try{
  const p=new URLSearchParams({authkey:key,mobile:phone,otp}),r=await fetch("https://api.msg91.com/api/verifyRequestOTP.php?"+p.toString()),x=await r.json().catch(()=>({}));
  if(!r.ok||String(x?.type||"").toLowerCase()!=="success")return res.status(401).json({error:"The OTP is incorrect or expired."});
  let hq=slug?await db.query("SELECT id,name,public_slug FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug]):await db.query("SELECT id,name,public_slug FROM hospitals ORDER BY id LIMIT 1");
  const h=hq.rows[0];if(!h)return res.status(404).json({error:"Hospital is not configured."});
  const pq=await db.query("SELECT id,name,phone,email FROM patients WHERE hospital_id=$1 AND right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right($2,10) ORDER BY id DESC LIMIT 1",[h.id,phone]);
  let patient=pq.rows[0];if(!patient){patient=(await db.query("INSERT INTO patients(hospital_id,name,phone,status) VALUES($1,$2,$3,'active') RETURNING id,name,phone,email",[h.id,"Patient",phone])).rows[0]}
  const raw=randomToken(),hash=await sha256(raw);
  await db.query("DELETE FROM patient_sessions WHERE patient_id=$1 OR expires_at<now()",[patient.id]);
  await db.query("INSERT INTO patient_sessions(hospital_id,patient_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[h.id,patient.id,hash]);
  res.cookie("careflow_patient_session",raw,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*30});
  return res.json({ok:true,patient:{id:patient.id,name:patient.name,phone:patient.phone,email:patient.email},hospital:{id:h.id,name:h.name,slug:h.public_slug}});
 }catch(e){console.error("patient OTP verification error",e);return res.status(500).json({error:"Could not complete sign-in."})}
}