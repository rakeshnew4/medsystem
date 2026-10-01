import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.queue");
  if(!ctx)return;
  const q=await db.query("SELECT q.*,p.name AS patient_name,p.phone,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL ORDER BY CASE q.stage WHEN 'waiting' THEN 0 WHEN 'vitals' THEN 1 WHEN 'doctor' THEN 2 WHEN 'in_room' THEN 3 WHEN 'lab' THEN 4 WHEN 'followup' THEN 5 WHEN 'pharmacy' THEN 6 ELSE 7 END,CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,q.token_number NULLS LAST,q.checked_in_at,q.id",[ctx.hospitalId]);
  const grouped={waiting:[],vitals:[],doctor:[],lab:[],followup:[],pharmacy:[],completed:[]};
  for(const x of q.rows){if(grouped[x.stage])grouped[x.stage].push(x);else grouped.waiting.push(x);}
  res.json(grouped);
}