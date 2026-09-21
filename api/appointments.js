import { db } from "hatchable";
import { requirePermission } from "../lib/authz.js";
export const access="user";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
  const ctx=await requirePermission(req,res,req.method==="GET"?"page.appointments":"action.appointment.create");
  if(!ctx)return;
  const hid=ctx.hospitalId;
  if(req.method==="POST"){
    const b=req.body||{};
    if(!b.patient_name||!String(b.patient_name).trim()||!b.doctor_id||!b.appointment_date||!b.appointment_time)return res.status(400).json({error:"Patient name, doctor, date and time are required"});
    const apDate=String(b.appointment_date), apTime=String(b.appointment_time).slice(0,5);
    const dt=new Date(apDate+"T12:00:00Z"), dow=dt.getUTCDay();
    const rules=await db.query("SELECT start_time,end_time FROM doctor_availability_rules WHERE hospital_id=$1 AND doctor_id=$2 AND day_of_week=$3 AND active=true",[hid,b.doctor_id,dow]);
    const ex=await db.query("SELECT start_time,end_time,exception_type FROM doctor_availability_exceptions WHERE hospital_id=$1 AND doctor_id=$2 AND exception_date=$3",[hid,b.doctor_id,apDate]);
    const sp=await db.query("SELECT sp.status,sp.expected_until FROM staff_presence sp JOIN staff_profiles s ON s.id=sp.staff_id WHERE sp.hospital_id=$1 AND s.doctor_id=$2",[hid,b.doctor_id]);
    const toMin=t=>{const p=String(t).slice(0,5).split(":").map(Number);return p[0]*60+p[1]};
    const tm=toMin(apTime);
    let open=!rules.rows.length;
    if(rules.rows.some(x=>tm>=toMin(x.start_time)&&tm<toMin(x.end_time)))open=true;
    for(const x of ex.rows){if(["leave","unavailable","closed"].includes(String(x.exception_type).toLowerCase())){const s=x.start_time?toMin(x.start_time):0,e=x.end_time?toMin(x.end_time):1440;if(tm>=s&&tm<e)open=false}}
    const p=sp.rows[0]; const today=new Date().toISOString().slice(0,10);
    if(apDate===today&&p&&["lunch","outside","meeting","unavailable","off_duty","custom"].includes(p.status)){const until=p.expected_until?new Date(p.expected_until):null;const now=new Date();if(!until||new Date(apDate+"T"+apTime+":00")<until)open=false}
    if(!open)return res.status(409).json({error:"Doctor is not available for this time slot"});
    let patient=null;
    if(b.patient_phone){const r=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND phone=$2 ORDER BY id LIMIT 1",[hid,String(b.patient_phone).trim()]);patient=r.rows[0]||null}
    if(!patient){const r=await db.query("SELECT id,name,phone FROM patients WHERE hospital_id=$1 AND lower(trim(name))=lower(trim($2)) ORDER BY id LIMIT 1",[hid,String(b.patient_name).trim()]);patient=r.rows[0]||null}
    if(!patient){const r=await db.query("INSERT INTO patients(hospital_id,name,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,name,phone",[hid,String(b.patient_name).trim(),b.patient_phone||null,b.patient_email||null,"Created from appointment booking"]);patient=r.rows[0]}
    const r=await db.query("INSERT INTO appointments(hospital_id,patient_id,doctor_id,appointment_date,appointment_time,status,source,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,appointment_date,appointment_time,status,patient_id",[hid,patient.id,b.doctor_id,b.appointment_date,b.appointment_time,b.status||"pending",b.source||"reception",b.reason||null]);
    return res.json({...r.rows[0],patient});
  }
  if(req.method==="PUT"){
    const b=req.body||{};
    if(b.action==="move"){
      const q=await db.query("SELECT patient_id,doctor_id FROM appointments WHERE id=$1 AND hospital_id=$2",[b.id,hid]);
      if(!q.rows[0])return res.status(404).json({error:"Appointment not found"});
      const stage=b.stage||"waiting";
      const existing=await db.query("SELECT id FROM queue_entries WHERE hospital_id=$1 AND appointment_id=$2 AND completed_at IS NULL LIMIT 1",[hid,b.id]);
      let qr;
      if(existing.rows[0]) qr=await db.query("UPDATE queue_entries SET stage=$1,doctor_id=$2,updated_at=now(),started_at=CASE WHEN $1 IN ('vitals','doctor','lab','followup') AND started_at IS NULL THEN now() ELSE started_at END WHERE id=$3 RETURNING id,stage",[stage,q.rows[0].doctor_id,existing.rows[0].id]);
      else qr=await db.query("INSERT INTO queue_entries(hospital_id,patient_id,appointment_id,doctor_id,stage,priority,reason) VALUES($1,$2,$3,$4,$5,'normal','Appointment') RETURNING id,stage",[hid,q.rows[0].patient_id,b.id,q.rows[0].doctor_id,stage]);
      await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3",["checked_in",b.id,hid]);
      return res.json({ok:true,queue:qr.rows[0]});
    }
    const allowed=["pending","confirmed","checked_in","completed","no_show","cancelled"];
    if(b.status&&!allowed.includes(b.status))return res.status(400).json({error:"Invalid appointment status"});
    const r=await db.query("UPDATE appointments SET status=$1,updated_at=now() WHERE id=$2 AND hospital_id=$3 RETURNING id,status",[b.status,b.id,hid]);
    return res.json(r.rows[0]||{error:"Appointment not found"});
  }
  const r=await db.query("SELECT a.id,a.appointment_date,a.appointment_time,a.status,a.patient_id,a.doctor_id,a.reason,p.name AS patient_name,p.phone,d.name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.hospital_id=$1 ORDER BY a.appointment_date DESC,a.appointment_time DESC LIMIT 300",[hid]);
  res.json(r.rows);
}