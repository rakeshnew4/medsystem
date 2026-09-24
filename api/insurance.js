import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"action.billing.manage":"action.billing.manage");if(!ctx)return;
 if(req.method==="GET"){const r=await db.query("SELECT * FROM insurance_claims WHERE hospital_id=$1 AND ($2::bigint IS NULL OR patient_id=$2) ORDER BY created_at DESC LIMIT 200",[ctx.hospitalId,req.query?.patient_id||null]);return res.json(r.rows)}
 const b=req.body||{};if(!b.patient_id||!b.payer_name)return res.status(400).json({error:"patient_id and payer_name are required"});
 if(req.method==="POST"){const r=await db.query("INSERT INTO insurance_claims(hospital_id,patient_id,admission_id,payer_name,policy_number,claim_number,status,claimed_amount,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[ctx.hospitalId,b.patient_id,b.admission_id||null,b.payer_name,b.policy_number||null,b.claim_number||null,b.status||"pending",Number(b.claimed_amount||0),b.notes||null]);return res.json(r.rows[0])}
 const r=await db.query("UPDATE insurance_claims SET status=$1,approved_amount=$2,notes=COALESCE($3,notes),updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING *",[b.status||"pending",Number(b.approved_amount||0),b.notes||null,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Claim not found"});
}