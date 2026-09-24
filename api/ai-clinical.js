import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { litellmChat } from "../lib/llm.js";

export const access = "user";
export const methods = ["POST"];

function cleanText(v, max=8000){ return String(v||"").trim().slice(0,max); }

async function patientContext(hospitalId, patientId){
  const [p,visits,meds,vitals,labs,followups] = await Promise.all([
    db.query("SELECT id,uhid,name,phone,email,date_of_birth,status,notes FROM patients WHERE id=$1 AND hospital_id=$2 LIMIT 1",[patientId,hospitalId]),
    db.query("SELECT id,doctor_name,started_at,clinical_notes,visit_status FROM doctor_visits WHERE patient_id=$1 AND hospital_id=$2 ORDER BY started_at DESC LIMIT 8",[patientId,hospitalId]),
    db.query("SELECT id,medicine_name,dose,frequency,duration,instructions,created_at,dispense_status FROM medications WHERE patient_id=$1 AND hospital_id=$2 ORDER BY created_at DESC LIMIT 12",[patientId,hospitalId]),
    db.query("SELECT id,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes,recorded_at FROM vitals WHERE patient_id=$1 AND hospital_id=$2 ORDER BY recorded_at DESC LIMIT 8",[patientId,hospitalId]),
    db.query("SELECT id,test_name,status,result_summary,ordered_at,completed_at FROM lab_orders WHERE patient_id=$1 AND hospital_id=$2 ORDER BY ordered_at DESC LIMIT 10",[patientId,hospitalId]),
    db.query("SELECT id,doctor_name,due_date,status,reason,notes,consultation_type FROM followups WHERE patient_id=$1 AND hospital_id=$2 ORDER BY due_date DESC LIMIT 8",[patientId,hospitalId])
  ]);
  return {patient:p.rows[0]||null,visits:visits.rows,medications:meds.rows,vitals:vitals.rows,lab_orders:labs.rows,followups:followups.rows};
}

function contextPrompt(ctx){
  return JSON.stringify(ctx);
}

export default async function(req,res){
  const body=req.body||{};
  const action=String(body.action||"summary");
  if(!["summary","ask","scribe"].includes(action)) return res.status(400).json({error:"Unsupported clinical AI action"});

  const permission=action==="scribe"?"action.clinical.write":"action.clinical.view";
  const auth=await requirePermission(req,res,permission);
  if(!auth)return;

  try{
    if(action==="scribe"){
      const transcript=cleanText(body.transcript,12000);
      if(!transcript)return res.status(400).json({error:"Consultation text is required"});
      const system=`You are CareFlow's clinical documentation assistant. Convert the clinician's own consultation dictation into a structured draft. Do not diagnose, invent findings, invent vitals, invent medicines, or add treatment recommendations. Preserve uncertainty and attribution. If something was not stated, leave it blank. This is documentation support only and must be reviewed by a qualified clinician before saving. Return ONLY valid JSON with keys: chief_complaint, history, examination, assessment, plan, instructions, follow_up. Values must be concise strings.`;
      const user=`Clinician dictation:\n${transcript}\n\nReturn the structured documentation draft.`;
      const text=await litellmChat({system,user,maxTokens:900,temperature:0.1});
      let draft;
      try{draft=JSON.parse(text)}catch(e){draft={assessment:"",raw_draft:text}};
      return res.json({draft});
    }

    const patientId=Number(body.patient_id);
    if(!patientId)return res.status(400).json({error:"patient_id is required"});
    const ctx=await patientContext(auth.hospitalId,patientId);
    if(!ctx.patient)return res.status(404).json({error:"Patient not found"});

    if(action==="summary"){
      const system=`You are CareFlow's clinical documentation assistant. Summarize supplied patient records for a qualified clinician. Do not diagnose, infer diseases, recommend treatment, or fill gaps with assumptions. Clearly distinguish documented facts from missing information. Mention recent visits, medications, vitals, investigations and follow-ups. Keep it concise and clinically useful. This is decision-support documentation, not medical advice.`;
      const user=`Patient record:\n${contextPrompt(ctx)}\n\nProduce a concise clinician-facing summary with these headings: Patient, Recent history, Current/recent medicines, Recent vitals, Investigations, Follow-up, Review items.`;
      const answer=await litellmChat({system,user,maxTokens:800,temperature:0.15});
      return res.json({answer,patient_id:patientId});
    }

    const question=cleanText(body.question,2000);
    if(!question)return res.status(400).json({error:"Question is required"});
    const system=`You are CareFlow's patient-record assistant for qualified clinical staff. Answer ONLY from the supplied patient record. Do not diagnose, prescribe, recommend treatment, interpret test results, or infer facts not present. If the record does not contain the answer, say so. Keep answers concise and cite the relevant record category/date in plain language where possible.`;
    const user=`Patient record:\n${contextPrompt(ctx)}\n\nClinician question: ${question}`;
    const answer=await litellmChat({system,user,maxTokens:500,temperature:0.1});
    return res.json({answer,patient_id:patientId});
  }catch(e){
    res.status(502).json({error:e.message||"Clinical AI failed"});
  }
}