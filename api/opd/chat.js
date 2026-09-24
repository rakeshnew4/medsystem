import { db } from "../../lib/db.js";
import { litellmChat } from "../../lib/llm.js";
export const access="public";
export const methods=["POST"];

export default async function(req,res){
  const q=String((req.body||{}).question||"").trim();
  const slug=String((req.body||{}).slug||"").trim().toLowerCase();
  if(!q)return res.status(400).json({error:"Question is required"});
  const h=slug?await db.query("SELECT id,name,phone,address FROM hospitals WHERE public_slug=$1 LIMIT 1",[slug]):await db.query("SELECT id,name,phone,address FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0])return res.status(400).json({error:"Hospital is not configured"});
  const [doctors,faqs]=await Promise.all([db.query("SELECT name,specialty,consultation_fee FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[h.rows[0].id]),db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id",[h.rows[0].id])]);
  const prompt=`You are the public administrative assistant for a hospital. Only answer administrative questions using the supplied information. You may help with appointments, doctor information, hospital information and FAQs. Do NOT diagnose, prescribe, recommend treatment, interpret medical reports, or give clinical decisions. For medical symptoms or emergencies, tell the person to contact a qualified clinician or emergency service. Hospital: ${JSON.stringify(h.rows[0])}. Doctors: ${JSON.stringify(doctors.rows)}. FAQs: ${JSON.stringify(faqs.rows)}. Visitor question: ${q}`;
  try{const answer=await litellmChat({system:"You are CareFlow's public hospital administrative assistant. Only answer administrative questions from supplied hospital information. Never diagnose, prescribe, interpret medical reports, or recommend treatment. For symptoms or emergencies, direct the person to a qualified clinician or emergency service. Keep answers concise.",user:prompt,maxTokens:400});res.json({answer:answer||"Please contact the hospital reception for assistance."});}
  catch(e){res.status(502).json({error:e.message||"AI assistant unavailable"});}
}