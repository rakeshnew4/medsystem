import { db } from "hatchable";
import { requireStaff, requirePermission } from "../lib/authz.js";

export const access = "user";

export default async function(req,res) {
  try {
    const staff=await requireStaff(req);
    await requirePermission(staff,"action.communication.use");
    const doctorId=Number(req.query?.doctor_id||0);
    if (!doctorId) return res.status(400).json({error:"doctor_id required"});
    const date=req.query?.date || new Date().toISOString().slice(0,10);
    const d=new Date(date+"T12:00:00Z");
    const dow=d.getUTCDay();
    const rules=await db.query("SELECT * FROM doctor_availability_rules WHERE hospital_id=$1 AND doctor_id=$2 AND day_of_week=$3 AND active=true ORDER BY start_time",[staff.hospital_id,doctorId,dow]);
    const ex=await db.query("SELECT * FROM doctor_availability_exceptions WHERE hospital_id=$1 AND doctor_id=$2 AND exception_date=$3 ORDER BY start_time",[staff.hospital_id,doctorId,date]);
    const presence=await db.query("SELECT sp.* FROM staff_presence sp JOIN staff_profiles s ON s.id=sp.staff_id WHERE sp.hospital_id=$1 AND s.doctor_id=$2",[staff.hospital_id,doctorId]);
    res.json({doctor_id:doctorId,date,day_of_week:dow,rules:rules.rows,exceptions:ex.rows,presence:presence.rows[0]||null});
  } catch(e) { res.status(e.status||500).json({error:e.message||"Doctor availability error"}); }
}