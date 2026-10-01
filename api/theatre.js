import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
import { notifyRoles } from "../lib/staff-notifications.js";

export const access="user";
export const methods=["GET","POST","PUT"];
const allowedStatus=["scheduled","in_progress","completed","cancelled"];
function iso(v){ return v ? new Date(v) : null; }

export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.theatre.manage");
 if(!ctx)return;

 if(req.method==="GET"){
   const id=Number(req.query?.id||0);
   if(id){
     const r=await db.query(`SELECT t.*,p.name patient_name,p.uhid,d.name doctor_name,r.name theatre_room_name,a.admission_number
       FROM theatre_procedures t JOIN patients p ON p.id=t.patient_id
       LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN theatre_rooms r ON r.id=t.theatre_room_id
       LEFT JOIN admissions a ON a.id=t.admission_id
       WHERE t.id=$1 AND t.hospital_id=$2 LIMIT 1`,[id,ctx.hospitalId]);
     if(!r.rows[0])return res.status(404).json({error:"Procedure not found"});
     return res.json(r.rows[0]);
   }
   const r=await db.query(`SELECT t.*,p.name patient_name,p.uhid,d.name doctor_name,r.name theatre_room_name,a.admission_number
     FROM theatre_procedures t JOIN patients p ON p.id=t.patient_id
     LEFT JOIN doctors d ON d.id=t.doctor_id LEFT JOIN theatre_rooms r ON r.id=t.theatre_room_id
     LEFT JOIN admissions a ON a.id=t.admission_id
     WHERE t.hospital_id=$1 ORDER BY COALESCE(t.scheduled_start,t.created_at) DESC LIMIT 300`,[ctx.hospitalId]);
   return res.json(r.rows);
 }

 const b=req.body||{};
 if(req.method==="POST"){
   if(!b.patient_id||!String(b.procedure_name||"").trim())return res.status(400).json({error:"Patient and procedure name are required"});
   const patient=await db.query("SELECT id FROM patients WHERE id=$1 AND hospital_id=$2",[b.patient_id,ctx.hospitalId]);
   if(!patient.rows[0])return res.status(404).json({error:"Patient not found"});
   let admissionId=b.admission_id?Number(b.admission_id):null;
   let encounterId=b.encounter_id?Number(b.encounter_id):null;
   if(admissionId){
     const a=await db.query("SELECT id,patient_id,discharged_at FROM admissions WHERE id=$1 AND hospital_id=$2",[admissionId,ctx.hospitalId]);
     if(!a.rows[0]||Number(a.rows[0].patient_id)!==Number(b.patient_id))return res.status(409).json({error:"Admission does not belong to patient"});
     if(a.rows[0].discharged_at)return res.status(409).json({error:"Discharged admission cannot receive a new procedure"});
     const e=await db.query("SELECT id FROM care_encounters WHERE admission_id=$1 AND hospital_id=$2 AND status='open' ORDER BY created_at DESC LIMIT 1",[admissionId,ctx.hospitalId]);
     if(!encounterId&&e.rows[0])encounterId=e.rows[0].id;
   }
   const start=iso(b.scheduled_start),end=iso(b.scheduled_end);
   if(start&&isNaN(start))return res.status(400).json({error:"Invalid scheduled_start"});
   if(end&&isNaN(end))return res.status(400).json({error:"Invalid scheduled_end"});
   if(start&&end&&end<=start)return res.status(400).json({error:"scheduled_end must be after scheduled_start"});
   if(b.theatre_room_id&&start){
     const conflict=await db.query(`SELECT id FROM theatre_procedures
       WHERE hospital_id=$1 AND theatre_room_id=$2 AND status IN ('scheduled','in_progress')
       AND scheduled_start IS NOT NULL AND ($3::timestamptz < COALESCE(scheduled_end,scheduled_start+interval '1 hour'))
       AND ($4::timestamptz > scheduled_start) LIMIT 1`,
       [ctx.hospitalId,b.theatre_room_id,start,end||new Date(start.getTime()+3600000)]);
     if(conflict.rows[0])return res.status(409).json({error:"Theatre room is already scheduled for another procedure"});
   }
   const r=await db.query(`INSERT INTO theatre_procedures
     (hospital_id,patient_id,admission_id,encounter_id,doctor_id,theatre_room_id,procedure_name,status,scheduled_start,scheduled_end,clinical_notes,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9,$10,$11) RETURNING *`,
     [ctx.hospitalId,b.patient_id,admissionId,encounterId,b.doctor_id||null,b.theatre_room_id||null,String(b.procedure_name).trim(),start,end,b.clinical_notes||null,ctx.user.email]);
   const row=r.rows[0];
   await logWorkflowEvent(ctx,{patientId:b.patient_id,eventType:"procedure_scheduled",stage:"theatre",entityType:"theatre_procedure",entityId:row.id,metadata:{procedure_name:row.procedure_name,admission_id:admissionId,theatre_room_id:b.theatre_room_id||null}});
   return res.json(row);
 }
 const id=Number(b.id||0);
 if(!id)return res.status(400).json({error:"Procedure id is required"});
 if(!allowedStatus.includes(b.status))return res.status(400).json({error:"Invalid procedure status"});
 const cur=await db.query("SELECT * FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",[id,ctx.hospitalId]);
 if(!cur.rows[0])return res.status(404).json({error:"Procedure not found"});
 const old=cur.rows[0].status;
 const transitions={scheduled:["in_progress","cancelled"],in_progress:["completed"],completed:[],cancelled:[]};
 if(!transitions[old]?.includes(b.status))return res.status(409).json({error:"Invalid transition from "+old+" to "+b.status});
 if(b.status==="completed"&&!String(b.outcome||"").trim())return res.status(400).json({error:"Outcome is required to complete a procedure"});
 const now=new Date();
 const r=await db.query(`UPDATE theatre_procedures SET status=$1,
   started_at=CASE WHEN $1='in_progress' THEN COALESCE(started_at,$6) ELSE started_at END,
   completed_at=CASE WHEN $1='completed' THEN $6 ELSE completed_at END,
   cancelled_at=CASE WHEN $1='cancelled' THEN $6 ELSE cancelled_at END,
   clinical_notes=COALESCE($2,clinical_notes),outcome=COALESCE($3,outcome),updated_at=now()
   WHERE id=$4 AND hospital_id=$5 RETURNING *`,
   [b.status,b.clinical_notes||null,b.outcome||null,id,ctx.hospitalId,now]);
 const row=r.rows[0];
 await logWorkflowEvent(ctx,{patientId:row.patient_id,eventType:"procedure_"+b.status,stage:"theatre",entityType:"theatre_procedure",entityId:id,metadata:{from:old,to:b.status}});
 return res.json(row);
}