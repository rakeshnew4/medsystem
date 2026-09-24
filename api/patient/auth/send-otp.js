import { db, email } from "hatchable";

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
function otp(){return String(Math.floor(100000+Math.random()*900000));}

export default async function(req,res){
  const method=String(req.body?.method||"phone").toLowerCase();
  const phone=normalizePhone(req.body?.phone||req.body?.identifier);
  const emailAddress=normalizeEmail(req.body?.email||req.body?.identifier);
  if(method!=="phone"&&method!=="email")return res.status(400).json({error:"Choose phone or email login."});

  if(method==="phone"){
    if(!phone)return res.status(400).json({error:"Enter a valid 10-digit Indian mobile number."});
    const now=Date.now(),q=await db.query("SELECT window_started_at,last_sent_at,sends_in_window FROM patient_otp_limits WHERE phone_digits=$1",[phone]),row=q.rows[0];
    if(row){
      const age=now-new Date(row.window_started_at).getTime(),since=row.last_sent_at?now-new Date(row.last_sent_at).getTime():999999;
      if(since<60000)return res.status(429).json({error:"Please wait 60 seconds before requesting another OTP."});
      if(age<3600000&&Number(row.sends_in_window)>=5)return res.status(429).json({error:"Too many OTP requests. Please try again later."});
    }
    const key=process.env.MSG91_AUTH_KEY;
    if(!key)return res.status(503).json({error:"Phone OTP is not configured yet. Add MSG91_AUTH_KEY to project secrets."});
    try{
      const p=new URLSearchParams({authkey:key,mobile:phone,otp_expiry:"10",otp_length:"6",message:"Your CareFlow verification code is ##OTP##. Do not share this code."});
      const r=await fetch("https://api.msg91.com/api/sendotp.php?"+p.toString()),x=await r.json().catch(()=>({}));
      if(!r.ok||String(x?.type||"").toLowerCase()!=="success"){console.error("MSG91 send OTP failed",r.status,x);return res.status(502).json({error:"Could not send OTP. Please try again."});}
      if(row){
        const age=now-new Date(row.window_started_at).getTime();
        await db.query(age>=3600000?"UPDATE patient_otp_limits SET window_started_at=now(),sends_in_window=1,last_sent_at=now() WHERE phone_digits=$1":"UPDATE patient_otp_limits SET sends_in_window=sends_in_window+1,last_sent_at=now() WHERE phone_digits=$1",[phone]);
      }else await db.query("INSERT INTO patient_otp_limits(phone_digits,sends_in_window,last_sent_at) VALUES($1,1,now())",[phone]);
      return res.json({ok:true,method:"phone",message:"OTP sent to your mobile number.",expires_in_seconds:600});
    }catch(e){console.error("MSG91 request error",e);return res.status(502).json({error:"OTP service is temporarily unavailable."});}
  }

  if(!emailAddress)return res.status(400).json({error:"Enter a valid email address."});
  const now=Date.now(),q=await db.query("SELECT window_started_at,last_sent_at,sends_in_window FROM patient_email_otp WHERE email=$1",[emailAddress]),row=q.rows[0];
  if(row){
    const age=now-new Date(row.window_started_at).getTime(),since=now-new Date(row.last_sent_at).getTime();
    if(since<60000)return res.status(429).json({error:"Please wait 60 seconds before requesting another OTP."});
    if(age<3600000&&Number(row.sends_in_window)>=5)return res.status(429).json({error:"Too many OTP requests. Please try again later."});
  }
  const code=otp(),hash=await sha256(code);
  try{
    await email.send({to:emailAddress,subject:"Your CareFlow verification code",html:"<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px\"><h2 style=\"color:#0f766e\">CareFlow</h2><p>Your patient portal verification code is:</p><div style=\"font-size:32px;font-weight:800;letter-spacing:8px;margin:22px 0\">"+code+"</div><p>This code expires in 10 minutes. Do not share it with anyone.</p></div>"});
    if(row){
      const age=now-new Date(row.window_started_at).getTime();
      await db.query(age>=3600000?"UPDATE patient_email_otp SET window_started_at=now(),sends_in_window=1,last_sent_at=now(),otp_hash=$2,expires_at=now()+interval '10 minutes',attempts=0 WHERE email=$1":"UPDATE patient_email_otp SET sends_in_window=sends_in_window+1,last_sent_at=now(),otp_hash=$2,expires_at=now()+interval '10 minutes',attempts=0 WHERE email=$1",[emailAddress,hash]);
    }else await db.query("INSERT INTO patient_email_otp(email,otp_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",[emailAddress,hash]);
    return res.json({ok:true,method:"email",message:"OTP sent to your email address.",expires_in_seconds:600});
  }catch(e){console.error("email OTP error",e);return res.status(502).json({error:"Could not send email OTP. Please try again."});}
}