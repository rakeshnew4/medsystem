import { db, ai } from "hatchable";
export const access = "public";
export const methods = ["POST"];

export default async function(req,res){
  const q=String((req.body||{}).question||"").trim();
  if(!q) return res.status(400).json({error:"Question is required"});
  const h=await db.query("SELECT id,name,phone,address FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Hospital is not configured"});
  const hid=h.rows[0].id;
  const [doctors,faqs]=await Promise.all([
    db.query("SELECT name,specialty,consultation_fee FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[hid]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id",[hid])
  ]);
  const prompt=`You are the public administrative assistant for a hospital. Only answer administrative questions using the supplied information. You may help with appointments, doctor information, hospital information and FAQs. Do NOT diagnose, prescribe, recommend treatment, interpret medical reports, or give clinical decisions. For medical symptoms or emergencies, tell the person to contact a qualified clinician or emergency service. Hospital: ${JSON.stringify(h.rows[0])}. Doctors: ${JSON.stringify(doctors.rows)}. FAQs: ${JSON.stringify(faqs.rows)}. Visitor question: ${q}`;
  const result=await ai.generateText({model:"gpt",purpose:"public-hospital-assistant",prompt,maxTokens:400});
  res.json({answer:result.text||"Please contact the hospital reception for assistance."});
}