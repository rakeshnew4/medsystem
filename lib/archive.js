import crypto from "node:crypto";
import { browser } from "hatchable";
import { db } from "./db.js";

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

export async function archiveReports(hid){
  const results={json:0,pdf:0,failed:0,configured:true};
  if(!archiveConfig().endpoint||!archiveConfig().accessKey||!archiveConfig().secretKey){results.configured=false;return results;}
  const stamp=new Date().toISOString().slice(0,10);
  const [analytics,insights,audit,billingAudit,adminInsights,assetTransfers,assetRegister,assetWarranty,assetAmc]=await Promise.all([
    db.query("SELECT appointment_date::date AS day,count(*)::int appointments,count(*) FILTER (WHERE status='completed')::int completed,count(*) FILTER (WHERE status='no_show')::int no_shows FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-29 AND appointment_date<=current_date GROUP BY 1 ORDER BY 1",[hid]),
    db.query("SELECT count(*)::int appointments,count(*) FILTER (WHERE status='completed')::int completed,count(*) FILTER (WHERE status='no_show')::int no_shows,count(*) FILTER (WHERE status='cancelled')::int cancelled FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-29 AND appointment_date<=current_date",[hid]),
    db.query("SELECT id,actor,action,entity_type,entity_id,details,created_at FROM audit_logs WHERE hospital_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200",[hid]),
    db.query("SELECT id,actor,action,entity_type,entity_id,details,created_at FROM audit_logs WHERE hospital_id=$1 AND (entity_type='invoice' OR action ILIKE 'payment%' OR action ILIKE 'invoice%') ORDER BY created_at DESC,id DESC LIMIT 500",[hid]),
    db.query("SELECT appointment_date::date AS day,count(*)::int appointments,count(*) FILTER (WHERE status='completed')::int completed,count(*) FILTER (WHERE status='no_show')::int no_shows,count(*) FILTER (WHERE status='cancelled')::int cancelled FROM appointments WHERE hospital_id=$1 AND appointment_date>=current_date-29 AND appointment_date<=current_date GROUP BY 1 ORDER BY 1",[hid]),
    db.query("SELECT t.id,t.asset_id,a.asset_code,a.description,a.category,t.from_location,t.to_location,t.from_custodian_staff_id,t.to_custodian_staff_id,t.reason,t.transferred_by,t.transferred_at FROM fixed_asset_transfers t JOIN fixed_assets a ON a.id=t.asset_id AND a.hospital_id=t.hospital_id WHERE t.hospital_id=$1 ORDER BY t.transferred_at DESC,t.id DESC LIMIT 2000",[hid]),
    db.query("SELECT id,asset_code,description,category,serial_number,purchase_date,purchase_price,depreciation_method,depreciation_rate,useful_life_years,current_value,location,status FROM fixed_assets WHERE hospital_id=$1 ORDER BY purchase_date NULLS LAST,asset_code LIMIT 2000",[hid]),
    db.query("SELECT id,asset_code,description,category,serial_number,location,status,purchase_price,current_value,warranty_expiry AS expiry_date FROM fixed_assets WHERE hospital_id=$1 AND warranty_expiry IS NOT NULL ORDER BY warranty_expiry,asset_code LIMIT 1000",[hid]),
    db.query("SELECT id,asset_code,description,category,serial_number,location,status,purchase_price,current_value,amc_expiry AS expiry_date FROM fixed_assets WHERE hospital_id=$1 AND amc_expiry IS NOT NULL ORDER BY amc_expiry,asset_code LIMIT 1000",[hid])
  ]);
  for(const [name,data] of [
    ["analytics",{period_days:30,daily:analytics.rows}],
    ["operations",{period_days:30,summary:insights.rows[0]||{}}],
    ["audit",{events:audit.rows}],
    ["billing-audit",{events:billingAudit.rows}],
    ["admin-insights",{period_days:30,daily:adminInsights.rows}],
    ["fixed-asset-transfers",{total:assetTransfers.rows.length,transfers:assetTransfers.rows}],
    ["fixed-asset-register",{total:assetRegister.rows.length,assets:assetRegister.rows}],
    ["fixed-asset-warranty",{total:assetWarranty.rows.length,assets:assetWarranty.rows}],
    ["fixed-asset-amc",{total:assetAmc.rows.length,assets:assetAmc.rows}]
  ]){
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