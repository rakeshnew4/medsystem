import { db } from "hatchable";
import { requireStaff, requirePermission } from "../lib/authz.js";

export const access = "user";

const STATUS = ["available","working","lunch","outside","meeting","unavailable","off_duty","custom"];

function todayDow(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay();
}

function hmMinutes(v) {
  if (!v) return null;
  const [h,m] = String(v).slice(0,5).split(":").map(Number);
  return h * 60 + m;
}

function currentWindow(windows, nowMin) {
  return windows.find(w => {
    const s = hmMinutes(w.start_time), e = hmMinutes(w.end_time);
    return s !== null && e !== null && (e >= s ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e);
  }) || null;
}

async function context(req,res) {
  const ctx = await requirePermission(req,res,"action.communication.use");
  if(!ctx)return null;
  return {...ctx.staff,hospital_id:ctx.hospitalId,user:ctx.user};
}

export default async function(req,res) {
  try {
    const staff = await context(req,res);
    if(!staff)return;
    const method = req.method;
    const action = req.query?.action || "overview";

    if (method === "GET") {
      if (action === "schedule") {
        const staffId = Number(req.query?.staff_id || staff.id);
        const doctorId = Number(req.query?.doctor_id || 0);
        const [schedules, exceptions, doctorRules, doctorExceptions] = await Promise.all([
          db.query("SELECT * FROM staff_schedules WHERE hospital_id=$1 AND staff_id=$2 ORDER BY day_of_week,start_time",[staff.hospital_id,staffId]),
          db.query("SELECT * FROM staff_schedule_exceptions WHERE hospital_id=$1 AND staff_id=$2 ORDER BY exception_date DESC,start_time",[staff.hospital_id,staffId]),
          doctorId ? db.query("SELECT * FROM doctor_availability_rules WHERE hospital_id=$1 AND doctor_id=$2 ORDER BY day_of_week,start_time",[staff.hospital_id,doctorId]) : {rows:[]},
          doctorId ? db.query("SELECT * FROM doctor_availability_exceptions WHERE hospital_id=$1 AND doctor_id=$2 ORDER BY exception_date DESC,start_time",[staff.hospital_id,doctorId]) : {rows:[]}
        ]);
        res.json({schedules:schedules.rows,exceptions:exceptions.rows,doctor_rules:doctorRules.rows,doctor_exceptions:doctorExceptions.rows});
        return;
      }
      const rows = await db.query(`
        SELECT sp.*, s.display_name, s.role, s.doctor_id
        FROM staff_presence sp JOIN staff_profiles s ON s.id=sp.staff_id
        WHERE sp.hospital_id=$1 AND s.active=true ORDER BY s.display_name
      `,[staff.hospital_id]);
      res.json({presence:rows.rows});
      return;
    }

    if (method === "POST") {
      const b=req.body||{};
      if (action === "presence") {
        if (!STATUS.includes(b.status)) return res.status(400).json({error:"Invalid status"});
        const expected=b.expected_until ? new Date(b.expected_until) : null;
        const r=await db.query(`
          INSERT INTO staff_presence(hospital_id,staff_id,status,status_text,expected_until,started_at,updated_at)
          VALUES($1,$2,$3,$4,$5,now(),now())
          ON CONFLICT(staff_id) DO UPDATE SET status=EXCLUDED.status,status_text=EXCLUDED.status_text,expected_until=EXCLUDED.expected_until,started_at=now(),updated_at=now()
          RETURNING *
        `,[staff.hospital_id,staff.id,b.status,b.status_text||null,expected]);
        res.json(r.rows[0]); return;
      }
      if (action === "schedule") {
        if (staff.role !== "admin" && Number(b.staff_id||staff.id)!==staff.id) return res.status(403).json({error:"Only admins can edit another staff schedule"});
        const target=Number(b.staff_id||staff.id);
        const r=await db.query(`INSERT INTO staff_schedules(hospital_id,staff_id,day_of_week,start_time,end_time,schedule_type,location) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[staff.hospital_id,target,b.day_of_week,b.start_time,b.end_time,b.schedule_type||"work",b.location||null]);
        res.json(r.rows[0]); return;
      }
      if (action === "exception") {
        if (staff.role !== "admin" && Number(b.staff_id||staff.id)!==staff.id) return res.status(403).json({error:"Only admins can edit another staff schedule"});
        const target=Number(b.staff_id||staff.id);
        const r=await db.query(`INSERT INTO staff_schedule_exceptions(hospital_id,staff_id,exception_date,start_time,end_time,exception_type,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[staff.hospital_id,target,b.exception_date,b.start_time||null,b.end_time||null,b.exception_type,b.reason||null,b.notes||null]);
        res.json(r.rows[0]); return;
      }
      if (action === "doctor-rule") {
        if (staff.role !== "admin" && staff.role !== "doctor") return res.status(403).json({error:"Not allowed"});
        let doctorId=Number(b.doctor_id||staff.doctor_id||0);
        if (staff.role!=="admin") doctorId=staff.doctor_id;
        if (!doctorId) return res.status(400).json({error:"Doctor profile is required"});
        const r=await db.query(`INSERT INTO doctor_availability_rules(hospital_id,doctor_id,day_of_week,start_time,end_time,appointment_type,slot_duration_minutes,max_patients) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[staff.hospital_id,doctorId,b.day_of_week,b.start_time,b.end_time,b.appointment_type||"opd",Number(b.slot_duration_minutes||15),b.max_patients?Number(b.max_patients):null]);
        res.json(r.rows[0]); return;
      }
      if (action === "doctor-exception") {
        if (staff.role !== "admin" && staff.role !== "doctor") return res.status(403).json({error:"Not allowed"});
        let doctorId=Number(b.doctor_id||staff.doctor_id||0);
        if (staff.role!=="admin") doctorId=staff.doctor_id;
        if (!doctorId) return res.status(400).json({error:"Doctor profile is required"});
        const r=await db.query(`INSERT INTO doctor_availability_exceptions(hospital_id,doctor_id,exception_date,start_time,end_time,exception_type,reason,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[staff.hospital_id,doctorId,b.exception_date,b.start_time||null,b.end_time||null,b.exception_type,b.reason||null,b.notes||null]);
        res.json(r.rows[0]); return;
      }
    }

    if (method === "DELETE") {
      const table = action==="schedule" ? "staff_schedules" : action==="exception" ? "staff_schedule_exceptions" : action==="doctor-rule" ? "doctor_availability_rules" : "doctor_availability_exceptions";
      const id=Number(req.query?.id||0);
      if (!id) return res.status(400).json({error:"id required"});
      const r=await db.query(`DELETE FROM ${table} WHERE id=$1 AND hospital_id=$2 RETURNING id`,[id,staff.hospital_id]);
      res.json({deleted:r.rowCount>0}); return;
    }

    res.status(405).json({error:"Method not supported"});
  } catch(e) { res.status(e.status||500).json({error:e.message||"Availability error"}); }
}