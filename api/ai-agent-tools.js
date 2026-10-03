import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";

export const access="user";
export const methods=["GET","POST"];

/*
 * CareFlow AI Agent Tool Registry
 * -------------------------------
 * Read-only tools are intentionally implemented first. Each tool executes a
 * hospital-scoped server-side function instead of asking the model to invent
 * SQL or call arbitrary URLs. Write/mutation tools should be added only after
 * their existing API contract, permission and idempotency behavior are verified.
 */

const TOOLS=[
  {name:"get_hospital_overview",description:"Get current aggregate hospital operations metrics for the signed-in staff member's hospital.",permission:"page.dashboard",input:{type:"object",properties:{},additionalProperties:false},readOnly:true},
  {name:"search_patients",description:"Search hospital patients by name, phone, UHID or identity number. Returns a small operational list.",permission:"page.patients",input:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false},readOnly:true},
  {name:"get_patient_workspace",description:"Retrieve the hospital-scoped Patient Workspace context for one patient.",permission:"page.patients",input:{type:"object",properties:{patient_id:{type:"integer"}},required:["patient_id"],additionalProperties:false},readOnly:true},
  {name:"get_queue",description:"Get today's active OPD queue with stage, priority, token and patient context.",permission:"page.queue",input:{type:"object",properties:{stage:{type:"string"}},additionalProperties:false},readOnly:true},
  {name:"get_appointments",description:"Get hospital appointments with patient, doctor and active queue context.",permission:"page.appointments",input:{type:"object",properties:{date:{type:"string"}},additionalProperties:false},readOnly:true},
  {name:"get_due_followups",description:"Get follow-ups currently due for the hospital.",permission:"page.followups",input:{type:"object",properties:{limit:{type:"integer"}},additionalProperties:false},readOnly:true},
  {name:"get_ipd_census",description:"Get the active inpatient census with patient, ward/bed, admitting doctor and open encounter context.",permission:"page.beds",input:{type:"object",properties:{ward:{type:"string"},limit:{type:"integer"}},additionalProperties:false},readOnly:true},
  {name:"get_billing_summary",description:"Get aggregate billing totals and recent invoice status for the hospital; does not expose legacy ledger repair or mutation controls.",permission:"page.billing",input:{type:"object",properties:{days:{type:"integer"}},additionalProperties:false},readOnly:true}
];

function cleanInt(v,def,min,max){const n=Number(v);return Number.isInteger(n)?Math.max(min,Math.min(max,n)):def;}
function cleanText(v,max=120){return String(v??"").trim().slice(0,max);}

async function runTool(name,input,hid){
  if(name==="get_hospital_overview"){
    const [patients,queue,appointments,followups,staff]=await Promise.all([
      db.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='active')::int active FROM patients WHERE hospital_id=$1",[hid]),
      db.query("SELECT count(*) FILTER(WHERE completed_at IS NULL)::int active,count(*) FILTER(WHERE completed_at IS NULL AND stage='waiting')::int waiting,count(*) FILTER(WHERE completed_at IS NULL AND stage='vitals')::int vitals,count(*) FILTER(WHERE completed_at IS NULL AND stage='doctor')::int doctor_room,count(*) FILTER(WHERE completed_at IS NULL AND stage='lab')::int lab,count(*) FILTER(WHERE completed_at IS NULL AND stage='pharmacy')::int pharmacy FROM queue_entries WHERE hospital_id=$1 AND token_date=current_date",[hid]),
      db.query("SELECT count(*)::int n FROM appointments WHERE hospital_id=$1 AND appointment_date=current_date AND status<>'cancelled'",[hid]),
      db.query("SELECT count(*)::int n FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due'",[hid]),
      db.query("SELECT count(*)::int n FROM staff_profiles WHERE hospital_id=$1 AND active=true",[hid])
    ]);
    return {patients:patients.rows[0],today_queue:queue.rows[0],today_appointments:appointments.rows[0].n,followups_due:followups.rows[0].n,active_staff:staff.rows[0].n};
  }
  if(name==="search_patients"){
    const q=cleanText(input.query);
    if(!q)return {patients:[]};
    const r=await db.query(`SELECT p.id,p.name,p.uhid,p.phone,p.email,p.date_of_birth,p.status
      FROM patients p LEFT JOIN patient_identity pi ON pi.patient_id=p.id AND pi.hospital_id=p.hospital_id
      WHERE p.hospital_id=$1 AND (LOWER(p.name) LIKE LOWER($2) OR COALESCE(p.phone,'') LIKE $2 OR COALESCE(p.uhid,'') ILIKE $2 OR LOWER(COALESCE(pi.nic_passport,'')) LIKE LOWER($2))
      ORDER BY p.created_at DESC LIMIT 20`,[hid,"%"+q+"%"]);
    return {patients:r.rows};
  }
  if(name==="get_patient_workspace"){
    const id=Number(input.patient_id);
    if(!Number.isInteger(id)||id<=0)throw new Error("patient_id must be a positive integer");
    const p=await db.query("SELECT id,name,uhid,phone,email,date_of_birth,status,notes FROM patients WHERE id=$1 AND hospital_id=$2 LIMIT 1",[id,hid]);
    if(!p.rows[0])throw new Error("Patient not found");
    const [visits,vitals,labs,meds,followups]=await Promise.all([
      db.query("SELECT id,doctor_name,started_at,clinical_notes,visit_status FROM doctor_visits WHERE patient_id=$1 AND hospital_id=$2 ORDER BY started_at DESC LIMIT 8",[id,hid]),
      db.query("SELECT id,blood_pressure_systolic,blood_pressure_diastolic,pulse,temperature,weight_kg,height_cm,spo2,respiratory_rate,notes,recorded_at FROM vitals WHERE patient_id=$1 AND hospital_id=$2 ORDER BY recorded_at DESC LIMIT 8",[id,hid]),
      db.query("SELECT id,test_name,status,result_summary,ordered_at,completed_at FROM lab_orders WHERE patient_id=$1 AND hospital_id=$2 ORDER BY ordered_at DESC LIMIT 10",[id,hid]),
      db.query("SELECT id,medicine_name,dose,frequency,duration,instructions,created_at,dispense_status FROM medications WHERE patient_id=$1 AND hospital_id=$2 ORDER BY created_at DESC LIMIT 12",[id,hid]),
      db.query("SELECT id,doctor_name,due_date,status,reason,notes,consultation_type FROM followups WHERE patient_id=$1 AND hospital_id=$2 ORDER BY due_date DESC LIMIT 8",[id,hid])
    ]);
    return {patient:p.rows[0],visits:visits.rows,vitals:vitals.rows,lab_orders:labs.rows,medications:meds.rows,followups:followups.rows};
  }
  if(name==="get_queue"){
    const stage=cleanText(input.stage,40);
    const where=stage?" AND q.stage=$2":"";
    const params=stage?[hid,stage]:[hid];
    const r=await db.query(`SELECT q.id,q.token,q.token_date,q.token_number,q.stage,q.priority,q.checked_in_at,q.patient_id,p.name AS patient_name,p.uhid,d.name AS doctor_name
      FROM queue_entries q JOIN patients p ON p.id=q.patient_id
      LEFT JOIN doctors d ON d.id=q.doctor_id
      WHERE q.hospital_id=$1 AND q.completed_at IS NULL AND q.token_date=current_date${where}
      ORDER BY CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.token_number NULLS LAST,q.checked_in_at,q.id LIMIT 300`,params);
    return {queue:r.rows};
  }
  if(name==="get_appointments"){
    const date=cleanText(input.date,20);
    const filter=date?" AND a.appointment_date=$2":" AND a.appointment_date=current_date";
    const params=date?[hid,date]:[hid];
    const r=await db.query(`SELECT a.id,a.appointment_date,a.appointment_time,a.status,a.patient_id,a.doctor_id,a.reason,a.consultation_type,p.name AS patient_name,p.uhid,p.phone,d.name AS doctor_name,q.token,q.stage AS queue_stage
      FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id
      LEFT JOIN LATERAL (SELECT q.token,q.stage FROM queue_entries q WHERE q.hospital_id=a.hospital_id AND q.appointment_id=a.id AND q.completed_at IS NULL ORDER BY q.id DESC LIMIT 1) q ON true
      WHERE a.hospital_id=$1${filter} ORDER BY a.appointment_date,a.appointment_time LIMIT 300`,params);
    return {appointments:r.rows};
  }
  if(name==="get_due_followups"){
    const limit=cleanInt(input.limit,50,1,100);
    const r=await db.query("SELECT id,patient_id,doctor_name,due_date,status,reason,notes,consultation_type FROM followups WHERE hospital_id=$1 AND due_date<=current_date AND status='due' ORDER BY due_date ASC,id ASC LIMIT $2",[hid,limit]);
    return {followups:r.rows};
  }
  if(name==="get_ipd_census"){
    const ward=cleanText(input.ward,80);
    const limit=cleanInt(input.limit,100,1,300);
    const filter=ward?" AND b.ward=$2":"";
    const params=ward?[hid,ward,limit]:[hid,limit];
    const limitParam=ward?"$3":"$2";
    const r=await db.query(`SELECT a.id AS admission_id,a.admission_number,a.admission_type,a.admitted_at,a.expected_discharge_date,
      a.patient_id,p.name AS patient_name,p.uhid,p.phone,p.date_of_birth,
      b.id AS bed_id,b.ward,b.bed_number,b.bed_type,b.status AS bed_status,
      d.id AS doctor_id,d.name AS doctor_name,
      ce.id AS encounter_id,ce.status AS encounter_status,ce.started_at AS encounter_started_at
      FROM admissions a
      JOIN patients p ON p.id=a.patient_id AND p.hospital_id=a.hospital_id
      LEFT JOIN beds b ON b.id=a.bed_id AND b.hospital_id=a.hospital_id
      LEFT JOIN doctors d ON d.id=a.admitting_doctor_id AND d.hospital_id=a.hospital_id
      LEFT JOIN LATERAL (SELECT id,status,started_at FROM care_encounters WHERE hospital_id=a.hospital_id AND admission_id=a.id ORDER BY id DESC LIMIT 1) ce ON true
      WHERE a.hospital_id=$1 AND a.discharged_at IS NULL${filter}
      ORDER BY b.ward NULLS LAST,b.bed_number NULLS LAST,a.admitted_at,a.id
      LIMIT ${limitParam}`,params);
    return {census:r.rows,count:r.rows.length,ward:ward||null};
  }
  if(name==="get_billing_summary"){
    const days=cleanInt(input.days,30,1,365);
    const r=await db.query(`SELECT count(*)::int invoice_count,coalesce(sum(total),0)::numeric total,coalesce(sum(paid),0)::numeric paid,coalesce(sum(total-paid),0)::numeric outstanding
      FROM invoices WHERE hospital_id=$1 AND created_at>=current_date-($2::int)`,[hid,days]);
    const status=await db.query("SELECT status,count(*)::int count FROM invoices WHERE hospital_id=$1 AND created_at>=current_date-($2::int) GROUP BY status ORDER BY status",[hid,days]);
    return {period_days:days,summary:r.rows[0],status_breakdown:status.rows};
  }
  throw new Error("Unknown AI tool");
}

export default async function(req,res){
  const requested=String(req.query?.tool||req.body?.tool||"").trim();
  if(req.method==="GET"){
    return res.json({version:"1",tools:TOOLS});
  }
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const definition=TOOLS.find(t=>t.name===requested);
  if(!definition)return res.status(404).json({error:"Unknown AI tool",available_tools:TOOLS.map(t=>t.name)});
  const ctx=await requirePermission(req,res,definition.permission);
  if(!ctx)return;
  try{
    const input=req.body?.input&&typeof req.body.input==="object"?req.body.input:{};
    const result=await runTool(definition.name,input,ctx.hospitalId);
    return res.json({tool:definition.name,read_only:true,result});
  }catch(e){
    return res.status(400).json({tool:definition.name,error:String(e?.message||e)});
  }
}