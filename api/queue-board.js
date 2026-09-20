import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,"page.queue");
  if(!ctx)return;
  const q=await db.query("SELECT q.*,p.name AS patient_name,p.phone,d.name AS doctor_name FROM queue_entries q JOIN patients p ON p.id=q.patient_id LEFT JOIN doctors d ON d.id=q.doctor_id WHERE q.hospital_id=$1 AND q.completed_at IS NULL ORDER BY q.checked_in_at",[ctx.hospitalId]);
  const grouped={waiting:[],vitals:[],doctor:[],lab:[],followup:[],pharmacy:[],completed:[]};
  for(const x of q.rows){if(grouped[x.stage])grouped[x.stage].push(x);else grouped.waiting.push(x);}
  res.json(grouped);
}