import { requirePermission } from "../lib/authz.js";
import { litellmChat } from "../lib/llm.js";
export const access="user";
export const methods=["POST"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.ai.use"); if(!ctx)return;
  const b=req.body||{};
  const kind=String(b.kind||"appointment_reminder");
  const allowed=["appointment_reminder","followup_reminder","missed_appointment"]; if(!allowed.includes(kind))return res.status(400).json({error:"Unsupported message type"});
  const input={kind,patient_name:String(b.patient_name||"Patient"),hospital_name:String(b.hospital_name||"Hospital"),doctor_name:String(b.doctor_name||"doctor"),date:String(b.date||""),time:String(b.time||"")};
  try{
    const text=await litellmChat({system:"You write short WhatsApp/SMS messages for a hospital reception team. Administrative communication only. Do not mention symptoms, diagnoses, medicines, results, or treatment. Be polite, clear, concise, and never invent details. Do not use markdown. Return only the message.",user:JSON.stringify(input),maxTokens:180,temperature:0.3});
    res.json({message:text});
  }catch(e){res.status(502).json({error:e.message||"AI message draft failed"});}
}