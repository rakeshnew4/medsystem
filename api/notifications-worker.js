import { db } from "../lib/db.js";
export const access = "scheduler";
export const schedule = "15 * * * *";

async function sendWhatsApp(to, text){
  const base=process.env.WHATSAPP_GRAPH_URL;
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if(!base||!token||!phoneId) return {ok:false,error:"WhatsApp credentials are not configured"};
  const r=await fetch(base.replace(/\/$/,"")+"/"+phoneId+"/messages",{
    method:"POST",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{body:text}})
  });
  const j=await r.json().catch(()=>({}));
  return r.ok?{ok:true,id:j.messages?.[0]?.id}:{ok:false,error:j.error?.message||"WhatsApp request failed"};
}

function formatDate(d){return new Date(d+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}

export default async function(req,res){
  const h=await db.query("SELECT id,name FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.json({ok:true,sent:0,reason:"no hospital"});
  const hid=h.rows[0].id;
  const now=new Date();
  const in24=new Date(now.getTime()+24*60*60*1000);
  const in2=new Date(now.getTime()+2*60*60*1000);

  const upcoming=await db.query(
    "SELECT a.id,a.appointment_date,a.appointment_time,p.id AS patient_id,p.name AS patient_name,COALESCE(p.whatsapp_phone,p.phone) AS phone,p.whatsapp_opt_in,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 AND a.status IN ('pending','confirmed') AND (a.appointment_date + a.appointment_time) BETWEEN $2 AND $3 AND p.whatsapp_opt_in=true AND COALESCE(p.whatsapp_phone,p.phone) IS NOT NULL",
    [hid,now.toISOString(),new Date(in24.getTime()+60*60*1000).toISOString()]
  );

  let sent=0,failed=0;
  for(const a of upcoming.rows){
    const apptAt=new Date(a.appointment_date+"T"+String(a.appointment_time).slice(0,8));
    const hours=(apptAt-now)/3600000;
    const kind=hours>=20?"appointment_reminder_24h":"appointment_reminder_2h";
    const threshold=kind.endsWith("24h")?20:1;
    if(hours<threshold) continue;
    const existing=await db.query("SELECT id,status FROM notifications WHERE appointment_id=$1 AND kind=$2 LIMIT 1",[a.id,kind]);
    if(existing.rows[0]&&existing.rows[0].status==="sent") continue;
    if(!existing.rows[0]){
      await db.query("INSERT INTO notifications(hospital_id,patient_id,appointment_id,kind,scheduled_for,status,channel) VALUES($1,$2,$3,$4,now(),'pending','whatsapp')",[hid,a.patient_id,a.id,kind]);
    }
  }

  const due=await db.query(
    "SELECT n.id,n.kind,n.attempts,p.name AS patient_name,COALESCE(p.whatsapp_phone,p.phone) AS phone,p.whatsapp_opt_in,a.appointment_date,a.appointment_time,d.name AS doctor_name,h.name AS hospital_name FROM notifications n JOIN patients p ON p.id=n.patient_id LEFT JOIN appointments a ON a.id=n.appointment_id LEFT JOIN doctors d ON d.id=a.doctor_id JOIN hospitals h ON h.id=n.hospital_id WHERE n.hospital_id=$1 AND n.status='pending' AND n.channel='whatsapp' AND n.scheduled_for<=now() AND p.whatsapp_opt_in=true AND COALESCE(p.whatsapp_phone,p.phone) IS NOT NULL ORDER BY n.created_at LIMIT 50",
    [hid]
  );
  for(const n of due.rows){
    let message;
    if(n.kind==="appointment_confirmation"){
      message=`Appointment request received at ${n.hospital_name}. ${n.appointment_date?`Requested appointment: ${formatDate(n.appointment_date)} at ${String(n.appointment_time).slice(0,5)} with ${n.doctor_name}.`:""} We will confirm the appointment shortly.`;
    }else if(n.kind==="appointment_reminder_24h"){
      message=`Reminder from ${n.hospital_name}: you have an appointment tomorrow, ${formatDate(n.appointment_date)} at ${String(n.appointment_time).slice(0,5)} with ${n.doctor_name}.`;
    }else if(n.kind==="appointment_reminder_2h"){
      message=`Reminder from ${n.hospital_name}: your appointment with ${n.doctor_name} is in about 2 hours, at ${String(n.appointment_time).slice(0,5)} today.`;
    }else{
      message=`Reminder from ${n.hospital_name}: please contact the hospital regarding your follow-up.`;
    }
    const result=await sendWhatsApp(n.phone,message);
    if(result.ok){await db.query("UPDATE notifications SET status='sent',sent_at=now(),attempts=attempts+1,last_error=null,updated_at=now() WHERE id=$1",[n.id]);sent++}
    else {await db.query("UPDATE notifications SET attempts=attempts+1,last_error=$1,updated_at=now() WHERE id=$2",[result.error,n.id]);failed++}
  }
  res.json({ok:true,sent,failed,queued:upcoming.rows.length});
}