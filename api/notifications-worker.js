import crypto from "node:crypto";
import { browser } from "hatchable";
import { db } from "../lib/db.js";
export const access = "scheduler";
export const schedule = "0 * * * *";

function archiveConfig(){
  return {
    endpoint:String(process.env.MINIO_ENDPOINT||"").trim().replace(/\/$/,""),
    accessKey:String(process.env.MINIO_ACCESS_KEY||"").trim(),
    secretKey:String(process.env.MINIO_SECRET_KEY||"").trim(),
    bucket:String(process.env.MINIO_BUCKET||"careflow-archive").trim(),
    region:String(process.env.MINIO_REGION||"us-east-1").trim()
  };
}
function hmac(k,d){return crypto.createHmac("sha256",k).update(d).digest();}
function hex(d){return crypto.createHash("sha256").update(d).digest("hex");}
function signKey(secret,date,region){return hmac(hmac(hmac(hmac(Buffer.from("AWS4"+secret),date),region),"s3"),"aws4_request");}
async function archiveObject(key,body,type){
  const c=archiveConfig();
  if(!c.endpoint||!c.accessKey||!c.secretKey||!c.bucket)return {ok:false,configured:false,error:"MinIO credentials are not configured"};
  const payload=Buffer.isBuffer(body)?body:Buffer.from(typeof body==="string"?body:JSON.stringify(body));
  const now=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z"), day=now.slice(0,8);
  const u=new URL(c.endpoint), host=u.host, encoded=String(key).split("/").map(encodeURIComponent).join("/");
  const path=(u.pathname.replace(/\/$/,"")||"")+"/"+encodeURIComponent(c.bucket)+"/"+encoded;
  const payloadHash=hex(payload), headers="content-type:"+type+"\n"+"host:"+host+"\n"+"x-amz-content-sha256:"+payloadHash+"\n"+"x-amz-date:"+now+"\n";
  const signed="content-type;host;x-amz-content-sha256;x-amz-date", canonical=["PUT",path,"",headers,signed,payloadHash].join("\n");
  const scope=day+"/"+c.region+"/s3/aws4_request";
  const sig=crypto.createHmac("sha256",signKey(c.secretKey,day,c.region)).update("AWS4-HMAC-SHA256\n"+now+"\n"+scope+"\n"+hex(canonical)).digest("hex");
  const auth="AWS4-HMAC-SHA256 Credential="+c.accessKey+"/"+scope+", SignedHeaders="+signed+", Signature="+sig;
  const r=await fetch(u.origin+path,{method:"PUT",headers:{"Content-Type":type,"Host":host,"x-amz-content-sha256":payloadHash,"x-amz-date":now,"Authorization":auth},body:payload});
  return r.ok?{ok:true,key}:{ok:false,status:r.status,error:(await r.text()).slice(0,240)};
}
async function archiveReports(hid){
  const results={json:0,pdf:0,failed:0,configured:true};
  if(!archiveConfig().endpoint||!archiveConfig().accessKey||!archiveConfig().secretKey){results.configured=false;return results;}
  const stamp=new Date().toISOString().slice(0,10);
  const [analytics,insights,audit]=await Promise.all([
    db.query("SELECT appointment_date::date AS day,count(*)::int appointments,count(*) FILTER(WHERE status='completed')::int completed,count(*) FILTER(WHERE status='no_show')::int no_shows FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-29 AND appointment_date<=current_date GROUP BY 1 ORDER BY 1",[hid]),
    db.query("SELECT count(*)::int appointments,count(*) FILTER(WHERE status='completed')::int completed,count(*) FILTER(WHERE status='no_show')::int no_shows,count(*) FILTER(WHERE status='cancelled')::int cancelled FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-29 AND appointment_date<=current_date",[hid]),
    db.query("SELECT id,actor,action,entity_type,entity_id,details,created_at FROM audit_logs WHERE hospital_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200",[hid])
  ]);
  for(const [name,data] of [["analytics",{period_days:30,daily:analytics.rows}],["operations",{period_days:30,summary:insights.rows[0]||{}}],["audit",{events:audit.rows}]]){
    const r=await archiveObject(`hospitals/${hid}/reports/${stamp}/${name}.json`,data,"application/json");
    if(r.ok)results.json++;else results.failed++;
  }
  const invoices=await db.query("SELECT i.id,i.invoice_number FROM invoices i WHERE i.hospital_id=$1 ORDER BY i.created_at DESC,i.id DESC LIMIT 20",[hid]);
  for(const inv of invoices.rows){
    try{
      const q=await db.query("SELECT i.*,p.name patient_name,p.uhid,p.phone,h.name hospital_name,h.phone hospital_phone,h.address hospital_address FROM invoices i JOIN patients p ON p.id=i.patient_id JOIN hospitals h ON h.id=i.hospital_id WHERE i.id=$1 AND i.hospital_id=$2",[inv.id,hid]);
      const items=await db.query("SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id",[inv.id]);
      if(!q.rows[0])continue;
      const a=q.rows[0];
      const html='<!doctype html><html><body style="font-family:Arial;padding:32px"><h1>'+String(a.hospital_name||"CareFlow")+'</h1><h2>Invoice '+String(a.invoice_number)+'</h2><p>Patient: '+String(a.patient_name)+' · '+String(a.uhid||"")+'</p><table style="width:100%">'+items.rows.map(x=>'<tr><td>'+String(x.description)+'</td><td>'+x.quantity+'</td><td>'+Number(x.amount).toFixed(2)+'</td></tr>').join("")+'</table><h2>Total: '+Number(a.total).toFixed(2)+'</h2><p>Paid: '+Number(a.paid).toFixed(2)+' · Status: '+String(a.status)+'</p></body></html>';
      const pdf=await browser.pdf("data:text/html,"+encodeURIComponent(html));
      const r=await archiveObject(`hospitals/${hid}/invoices/${inv.id}/invoice.pdf`,Buffer.from(pdf),"application/pdf");
      if(r.ok)results.pdf++;else results.failed++;
    }catch(e){results.failed++;}
  }
  const prescriptionPatients=await db.query("SELECT DISTINCT m.patient_id FROM medications m WHERE m.hospital_id=$1 ORDER BY m.patient_id DESC LIMIT 20",[hid]);
  for(const patient of prescriptionPatients.rows){
    try{
      const p=await db.query("SELECT p.name,p.uhid,p.phone,h.name hospital_name,h.phone hospital_phone,h.address hospital_address FROM patients p JOIN hospitals h ON h.id=p.hospital_id WHERE p.id=$1 AND p.hospital_id=$2",[patient.patient_id,hid]);
      if(!p.rows[0])continue;
      const meds=await db.query("SELECT m.medicine_name,m.dose,m.frequency,m.duration,m.instructions,d.name doctor_name FROM medications m LEFT JOIN doctors d ON d.id=m.doctor_id WHERE m.patient_id=$1 AND m.hospital_id=$2 ORDER BY m.prescribed_at DESC LIMIT 20",[patient.patient_id,hid]);
      const a=p.rows[0];
      const html='<!doctype html><html><body style="font-family:Arial;padding:32px"><h1>'+String(a.hospital_name||"CareFlow")+'</h1><h2>Prescription</h2><p>Patient: '+String(a.name)+' · '+String(a.uhid||"")+'</p><table style="width:100%"><tr><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr>'+meds.rows.map(x=>'<tr><td>'+String(x.medicine_name)+'</td><td>'+String(x.dose||"")+'</td><td>'+String(x.frequency||"")+'</td><td>'+String(x.duration||"")+'</td><td>'+String(x.instructions||"")+'</td></tr>').join("")+'</table><p>Prescription decisions remain with the treating clinician.</p></body></html>';
      const pdf=await browser.pdf("data:text/html,"+encodeURIComponent(html));
      const r=await archiveObject(`hospitals/${hid}/prescriptions/patient-${patient.patient_id}/latest.pdf`,Buffer.from(pdf),"application/pdf");
      if(r.ok)results.pdf++;else results.failed++;
    }catch(e){results.failed++;}
  }
  const labs=await db.query("SELECT l.id FROM lab_orders l WHERE l.hospital_id=$1 ORDER BY l.ordered_at DESC,l.id DESC LIMIT 20",[hid]);
  for(const lab of labs.rows){
    try{
      const q=await db.query("SELECT l.*,p.name patient_name,p.uhid,d.name doctor_name,h.name hospital_name,h.phone hospital_phone,h.address hospital_address FROM lab_orders l JOIN patients p ON p.id=l.patient_id LEFT JOIN doctors d ON d.id=l.doctor_id JOIN hospitals h ON h.id=l.hospital_id WHERE l.id=$1 AND l.hospital_id=$2",[lab.id,hid]);
      if(!q.rows[0])continue;
      const a=q.rows[0];
      const html='<!doctype html><html><body style="font-family:Arial;padding:32px"><h1>'+String(a.hospital_name||"CareFlow")+'</h1><h2>Lab Report</h2><p>Patient: '+String(a.patient_name)+' · '+String(a.uhid||"")+'</p><p>Test: '+String(a.test_name)+' · Status: '+String(a.status)+'</p><h3>Result</h3><p>'+String(a.result_summary||"Result pending")+'</p></body></html>';
      const pdf=await browser.pdf("data:text/html,"+encodeURIComponent(html));
      const r=await archiveObject(`hospitals/${hid}/lab-reports/${lab.id}/report.pdf`,Buffer.from(pdf),"application/pdf");
      if(r.ok)results.pdf++;else results.failed++;
    }catch(e){results.failed++;}
  }
  return results;
}

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
  const hospitals=await db.query("SELECT id FROM hospitals ORDER BY id");
  const archive=[];
  for(const hospital of hospitals.rows){
    try{ archive.push({hospital_id:hospital.id,...await archiveReports(hospital.id)}); }
    catch(e){ archive.push({hospital_id:hospital.id,ok:false,error:String(e?.message||e).slice(0,240)}); }
  }
  res.json({ok:true,sent,failed,queued:upcoming.rows.length,archive});
}