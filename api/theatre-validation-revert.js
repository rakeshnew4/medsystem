import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.theatre.validation_revert");
  if(!ctx)return;
  const b=req.body||{};
  const procedureId=Number(b.procedure_id||0);
  const reason=String(b.reason||"").trim();
  if(!procedureId)return res.status(400).json({error:"Procedure id is required"});
  if(reason.length<3)return res.status(400).json({error:"A validation revert reason is required"});

  const cur=await db.query("SELECT id,patient_id,status,validated_at FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",[procedureId,ctx.hospitalId]);
  if(!cur.rows[0])return res.status(404).json({error:"Procedure not found"});
  if(cur.rows[0].status!=="completed")return res.status(409).json({error:"Only completed procedures can have validation reverted"});
  if(!cur.rows[0].validated_at)return res.status(409).json({error:"Procedure is not currently validated"});

  const r=await db.query("UPDATE theatre_procedures SET validated_at=NULL,validated_by=NULL,validation_reverted_at=now(),validation_reverted_by=$1,validation_revert_reason=$2,updated_at=now() WHERE id=$3 AND hospital_id=$4 AND status='completed' AND validated_at IS NOT NULL RETURNING *",[ctx.user.email,reason,procedureId,ctx.hospitalId]);
  if(!r.rows[0])return res.status(409).json({error:"Procedure changed before validation could be reverted; refresh and retry"});

  await logWorkflowEvent(ctx,{patientId:r.rows[0].patient_id,eventType:"theatre_procedure_validation_reverted",stage:"theatre",entityType:"theatre_procedure",entityId:procedureId,metadata:{reverted_by:ctx.user.email,reason}});
  return res.json(r.rows[0]);
}