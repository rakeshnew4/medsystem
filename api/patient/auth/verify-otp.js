import { db } from "../../../lib/db.js";

export const access="public";
export const methods=["POST"];

function normalizePhone(input){
  let d=String(input||"").replace(/\D/g,"");
  if(d.length===10)d="91"+d;
  else if(d.length===11&&d.startsWith("0"))d="91"+d.slice(1);
  return /^91[6-9]\d{9}$/.test(d)?d:null;
}
function normalizeEmail(input){
  const e=String(input||"").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:null;
}
async function sha256(s){
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
function randomToken(){
  const b=new Uint8Array(32);crypto.getRandomValues(b);
  return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
}

export default async function(req,res){
  const method=String(req.body?.method||"phone").toLowerCase();
  const phone=normalizePhone(req.body?.phone||req.body?.identifier);
  const emailAddress=normalizeEmail(req.body?.email||req.body?.identifier);
  const otp=String(req.body?.otp||"").replace(/\D/g,"");
  const slug=String(req.body?.slug||"").trim();
  if(method!=="phone"&&method!=="email")return res.status(400).json({error:"Choose phone or email login."});
  if(!/^[0-9]{6}$/.test(otp))return res.status(400).json({error:"Enter the 6-digit OTP."});

  if(method==="phone"){
    if(!phone)return res.status(400).json({error:"Enter a valid mobile number."});
    const key=process.env.MSG91_AUTH_KEY;if(!key)return res.status(503).json({error:"Phone OTP is not configured yet."});
    try{
      const p=new URLSearchParams({authkey:key,mobile:phone,otp});
      const r=await fetch("https://api.msg91.com/api/verifyRequestOTP.php?"+p.toString()),x=await r.json().catch(()=>({}));
      if(!r.ok||String(x?.type||"").toLowerCase()!=="success")return res.status(401).json({error:"The OTP is incorrect or expired."});
    }catch(e){return res.status(502).json({error:"OTP service is temporarily unavailable."});}
  }else{
    if(!emailAddress)return res.status(400).json({error:"Enter a valid email address."});
    const q=await db.query("SELECT otp_hash,expires_at,attempts FROM patient_email_otp WHERE email=$1",[emailAddress]),row=q.rows[0];
    if(!row||new Date(row.expires_at).getTime()<=Date.now())return res.status(401).json({error:"The OTP is incorrect or expired. Please request a new code."});
    if(Number(row.attempts)>=5)return res.status(429).json({error:"Too many incorrect attempts. Please request a new OTP."});
    const ok=(await sha256(otp))===row.otp_hash;
    if(!ok){await db.query("UPDATE patient_email_otp SET attempts=attempts+1 WHERE email=$1",[emailAddress]);return res.status(401).json({error:"The OTP is incorrect or expired."});}
    await db.query("DELETE FROM patient_email_otp WHERE email=$1",[emailAddress]);
  }

  const hq=slug?await db.query("SELECT id,name,public_slug FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug]):await db.query("SELECT id,name,public_slug FROM hospitals ORDER BY id LIMIT 1");
  const h=hq.rows[0];if(!h)return res.status(404).json({error:"Hospital is not configured."});

  const identifier=method==="phone"?phone:emailAddress;
  const pq=method==="phone"
    ?await db.query("SELECT id,name,phone,email FROM patients WHERE hospital_id=$1 AND right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right($2,10) ORDER BY id DESC LIMIT 1",[h.id,phone])
    :await db.query("SELECT id,name,phone,email FROM patients WHERE hospital_id=$1 AND lower(email)=lower($2) ORDER BY id DESC LIMIT 1",[h.id,emailAddress]);
  let patient=pq.rows[0];
  if(!patient){
    patient=(await db.query("INSERT INTO patients(hospital_id,name,phone,email,status) VALUES($1,$2,$3,$4,'active') RETURNING id,name,phone,email",[h.id,"Patient",method==="phone"?phone:null,method==="email"?emailAddress:null])).rows[0];
  }else if(method==="email"&&!patient.email){
    patient=(await db.query("UPDATE patients SET email=$2 WHERE id=$1 RETURNING id,name,phone,email",[patient.id,emailAddress])).rows[0];
  }

  const raw=randomToken(),hash=await sha256(raw);
  await db.query("DELETE FROM patient_sessions WHERE patient_id=$1 OR expires_at<now()",[patient.id]);
  await db.query("INSERT INTO patient_sessions(hospital_id,patient_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 days')",[h.id,patient.id,hash]);
  res.cookie("careflow_patient_session",raw,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:60*60*24*30});
  return res.json({ok:true,patient:{id:patient.id,name:patient.name,phone:patient.phone,email:patient.email},hospital:{id:h.id,name:h.name,slug:h.public_slug}});
}