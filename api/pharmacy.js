import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";
export const access="user";
export const methods=["GET","POST"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.clinical.view":"action.pharmacy.manage"); if(!ctx)return;
 if(req.method==="GET"){
  const pid=req.query?.patient_id;
  const r=await db.query("SELECT pd.*,m.medicine_name,m.dose,m.frequency,m.duration FROM pharmacy_dispenses pd LEFT JOIN medications m ON m.id=pd.medication_id WHERE pd.hospital_id=$1 AND ($2::bigint IS NULL OR pd.patient_id=$2) ORDER BY pd.dispensed_at DESC LIMIT 300",[ctx.hospitalId,pid||null]);return res.json(r.rows);
 }
 const b=req.body||{};if(!b.patient_id)return res.status(400).json({error:"patient_id is required"});
 const r=await db.query("INSERT INTO pharmacy_dispenses(hospital_id,patient_id,medication_id,encounter_id,quantity,dispensed_by,status,notes) VALUES($1,$2,$3,$4,$5,$6,'dispensed',$7) RETURNING *",[ctx.hospitalId,b.patient_id,b.medication_id||null,b.encounter_id||null,Number(b.quantity||1),ctx.user.email,b.notes||null]);
 await logWorkflowEvent(ctx,{patientId:b.patient_id,encounterId:b.encounter_id||null,eventType:"medicine_dispensed",stage:"pharmacy",entityType:"pharmacy_dispense",entityId:r.rows[0].id,metadata:{quantity:Number(b.quantity||1)}});
 return res.json(r.rows[0]);
}