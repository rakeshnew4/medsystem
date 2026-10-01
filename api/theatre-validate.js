import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
import { logWorkflowEvent } from "../lib/workflow.js";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.theatre.manage");
  if(!ctx)return;

  const b=req.body||{};
  const procedureId=Number(b.procedure_id||0);
  if(!procedureId)return res.status(400).json({error:"Procedure id is required"});

  const proc=await db.query(
    "SELECT id,patient_id,status,validated_at FROM theatre_procedures WHERE id=$1 AND hospital_id=$2",
    [procedureId,ctx.hospitalId]
  );
  if(!proc.rows[0])return res.status(404).json({error:"Procedure not found"});
  if(proc.rows[0].status!=="completed")return res.status(409).json({error:"Only completed procedures can be validated"});
  if(proc.rows[0].validated_at)return res.status(409).json({error:"Procedure is already validated"});

  const charges=await db.query(
    "SELECT count(*) FILTER (WHERE invoice_id IS NULL OR invoice_item_id IS NULL) AS unlinked,count(*) AS total FROM theatre_charges WHERE hospital_id=$1 AND procedure_id=$2",
    [ctx.hospitalId,procedureId]
  );
  const unlinked=Number(charges.rows[0]?.unlinked||0);
  const total=Number(charges.rows[0]?.total||0);
  if(unlinked>0){
    return res.status(409).json({
      error:"All Theatre charges must be linked to invoice lines before validation",
      unlinked_charges:unlinked,
      total_charges:total
    });
  }

  const r=await db.query(
    "UPDATE theatre_procedures SET validated_at=now(),validated_by=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 AND status='completed' AND validated_at IS NULL RETURNING *",
    [ctx.user.email,procedureId,ctx.hospitalId]
  );
  if(!r.rows[0])return res.status(409).json({error:"Procedure changed before validation; refresh and retry"});

  await logWorkflowEvent(ctx,{
    patientId:r.rows[0].patient_id,
    eventType:"theatre_procedure_validated",
    stage:"theatre",
    entityType:"theatre_procedure",
    entityId:procedureId,
    metadata:{validated_by:ctx.user.email}
  });

  return res.json(r.rows[0]);
}