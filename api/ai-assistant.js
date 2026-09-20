import { db, ai } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access = "user";
export const methods = ["POST"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.ai.use");
  if(!ctx)return;
  const q=String((req.body||{}).question||"").trim();
  if(!q) return res.status(400).json({error:"Question is required"});
  const h=await db.query("SELECT id,name,phone,address FROM hospitals ORDER BY id LIMIT 1");
  if(!h.rows[0]) return res.status(400).json({error:"Set up the hospital first"});
  const hid=h.rows[0].id;
  const [doctors,faqs,today,followups]=await Promise.all([
    db.query("SELECT name,specialty,consultation_fee,active FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[hid]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id LIMIT 50",[hid]),
    db.query("SELECT count(*)::int AS n FROM appointments WHERE hospital_id=$1 AND appointment_date=current_date AND status <> 'cancelled'",[hid]),
    db.query("SELECT count(*)::int AS n FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due'",[hid])
  ]);
  const prompt = `You are the administrative AI assistant for a small hospital. Do not diagnose, prescribe, interpret clinical reports, or provide treatment decisions. If asked for clinical advice, say a qualified clinician should help. Answer using only the supplied hospital information and operational data. Hospital: ${JSON.stringify(h.rows[0])}. Doctors: ${JSON.stringify(doctors.rows)}. FAQs: ${JSON.stringify(faqs.rows)}. Today's appointments: ${today.rows[0].n}. Follow-ups due: ${followups.rows[0].n}. Staff question: ${q}`;
  const result=await ai.generateText({model:"gpt",purpose:"hospital-admin-assistant",prompt,maxTokens:500});
  res.json({answer:result.text||"I could not generate a response."});
}