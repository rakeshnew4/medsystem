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
   const rooms=await db.query("SELECT id,name,code,status,notes FROM theatre_rooms WHERE hospital_id=$1 ORDER BY name",[ctx.hospitalId]);
   const catalog=await db.query("SELECT id,name,code,default_duration_minutes,service_type,active FROM theatre_procedure_catalog WHERE hospital_id=$1 ORDER BY active DESC,name",[ctx.hospitalId]);
   const team=await db.query("SELECT pt.id,pt.procedure_id,pt.staff_id,pt.team_role,pt.notes,pt.created_by,pt.created_at,s.display_name,s.email,s.role AS staff_role,d.name AS doctor_name FROM theatre_procedure_team pt JOIN staff_profiles s ON s.id=pt.staff_id AND s.hospital_id=pt.hospital_id LEFT JOIN doctors d ON d.id=s.doctor_id WHERE pt.hospital_id=$1 ORDER BY pt.created_at",[ctx.hospitalId]);
   return res.json({procedures:r.rows,rooms:rooms.rows,catalog:catalog.rows,team:team.rows});
 }

 const b=req.body||{};
 if(req.method==="POST" && ["room","procedure_master"].includes(String(b.action||""))){
   if(ctx.staff.role!=="admin")return res.status(403).json({error:"Only administrators can change Theatre master data"});
   if(b.action==="room"){
     const name=String(b.name||"").trim(); if(!name)return res.status(400).json({error:"Theatre room name is required"});
     const r=await db.query("INSERT INTO theatre_rooms(hospital_id,name,code,status,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",[ctx.hospitalId,name,String(b.code||"").trim()||null,b.status||"available",b.notes||null]);
     return res.json(r.rows[0]);
   }
   const name=String(b.name||"").trim(); if(!name)return res.status(400).json({error:"Procedure name is required"});
   const serviceType=String(b.service_type||"procedure");
   if(!["procedure","theatre_service","professional_fee","medicine"].includes(serviceType))return res.status(400).json({error:"Invalid Theatre service type"});
   const duration=b.default_duration_minutes==null||b.default_duration_minutes===""?null:Number(b.default_duration_minutes);
   if(duration!==null&&(!Number.isFinite(duration)||duration<=0))return res.status(400).json({error:"Invalid default duration"});
   const r=await db.query("INSERT INTO theatre_procedure_catalog(hospital_id,name,code,default_duration_minutes,service_type,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[ctx.hospitalId,name,String(b.code||"").trim()||null,duration,serviceType,b.active!==false]);
   return res.json(r.rows[0]);
 }
 if(req.method==="POST" && b.action==="team_add"){
   const procedureId=Number(b.procedure_id||0);
   const staffId=Number(b.staff_id||0);
   const teamRole=String(b.team_role||"").trim();
   const allowedTeamRoles=["surgeon","assistant_surgeon","anesthetist","nurse","technician","other"];
   if(!procedureId||!staffId||!allowedTeamRoles.includes(teamRole))return res.status(400).json({error:"Procedure, staff and a valid surgical team role are required"});
   const proc=await db.query("SELECT id,patient_id,status FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",[procedureId,ctx.hospitalId]);
   if(!proc.rows[0])return res.status(404).json({error:"Procedure not found"});
   if(proc.rows[0].status==="cancelled")return res.status(409).json({error:"Cancelled procedures cannot receive surgical team members"});
   const staff=await db.query("SELECT id,display_name,email,role FROM staff_profiles WHERE id=$1 AND hospital_id=$2 AND active=true",[staffId,ctx.hospitalId]);
   if(!staff.rows[0])return res.status(404).json({error:"Active staff member not found"});
   const r=await db.query("INSERT INTO theatre_procedure_team(hospital_id,procedure_id,staff_id,team_role,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(hospital_id,procedure_id,staff_id,team_role) DO NOTHING RETURNING *",[ctx.hospitalId,procedureId,staffId,teamRole,String(b.notes||"").trim()||null,ctx.user.email]);
   if(!r.rows[0])return res.status(409).json({error:"This staff member is already assigned to the procedure in this role"});
   await logWorkflowEvent(ctx,{patientId:proc.rows[0].patient_id,eventType:"theatre_team_member_added",stage:"theatre",entityType:"theatre_procedure",entityId:procedureId,metadata:{staff_id:staffId,team_role:teamRole}});
   return res.json(r.rows[0]);
 }
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
     const e=await db.query("SELECT id,patient_id,admission_id FROM care_encounters WHERE admission_id=$1 AND hospital_id=$2 AND patient_id=$3 AND status='open' ORDER BY created_at DESC LIMIT 1",[admissionId,ctx.hospitalId,b.patient_id]);
     if(!encounterId&&e.rows[0])encounterId=e.rows[0].id;
     if(!encounterId)return res.status(409).json({error:"An open IPD encounter is required for an admission-linked Theatre procedure"});
   }
   if(encounterId){
     const e=await db.query("SELECT id,patient_id,admission_id,status FROM care_encounters WHERE id=$1 AND hospital_id=$2",[encounterId,ctx.hospitalId]);
     if(!e.rows[0]||Number(e.rows[0].patient_id)!==Number(b.patient_id)||e.rows[0].status!=="open")return res.status(409).json({error:"Theatre encounter must be an open encounter for this patient and hospital"});
     if(admissionId&&Number(e.rows[0].admission_id)!==admissionId)return res.status(409).json({error:"Theatre encounter does not belong to the selected admission"});
   }
   const roomId=Number(b.theatre_room_id||0);
   if(!roomId)return res.status(400).json({error:"Theatre room is required"});
   const room=await db.query("SELECT id,status FROM theatre_rooms WHERE id=$1 AND hospital_id=$2",[roomId,ctx.hospitalId]);
   if(!room.rows[0])return res.status(404).json({error:"Theatre room not found"});
   if(room.rows[0].status!=="available")return res.status(409).json({error:"Theatre room is not available"});
   let doctorId=b.doctor_id?Number(b.doctor_id):null;
   if(doctorId){
     const doctor=await db.query("SELECT id FROM doctors WHERE id=$1 AND hospital_id=$2",[doctorId,ctx.hospitalId]);
     if(!doctor.rows[0])return res.status(409).json({error:"Responsible doctor does not belong to this hospital"});
   }
   const start=iso(b.scheduled_start),end=iso(b.scheduled_end);
   if(start&&isNaN(start))return res.status(400).json({error:"Invalid scheduled_start"});
   if(end&&isNaN(end))return res.status(400).json({error:"Invalid scheduled_end"});
   if(start&&end&&end<=start)return res.status(400).json({error:"scheduled_end must be after scheduled_start"});
   const r=await db.query("WITH lock AS (SELECT pg_advisory_xact_lock(hashtextextended(('theatre-room:'||$1||':'||$2)::text,0))), room_state AS (SELECT id FROM theatre_rooms WHERE id=$2 AND hospital_id=$1 AND status='available'), conflict AS (SELECT id FROM theatre_procedures WHERE hospital_id=$1 AND theatre_room_id=$2 AND status IN ('scheduled','in_progress') AND scheduled_start IS NOT NULL AND ($3::timestamptz < COALESCE(scheduled_end,scheduled_start+interval '1 hour')) AND ($4::timestamptz > scheduled_start) LIMIT 1) INSERT INTO theatre_procedures (hospital_id,patient_id,admission_id,encounter_id,doctor_id,theatre_room_id,procedure_name,status,scheduled_start,scheduled_end,clinical_notes,created_by) SELECT $1,$5,$6,$7,$8,$2,$9,'scheduled',$3,$4,$10,$11 FROM lock JOIN room_state ON true WHERE NOT EXISTS (SELECT 1 FROM conflict) RETURNING *", [ctx.hospitalId,roomId,start,end,b.patient_id,admissionId,encounterId,doctorId,String(b.procedure_name).trim(),b.clinical_notes||null,ctx.user.email]);
   if(!r.rows[0])return res.status(409).json({error:"Theatre room is already scheduled for another procedure"});
   const row=r.rows[0];
   await logWorkflowEvent(ctx,{patientId:b.patient_id,eventType:"procedure_scheduled",stage:"theatre",entityType:"theatre_procedure",entityId:row.id,metadata:{procedure_name:row.procedure_name,admission_id:admissionId,theatre_room_id:roomId}});
   return res.json(row);
 }
 if(req.method==="PUT" && ["room","procedure_master"].includes(String(b.action||""))){
   if(ctx.staff.role!=="admin")return res.status(403).json({error:"Only administrators can change Theatre master data"});
   const id=Number(b.id||0); if(!id)return res.status(400).json({error:"Master-data id is required"});
   if(b.action==="room"){
     const r=await db.query("UPDATE theatre_rooms SET name=COALESCE(NULLIF($1,''),name),code=$2,status=$3,notes=$4 WHERE id=$5 AND hospital_id=$6 RETURNING *",[String(b.name||"").trim(),String(b.code||"").trim()||null,b.status||"available",b.notes||null,id,ctx.hospitalId]);
     if(!r.rows[0])return res.status(404).json({error:"Theatre room not found"});
     return res.json(r.rows[0]);
   }
   const duration=b.default_duration_minutes==null||b.default_duration_minutes===""?null:Number(b.default_duration_minutes);
   if(duration!==null&&(!Number.isFinite(duration)||duration<=0))return res.status(400).json({error:"Invalid default duration"});
   const r=await db.query("UPDATE theatre_procedure_catalog SET name=COALESCE(NULLIF($1,''),name),code=$2,default_duration_minutes=$3,service_type=$4,active=$5,updated_at=now() WHERE id=$6 AND hospital_id=$7 RETURNING *",[String(b.name||"").trim(),String(b.code||"").trim()||null,duration,b.service_type||"procedure",b.active!==false,id,ctx.hospitalId]);
   if(!r.rows[0])return res.status(404).json({error:"Procedure master record not found"});
   return res.json(r.rows[0]);
 }
 if(req.method==="PUT" && b.action==="team_remove"){
   const id=Number(b.id||0);
   if(!id)return res.status(400).json({error:"Team member id is required"});
   const r=await db.query("DELETE FROM theatre_procedure_team pt USING theatre_procedures t WHERE pt.id=$1 AND pt.procedure_id=t.id AND pt.hospital_id=$2 AND t.hospital_id=$2 AND t.status NOT IN ('completed','cancelled') RETURNING pt.*,t.patient_id",[id,ctx.hospitalId]);
   if(!r.rows[0])return res.status(404).json({error:"Team member not found or procedure is already closed"});
   await logWorkflowEvent(ctx,{patientId:r.rows[0].patient_id,eventType:"theatre_team_member_removed",stage:"theatre",entityType:"theatre_procedure",entityId:r.rows[0].procedure_id,metadata:{team_member_id:id}});
   return res.json({ok:true,id});
 }
 if(req.method==="PUT" && b.action==="ward_return"){
   const id=Number(b.id||0); if(!id)return res.status(400).json({error:"Procedure id is required"});
   const cur=await db.query("SELECT * FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",[id,ctx.hospitalId]);
   if(!cur.rows[0])return res.status(404).json({error:"Procedure not found"});
   if(cur.rows[0].status!=="completed")return res.status(409).json({error:"Only completed procedures can be returned to the ward"});
   if(cur.rows[0].ward_returned_at)return res.status(409).json({error:"Procedure has already been returned to the ward"});
   if(!cur.rows[0].admission_id)return res.status(409).json({error:"Only admission-linked Theatre procedures can be returned to the ward"});
   if(!cur.rows[0].encounter_id)return res.status(409).json({error:"Theatre ward return requires the linked IPD encounter"});
   if(cur.rows[0].admission_id){
     const a=await db.query("SELECT id,patient_id,discharged_at FROM admissions WHERE id=$1 AND hospital_id=$2",[cur.rows[0].admission_id,ctx.hospitalId]);
     if(!a.rows[0]||Number(a.rows[0].patient_id)!==Number(cur.rows[0].patient_id))return res.status(409).json({error:"Procedure admission no longer matches its patient"});
     if(a.rows[0].discharged_at)return res.status(409).json({error:"A discharged admission cannot receive a Theatre ward return"});
     if(cur.rows[0].encounter_id){
       const e=await db.query("SELECT id,status,admission_id,patient_id FROM care_encounters WHERE id=$1 AND hospital_id=$2",[cur.rows[0].encounter_id,ctx.hospitalId]);
       if(!e.rows[0]||e.rows[0].status!=="open"||Number(e.rows[0].patient_id)!==Number(cur.rows[0].patient_id)||Number(e.rows[0].admission_id)!==Number(cur.rows[0].admission_id))return res.status(409).json({error:"Theatre ward return requires the current open IPD encounter"});
     }
   }
   const r=await db.query("UPDATE theatre_procedures SET ward_returned_at=now(),ward_return_notes=$1,ward_returned_by=$2,updated_at=now() WHERE id=$3 AND hospital_id=$4 AND status='completed' AND ward_returned_at IS NULL RETURNING *",[String(b.notes||"").trim()||null,ctx.user.email,id,ctx.hospitalId]);
   if(!r.rows[0])return res.status(409).json({error:"Procedure has already been returned to the ward"});
   const row=r.rows[0];
   if(row.encounter_id)await db.query("UPDATE care_encounters SET current_stage='ipd',updated_at=now() WHERE id=$1 AND hospital_id=$2 AND status='open'",[row.encounter_id,ctx.hospitalId]);
   await logWorkflowEvent(ctx,{patientId:row.patient_id,encounterId:row.encounter_id||null,eventType:"theatre_returned_to_ward",stage:"ipd",entityType:"theatre_procedure",entityId:id,metadata:{ward_return_notes:row.ward_return_notes}});
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
 if((b.status==="in_progress"||b.status==="completed")&&cur.rows[0].admission_id){
   const a=await db.query("SELECT id,patient_id,discharged_at FROM admissions WHERE id=$1 AND hospital_id=$2",[cur.rows[0].admission_id,ctx.hospitalId]);
   if(!a.rows[0]||Number(a.rows[0].patient_id)!==Number(cur.rows[0].patient_id))return res.status(409).json({error:"Procedure admission no longer matches its patient"});
   if(a.rows[0].discharged_at)return res.status(409).json({error:"A discharged admission cannot continue a Theatre procedure"});
   if(cur.rows[0].encounter_id){
     const e=await db.query("SELECT id,status,admission_id,patient_id FROM care_encounters WHERE id=$1 AND hospital_id=$2",[cur.rows[0].encounter_id,ctx.hospitalId]);
     if(!e.rows[0]||e.rows[0].status!=="open"||Number(e.rows[0].patient_id)!==Number(cur.rows[0].patient_id)||Number(e.rows[0].admission_id)!==Number(cur.rows[0].admission_id))return res.status(409).json({error:"Theatre lifecycle requires the current open IPD encounter"});
   }
 }
 const now=new Date();
 const r=await db.query(`UPDATE theatre_procedures SET status=$1,
   started_at=CASE WHEN $1='in_progress' THEN COALESCE(started_at,$6) ELSE started_at END,
   completed_at=CASE WHEN $1='completed' THEN $6 ELSE completed_at END,
   cancelled_at=CASE WHEN $1='cancelled' THEN $6 ELSE cancelled_at END,
   clinical_notes=COALESCE($2,clinical_notes),outcome=COALESCE($3,outcome),updated_at=now()
   WHERE id=$4 AND hospital_id=$5 AND status=$7 RETURNING *`,
   [b.status,b.clinical_notes||null,b.outcome||null,id,ctx.hospitalId,now,old]);
   if(!r.rows[0])return res.status(409).json({error:"Procedure changed before this transition was applied; refresh and retry"});
 const row=r.rows[0];
 await logWorkflowEvent(ctx,{patientId:row.patient_id,eventType:"procedure_"+b.status,stage:"theatre",entityType:"theatre_procedure",entityId:id,metadata:{from:old,to:b.status}});
 return res.json(row);
}