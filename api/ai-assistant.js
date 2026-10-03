import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { litellmToolLoop } from "../lib/llm.js";
import { TOOLS, runTool } from "../lib/ai-agent-tools.js";
export const access = "user";
export const methods = ["GET","POST"];

async function getConversation(hid,sid){
  const r=await db.query("INSERT INTO ai_assistant_conversations(hospital_id,staff_id) VALUES($1,$2) ON CONFLICT(hospital_id,staff_id) DO UPDATE SET updated_at=now() RETURNING id",[hid,sid]);
  return r.rows[0].id;
}

async function hospitalContext(hid){
  const h=await db.query("SELECT id,name,phone,address FROM hospitals WHERE id=$1",[hid]);
  if(!h.rows[0])return null;
  const [doctors,faqs,today,followups]=await Promise.all([
    db.query("SELECT name,specialty,consultation_fee,active FROM doctors WHERE hospital_id=$1 AND active=true ORDER BY name",[hid]),
    db.query("SELECT question,answer FROM hospital_faqs WHERE hospital_id=$1 AND active=true ORDER BY id LIMIT 50",[hid]),
    db.query("SELECT count(*)::int AS n FROM appointments WHERE hospital_id=$1 AND appointment_date=current_date AND status <> 'cancelled'",[hid]),
    db.query("SELECT count(*)::int AS n FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due'",[hid])
  ]);
  return {hospital:h.rows[0],doctors:doctors.rows,faqs:faqs.rows,todayAppointments:today.rows[0].n,followupsDue:followups.rows[0].n};
}

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.ai.use");
  if(!ctx)return;
  if(!ctx.hospitalId||!ctx.staff.id)return res.status(400).json({error:"Hospital setup is required"});

  const conversationId=await getConversation(ctx.hospitalId,ctx.staff.id);

  if(req.method==="GET"){
    const r=await db.query("SELECT id,role,body,created_at FROM ai_assistant_messages WHERE conversation_id=$1 ORDER BY id ASC",[conversationId]);
    return res.json({conversation_id:conversationId,messages:r.rows});
  }

  const q=String((req.body||{}).question||"").trim();
  if(!q)return res.status(400).json({error:"Question is required"});
  await db.query("INSERT INTO ai_assistant_messages(conversation_id,role,body) VALUES($1,'user',$2)",[conversationId,q]);

  const history=await db.query("SELECT role,body FROM ai_assistant_messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 10",[conversationId]);
  const recent=history.rows.reverse().map(x=>({role:x.role==="assistant"?"assistant":"user",content:String(x.body||"")}));

  const system="You are CareFlow's staff hospital assistant. You may use the declared read-only CareFlow tools to retrieve current operational information. Never diagnose, prescribe, interpret medical reports, or make clinical treatment decisions. Never invent patient, queue, appointment, billing or admission data. Before answering, use the appropriate tool when the question asks for current hospital data. Explain when a requested action requires a normal CareFlow workflow because no safe mutation tool is available. Keep answers concise and practical.";

  try{
    const result=await litellmToolLoop({
      system,
      messages:recent,
      tools:TOOLS,
      execute:(name,input)=>runTool(name,input,ctx.hospitalId),
      maxTokens:700,
      temperature:0.1,
      maxIterations:5
    });
    const finalAnswer=result.answer||"I could not generate a response.";
    await db.query("INSERT INTO ai_assistant_messages(conversation_id,role,body) VALUES($1,'assistant',$2)",[conversationId,finalAnswer]);
    await db.query("UPDATE ai_assistant_conversations SET updated_at=now() WHERE id=$1",[conversationId]);
    return res.json({answer:finalAnswer,agent:true,tool_iterations:result.iterations||1,available_tools:TOOLS.map(t=>t.name)});
  }catch(e){
    return res.status(502).json({error:e.message||"AI assistant failed"});
  }
}