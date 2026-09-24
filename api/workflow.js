import { db } from "../lib/db.js";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET"];

export default async function(req,res){
  const ctx=await requirePermission(req,res,"action.clinical.view");
  if(!ctx)return;
  const pid=Number(req.query?.patient_id);
  if(!pid)return res.status(400).json({error:"patient_id is required"});

  const [events,encounter] = await Promise.all([
    db.query(
      "SELECT e.id,e.event_type,e.stage,e.entity_type,e.entity_id,e.metadata,e.created_at,s.display_name AS actor_name,s.role AS actor_role FROM workflow_events e LEFT JOIN staff_profiles s ON s.id=e.actor_staff_id WHERE e.hospital_id=$1 AND e.patient_id=$2 ORDER BY e.created_at DESC,e.id DESC LIMIT 100",
      [ctx.hospitalId,pid]
    ),
    db.query(
      "SELECT id,encounter_type,appointment_id,admission_id,status,current_stage,priority,started_at,ended_at,reason FROM care_encounters WHERE hospital_id=$1 AND patient_id=$2 AND status='open' ORDER BY started_at DESC LIMIT 5",
      [ctx.hospitalId,pid]
    )
  ]);
  res.json({events:events.rows,open_encounters:encounter.rows});
}