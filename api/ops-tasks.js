import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 const ctx=await requirePermission(req,res,req.method==="GET"?"page.admin_insights":"action.communication.use");if(!ctx)return;
 if(req.method==="GET"){
  const r=await db.query("SELECT t.*,p.name AS patient_name,s.display_name AS assignee_name FROM ops_tasks t LEFT JOIN patients p ON p.id=t.patient_id LEFT JOIN staff_profiles s ON s.id=t.assigned_staff_id WHERE t.hospital_id=$1 ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,t.due_at NULLS LAST,t.created_at DESC LIMIT 300",[ctx.hospitalId]);return res.json(r.rows);
 }
 const b=req.body||{};
 if(req.method==="POST"){if(!b.title)return res.status(400).json({error:"Task title is required"});const r=await db.query("INSERT INTO ops_tasks(hospital_id,patient_id,encounter_id,title,description,department,assigned_staff_id,priority,status,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10) RETURNING *",[ctx.hospitalId,b.patient_id||null,b.encounter_id||null,b.title,b.description||null,b.department||null,b.assigned_staff_id||null,b.priority||"normal",b.due_at||null,ctx.user.email]);return res.json(r.rows[0]);}
 if(!b.id)return res.status(400).json({error:"Task id is required"});const r=await db.query("UPDATE ops_tasks SET status=$1,assigned_staff_id=COALESCE($2,assigned_staff_id),updated_at=now(),completed_at=CASE WHEN $1='completed' THEN now() ELSE completed_at END,completed_by=CASE WHEN $1='completed' THEN $3 ELSE completed_by END WHERE id=$4 AND hospital_id=$5 RETURNING *",[b.status||"in_progress",b.assigned_staff_id||null,ctx.user.email,b.id,ctx.hospitalId]);return res.json(r.rows[0]||{error:"Task not found"});
}