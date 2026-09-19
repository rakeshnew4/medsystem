import { db, ai } from "hatchable";
export const access = "public";
export const methods = ["GET","POST"];

async function reply(to,text){
  const base=process.env.WHATSAPP_GRAPH_URL,token=process.env.WHATSAPP_ACCESS_TOKEN,phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  if(!base||!token||!phoneId) return;
  await fetch(base.replace(/\/$/,"")+"/"+phoneId+"/messages",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{body:text}})});
}
export default async function(req,res){
  if(req.method==="GET"){
    const q=req.query||{};
    const verify=q["hub.verify_token"];
    if(verify && verify===process.env.WHATSAPP_VERIFY_TOKEN) return res.send(q["hub.challenge"]||"");
    return res.status(403).send("forbidden");
  }
  const body=req.body||{};
  const msg=body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if(!msg) return res.json({ok:true});
  const from=msg.from;
  const text=msg.text?.body?.trim();
  if(!from||!text) return res.json({ok:true});
  const h=await db.query("SELECT id,name FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.json({ok:true});
  const hid=h.rows[0].id;
  let patient=await db.query("SELECT id,name,whatsapp_opt_in FROM patients WHERE hospital_id=$1 AND (whatsapp_phone=$2 OR phone=$2) ORDER BY id LIMIT 1",[hid,from]);
  if(!patient.rows[0]){
    const p=await db.query("INSERT INTO patients(hospital_id,name,whatsapp_phone,whatsapp_opt_in) VALUES($1,$2,$3,true) RETURNING id,name",[hid,"WhatsApp visitor",from]);
    patient=p;
  }
  const p=patient.rows[0];
  if(!p.whatsapp_opt_in) await db.query("UPDATE patients SET whatsapp_opt_in=true,updated_at=now() WHERE id=$1",[p.id]);
  const [doctors,faqs]=await Promise.all([
    db.query("SELECT name,specialty,consultation_fee FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[hid]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true",[hid])
  ]);
  const prompt=`You are a WhatsApp administrative receptionist for ${h.rows[0].name}. Answer only administrative questions using the supplied doctors and FAQs. Help users understand how to book; do not make a booking from free text. Do not diagnose, prescribe, interpret medical reports, or give treatment advice. For clinical questions, direct them to a qualified clinician or emergency service. Doctors: ${JSON.stringify(doctors.rows)} FAQs: ${JSON.stringify(faqs.rows)} User: ${text}`;
  const result=await ai.generateText({model:"gpt",purpose:"whatsapp-hospital-reception",prompt,maxTokens:300});
  await db.query("INSERT INTO conversations(hospital_id,patient_id,channel,status) VALUES($1,$2,'whatsapp','open')",[hid,p.id]);
  await reply(from,result.text||"Please contact hospital reception.");
  res.json({ok:true});
}