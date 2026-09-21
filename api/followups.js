import { db } from "hatchable"; import { requirePermission } from "../lib/authz.js";
export const access="user"; export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.followups":"action.followups.manage");if(!ctx)return;const hid=ctx.hospitalId,b=req.body||{};
 if(req.method==="POST"){if(!b.patient_id||!b.due_date)return res.status(400).json({error:"Patient and follow-up date are required"});const r=await db.query("INSERT INTO followups(hospital_id,patient_id,doctor_id,due_date,status,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[hid,b.patient_id,b.doctor_id||null,b.due_date,b.status||"due",b.notes||null]);return res.json(r.rows[0])}
 if(req.method==="PUT"){const r=await db.query("UPDATE followups SET due_date=$1,status=$2,notes=$3,updated_at=now() WHERE id=$4 AND hospital_id=$5 RETURNING *",[b.due_date,b.status||"due",b.notes||null,b.id,hid]);return res.json(r.rows[0]||{error:"Follow-up not found"})}
 const r=await db.query("SELECT f.*,p.name AS patient_name,d.name AS doctor_name FROM followups f JOIN patients p ON p.id=f.patient_id LEFT JOIN doctors d ON d.id=f.doctor_id WHERE f.hospital_id=$1 ORDER BY f.due_date LIMIT 200",[hid]);res.json(r.rows)
}