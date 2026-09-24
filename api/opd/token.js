import { db } from "../../lib/db.js";
export const access="public";
export const methods=["GET"];

function minutesBetween(a,b){if(!a)return 0;return Math.max(0,Math.round((new Date(b||Date.now())-new Date(a))/60000))}
function estimateMinutes(minutes){const total=Math.max(0,Math.round(Number(minutes)||0));if(total===0)return {min:0,max:0};return {min:Math.max(3,Math.round(total*0.85)),max:Math.max(5,Math.round(total*1.25))}}

export default async function(req,res){
  const token=String(req.query?.token||"").trim();
  if(!token)return res.status(400).json({error:"Token link is missing"});
  const q=await db.query("SELECT q.id,q.hospital_id,q.patient_id,q.token,q.token_date,q.token_number,q.stage,q.priority,q.checked_in_at,q.started_at,p.name AS patient_name,p.uhid,d.id AS doctor_id,d.name AS doctor_name,d.specialty,d.display_room,h.name AS hospital_name,h.phone AS hospital_phone,h.address AS hospital_address FROM queue_entries q JOIN patients p ON p.id=q.patient_id JOIN hospitals h ON h.id=q.hospital_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.public_token=$1 LIMIT 1",[token]);
  if(!q.rows[0])return res.status(404).json({error:"Token link is invalid or expired"});
  const row=q.rows[0];
  const [ahead,duration,currentVisit,events,care]=await Promise.all([
    db.query("SELECT COUNT(*)::int AS n FROM queue_entries WHERE hospital_id=$1 AND token_date=$2 AND doctor_id=$3 AND completed_at IS NULL AND token_number<$4 AND stage IN ('waiting','vitals','doctor')",[row.hospital_id,row.token_date,row.doctor_id,row.token_number]),
    db.query("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ended_at-started_at))/60.0) AS median_minutes FROM doctor_visits WHERE hospital_id=$1 AND doctor_id=$2 AND visit_status='completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL AND ended_at>started_at AND ended_at-started_at BETWEEN interval '3 minutes' AND interval '90 minutes'",[row.hospital_id,row.doctor_id]),
    db.query("SELECT q.token,q.started_at,dv.started_at AS visit_started_at FROM queue_entries q LEFT JOIN doctor_visits dv ON dv.queue_entry_id=q.id AND dv.visit_status='open' WHERE q.hospital_id=$1 AND q.doctor_id=$2 AND q.token_date=$3 AND q.stage='doctor' AND q.completed_at IS NULL ORDER BY q.token_number LIMIT 1",[row.hospital_id,row.doctor_id,row.token_date]),
    db.query("SELECT event_type,stage,created_at FROM workflow_events WHERE hospital_id=$1 AND patient_id=$2 AND metadata->>'token'=$3 ORDER BY created_at ASC,id ASC LIMIT 50",[row.hospital_id,row.patient_id,row.token]),
    db.query("SELECT (SELECT count(*)::int FROM lab_orders WHERE hospital_id=$1 AND patient_id=$2 AND encounter_id=(SELECT encounter_id FROM queue_entries WHERE id=$3)) AS labs,(SELECT count(*)::int FROM medications WHERE hospital_id=$1 AND patient_id=$2 AND encounter_id=(SELECT encounter_id FROM queue_entries WHERE id=$3)) AS medicines,(SELECT count(*)::int FROM invoices WHERE hospital_id=$1 AND patient_id=$2 AND status IN ('unpaid','partial')) AS unpaid_invoices",[row.hospital_id,row.patient_id,row.id])
  ]);
  const base=Math.max(8,Math.round(Number(duration.rows[0]?.median_minutes)||15)),aheadCount=Number(ahead.rows[0]?.n)||0,current=currentVisit.rows[0]&&currentVisit.rows[0].token!==row.token?currentVisit.rows[0]:null;
  let wait=0;if(row.stage!=="doctor"){wait=aheadCount*base;if(current)wait+=Math.max(0,base-minutesBetween(current.visit_started_at||current.started_at));if(row.stage==="waiting")wait+=5}
  const est=estimateMinutes(wait);
  let nextAction="Please remain in the waiting area.",title="Waiting";
  if(row.stage==="vitals"){title="Vitals";nextAction="Please proceed to the vitals counter when called."}
  else if(row.stage==="doctor"){title="Doctor consultation";nextAction=row.doctor_name?"Please proceed to "+row.doctor_name+(row.display_room?" · "+row.display_room:"")+".":"Please proceed to the doctor room."}
  else if(row.stage==="lab"){title="Laboratory";nextAction="Please proceed to the laboratory."}
  else if(row.stage==="followup"){title="Follow-up";nextAction="Please wait for the next instruction from staff."}
  else if(row.stage==="pharmacy"){title="Pharmacy";nextAction="Please proceed to the pharmacy."}
  else if(row.stage==="completed"){title="Completed";nextAction="Your OPD visit is complete."}
  const careRow=care.rows[0]||{},stages=["registered","waiting","vitals","doctor"];
  if(Number(careRow.labs)>0)stages.push("lab","doctor_review");
  if(Number(careRow.medicines)>0)stages.push("pharmacy");
  if(Number(careRow.unpaid_invoices)>0)stages.push("payment");
  stages.push("completed");
  const idx=Math.max(0,stages.indexOf(row.stage));
  res.json({hospital:{name:row.hospital_name,phone:row.hospital_phone,address:row.hospital_address},token:row.token,token_date:row.token_date,token_number:row.token_number,patient_name:String(row.patient_name||"").split(/\s+/)[0],uhid:row.uhid,doctor:{name:row.doctor_name,specialty:row.specialty,room:row.display_room},status:{stage:row.stage,title,next_action:nextAction},position:{patients_ahead:aheadCount,estimated_wait:row.stage==="doctor"?{min:0,max:0}:est},journey:stages.map((s,i)=>({stage:s,label:s.replace("_"," "),status:i<idx?"completed":i===idx?"current":"upcoming"})),events:events.rows});
}